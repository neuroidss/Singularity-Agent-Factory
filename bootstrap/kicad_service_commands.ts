// bootstrap/kicad_service_commands.ts
export const KICAD_SERVICE_COMMANDS_SCRIPT = `
import os
import sys
import json
import subprocess
import time
import re
import zipfile
import glob
import traceback
import ast
import fcntl
import shutil
from math import sqrt

# --- Deferred Heavy Imports ---
# These will be imported once when the service starts
pcbnew = None
skidl = None
dsn_utils = None
ses_utils = None

def _initialize_libraries():
    """Initializes heavy libraries on first use."""
    global pcbnew, skidl, dsn_utils, ses_utils
    if pcbnew is None:
        try:
            sys.path.insert(0, '/usr/lib/python3/dist-packages')
            import pcbnew as pcbnew_lib
            pcbnew = pcbnew_lib
            print("INFO: pcbnew loaded successfully.", file=sys.stderr)
        except ImportError:
            raise RuntimeError("KiCad's pcbnew library not found. The service cannot function.")
    if skidl is None:
        try:
            import skidl as skidl_lib
            skidl = skidl_lib
            print("INFO: skidl loaded successfully.", file=sys.stderr)
        except ImportError:
            raise RuntimeError("SKiDL library not found. The service cannot function.")
    if dsn_utils is None:
        try:
            import kicad_dsn_utils as dsn_utils_lib
            dsn_utils = dsn_utils_lib
            print("INFO: kicad_dsn_utils loaded successfully.", file=sys.stderr)
        except ImportError:
            raise RuntimeError("kicad_dsn_utils.py not found.")
    if ses_utils is None:
        try:
            import kicad_ses_utils as ses_utils_lib
            ses_utils = ses_utils_lib
            print("INFO: kicad_ses_utils loaded successfully.", file=sys.stderr)
        except ImportError:
            raise RuntimeError("kicad_ses_utils.py not found.")

# --- State File Configuration ---
STATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(STATE_DIR, exist_ok=True)
FREEROUTING_JAR_PATH = os.path.join(os.path.dirname(__file__), 'freerouting.jar')

# --- Utility Functions ---
class AutoStopper:
    def __init__(self, patience=50, low_progress_threshold=10.0):
        self.patience = patience
        self.low_progress_threshold = low_progress_threshold
        self.low_progress_count = 0

    def __call__(self, msg_text):
        match = re.search(r"(?:making|There were only) (\\\\d+\\\\.?\\\\d*) changes", msg_text)
        if match:
            changes = float(match.group(1))
            if changes < self.low_progress_threshold:
                self.low_progress_count += 1
            else:
                self.low_progress_count = 0
        if self.low_progress_count >= self.patience:
            print(f"INFO: Stopping autorouter due to low progress.", file=sys.stderr)
            return True
        return False

def get_state_path(board_name, suffix):
    return os.path.join(STATE_DIR, f"{board_name}_{suffix}")

def add_rule_to_state(project_name, rule_object):
    state_file = get_state_path(project_name, 'state.json')
    lock_path = state_file + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            if 'rules' not in state: state['rules'] = []
            state['rules'].append(rule_object)
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)

# --- Service Command Implementations ---

def get_layer_geometry_info(footprint, layer_id):
    """
    Calculates the bounding box and shape type for graphical items on a specific layer, EXCLUDING TEXT.
    Returns (dimensions_dict, shape_string).
    """
    _initialize_libraries()
    layer_name = pcbnew.BOARD.GetStandardLayerName(layer_id)
    print(f"DEBUG: Processing '{footprint.GetReference()}' for layer '{layer_name}'", file=sys.stderr)
    
    # All graphical items can include text, shapes, etc.
    all_graphical_items = list(footprint.GraphicalItems())
    
    # Filter for items ONLY on the requested layer
    items_on_layer = [item for item in all_graphical_items if item.GetLayer() == layer_id]
    
    if items_on_layer:
        print(f"DEBUG: Found {len(items_on_layer)} graphical items on layer '{layer_name}':", file=sys.stderr)
        for i, item in enumerate(items_on_layer):
            item_class = item.GetClass()
            # For PCB_TEXT or subclasses, show the text content
            text_content = f" Text='{item.GetText()}'" if hasattr(item, 'GetText') and callable(item.GetText) else ""
            print(f"  - Item {i}: Type={item_class}{text_content}", file=sys.stderr)

    # Explicitly filter for PCB_SHAPE, which excludes PCB_TEXT and PCB_FIELD.
    shape_items = [
        item for item in items_on_layer 
        if isinstance(item, pcbnew.PCB_SHAPE)
    ]
    print(f"DEBUG: Filtered to {len(shape_items)} PCB_SHAPE items for bbox calculation.", file=sys.stderr)
    
    if not shape_items:
        print(f"DEBUG: No usable geometry found on layer '{layer_name}'. Returning None.", file=sys.stderr)
        return None, 'rectangle'

    bbox = pcbnew.BOX2I()
    is_likely_circle = False
    if len(shape_items) == 1:
        item = shape_items[0]
        item_shape_enum = item.GetShape()
        if isinstance(item, pcbnew.PCB_SHAPE) and item_shape_enum == pcbnew.S_CIRCLE:
            is_likely_circle = True
        elif isinstance(item, pcbnew.PAD) and item_shape_enum == pcbnew.PAD_SHAPE_CIRCLE:
            is_likely_circle = True

    for item in shape_items:
        bbox.Merge(item.GetBoundingBox())

    if not bbox.IsValid():
        return None, 'rectangle'

    if is_likely_circle:
        diameter = max(bbox.GetWidth(), bbox.GetHeight())
        return {'width': pcbnew.ToMM(diameter), 'height': pcbnew.ToMM(diameter)}, 'circle'
    
    return {'width': pcbnew.ToMM(bbox.GetWidth()), 'height': pcbnew.ToMM(bbox.GetHeight())}, 'rectangle'


def define_component(payload):
    _initialize_libraries()
    state_file = get_state_path(payload['projectName'], 'state.json')
    lock_path = state_file + '.lock'
    new_component = {}
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            if 'components' not in state: state['components'] = []

            svg_path_rel, glb_path_rel = None, None
            pins_data = []

            try:
                footprint_id = payload.get('footprintIdentifier', '')
                fp = None
                if footprint_id and ':' in footprint_id:
                    library_name, footprint_name = footprint_id.split(':', 1)
                    
                    system_footprint_dir = os.environ.get('KICAD_FOOTPRINT_DIR', '/usr/share/kicad/footprints')
                    if not os.path.isdir(system_footprint_dir): system_footprint_dir = '/usr/share/kicad/modules'
                    custom_footprint_dir = os.path.join(STATE_DIR, 'footprints')
                    
                    system_library_path = os.path.join(system_footprint_dir, f"{library_name}.pretty")
                    custom_library_path = os.path.join(custom_footprint_dir, f"{library_name}.pretty")

                    library_path_to_use = None
                    if os.path.isdir(custom_library_path): library_path_to_use = custom_library_path
                    elif os.path.isdir(system_library_path): library_path_to_use = system_library_path
                    
                    fp = pcbnew.FootprintLoad(library_path_to_use, footprint_name) if library_path_to_use else None
                
                # Initialize all dimension fields to None
                fab_f_dimensions, fab_f_shape, fab_b_dimensions, fab_b_shape = None, 'rectangle', None, 'rectangle'
                crtyd_f_dimensions, crtyd_f_shape, crtyd_b_dimensions, crtyd_b_shape = None, 'rectangle', None, 'rectangle'
                placeholder_dimensions, placeholder_shape, drc_dimensions, drc_shape = None, 'rectangle', None, 'rectangle'

                if fp:
                    is_bottom_side = fp.GetLayer() == pcbnew.B_Cu
                    
                    fab_f_dimensions, fab_f_shape = get_layer_geometry_info(fp, pcbnew.F_Fab)
                    fab_b_dimensions, fab_b_shape = get_layer_geometry_info(fp, pcbnew.B_Fab)
                    crtyd_f_dimensions, crtyd_f_shape = get_layer_geometry_info(fp, pcbnew.F_CrtYd)
                    crtyd_b_dimensions, crtyd_b_shape = get_layer_geometry_info(fp, pcbnew.B_CrtYd)
                    
                    # Determine placeholder dimensions (visuals) - strictly from Fab layer
                    placeholder_dimensions = fab_b_dimensions if is_bottom_side and fab_b_dimensions else fab_f_dimensions
                    placeholder_shape = fab_b_shape if is_bottom_side and fab_b_dimensions else fab_f_shape
                    
                    # Determine DRC dimensions (physics) - from CrtYd with fallback to Fab
                    drc_dimensions = (crtyd_b_dimensions if is_bottom_side and crtyd_b_dimensions else crtyd_f_dimensions) or \
                                     (fab_b_dimensions if is_bottom_side and fab_b_dimensions else fab_f_dimensions)
                    drc_shape = (crtyd_b_shape if is_bottom_side and crtyd_b_dimensions else crtyd_f_shape) or \
                                (fab_b_shape if is_bottom_side and fab_b_dimensions else fab_f_shape)
                    
                    # If placeholder is still missing, fallback to overall bbox
                    if not placeholder_dimensions:
                        bbox = fp.GetBoundingBox(False, False)
                        placeholder_dimensions = {'width': pcbnew.ToMM(bbox.GetWidth()), 'height': pcbnew.ToMM(bbox.GetHeight())}
                        placeholder_shape = 'rectangle' # Can't determine shape from bbox alone
                    
                    # If DRC is still missing, it must equal the placeholder
                    if not drc_dimensions:
                        drc_dimensions = placeholder_dimensions
                        drc_shape = placeholder_shape
                    
                    # --- Asset Generation ---
                    # Use the full identifier for the filename to ensure uniqueness across libraries.
                    sanitized_footprint_id = re.sub(r'[\\\\/:*?"<>|]+', '_', footprint_id.replace(':', '_'))

                    if payload.get('exportSVG'):
                        final_svg_filename = f"{sanitized_footprint_id}.svg"
                        final_svg_path_abs = os.path.join(STATE_DIR, final_svg_filename)
                        
                        if os.path.exists(final_svg_path_abs):
                            svg_path_rel = os.path.join('assets', final_svg_filename).replace(os.path.sep, '/')
                        else:
                            try:
                                # kicad-cli creates a file named after the footprint_name, not the full ID
                                temp_svg_path = os.path.join(STATE_DIR, f"{footprint_name}.svg")
                                if os.path.exists(temp_svg_path): os.remove(temp_svg_path)

                                cli_command = [ 'kicad-cli', 'fp', 'export', 'svg', '--footprint', footprint_name, '--output', STATE_DIR, '--layers', 'F.Cu,F.Courtyard', '--black-and-white', library_path_to_use ]
                                subprocess.run(cli_command, check=True, capture_output=True, text=True)
                                
                                if os.path.exists(temp_svg_path):
                                    os.rename(temp_svg_path, final_svg_path_abs)
                                    svg_path_rel = os.path.join('assets', final_svg_filename).replace(os.path.sep, '/')
                                else:
                                    print(f"WARNING: kicad-cli did not generate expected SVG at {temp_svg_path}", file=sys.stderr)
                            except subprocess.CalledProcessError as e:
                                print(f"ERROR: kicad-cli SVG export failed for {footprint_id}. Stderr: {e.stderr}", file=sys.stderr)
                    
                    if payload.get('exportGLB'):
                        final_glb_filename = f"{sanitized_footprint_id}.glb"
                        final_glb_path_abs = os.path.join(STATE_DIR, final_glb_filename)

                        if os.path.exists(final_glb_path_abs):
                            glb_path_rel = os.path.join('assets', final_glb_filename).replace(os.path.sep, '/')
                        else:
                            temp_pcb_path = None
                            try:
                                temp_board = pcbnew.BOARD()
                                temp_board.Add(fp)
                                temp_pcb_path = os.path.join(STATE_DIR, '_temp_fp_board.kicad_pcb')
                                pcbnew.SaveBoard(temp_pcb_path, temp_board)
                                glb_cmd = ['kicad-cli', 'pcb', 'export', 'glb', '--output', final_glb_path_abs, '--subst-models', '--force', temp_pcb_path]
                                subprocess.run(glb_cmd, check=True, capture_output=True, text=True)
                                if os.path.exists(final_glb_path_abs):
                                    glb_path_rel = os.path.join('assets', final_glb_filename).replace(os.path.sep, '/')
                            except subprocess.CalledProcessError as e:
                                print(f"ERROR: kicad-cli GLB export failed for {footprint_id}. Stderr: {e.stderr}", file=sys.stderr)
                            finally:
                                if temp_pcb_path and os.path.exists(temp_pcb_path):
                                    os.remove(temp_pcb_path)
                    
                    for pad in fp.Pads():
                        pad_pos = pad.GetPosition()
                        pins_data.append({"name": str(pad.GetPadName()), "x": pcbnew.ToMM(pad_pos.x), "y": pcbnew.ToMM(pad_pos.y), "rotation": pad.GetOrientationDegrees()})
            except Exception as e:
                print(f"WARNING: Footprint processing error for {payload.get('footprintIdentifier')}: {e}", file=sys.stderr)

            new_component = {
                "ref": payload['componentReference'], "part": payload['componentDescription'], "value": payload['componentValue'],
                "footprint": payload['footprintIdentifier'], "pin_count": payload.get('numberOfPins', 0),
                "svgPath": svg_path_rel, "glbPath": glb_path_rel,
                "pins": pins_data, "side": payload.get('side', 'top'),
                "placeholder_dimensions": placeholder_dimensions,
                "placeholder_shape": placeholder_shape,
                "drc_dimensions": drc_dimensions,
                "drc_shape": drc_shape
            }
            state['components'] = [c for c in state['components'] if c['ref'] != new_component['ref']]
            state['components'].append(new_component)
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
    return {"message": f"Component '{payload['componentReference']}' defined.", "component": new_component}

def define_net(payload):
    state_file = get_state_path(payload['projectName'], 'state.json')
    lock_path = state_file + '.lock'
    new_net = {}
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            if 'nets' not in state: state['nets'] = []
            
            pins_data = payload.get('pins', [])
            if isinstance(pins_data, str):
                 pins_data = ast.literal_eval(pins_data)
            
            new_net = { "name": payload['netName'], "pins": pins_data }
            state['nets'] = [n for n in state['nets'] if n['name'] != new_net['name']]
            state['nets'].append(new_net)
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)
    return {"message": f"Net '{payload['netName']}' defined.", "net": new_net}

def add_absolute_position_constraint(payload):
    if 'x' not in payload and 'y' not in payload:
        raise ValueError("Absolute Position Constraint requires at least an 'x' or a 'y' coordinate.")

    rule = {"type": "AbsolutePositionConstraint", "component": payload['componentReference'], "enabled": True}
    message_parts = []
    if 'x' in payload:
        rule['x'] = payload['x']
        message_parts.append(f"x={payload['x']}")
    if 'y' in payload:
        rule['y'] = payload['y']
        message_parts.append(f"y={payload['y']}")
    
    add_rule_to_state(payload['projectName'], rule)
    message = f"Rule added: Lock {payload['componentReference']} to ({', '.join(message_parts)})."
    return {"message": message, "rule": rule}

def add_proximity_constraint(payload):
    groups = json.loads(payload['groupsJSON'])
    rule = {"type": "ProximityConstraint", "groups": groups, "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Proximity constraint for {len(groups)} groups.", "rule": rule}
    
def add_alignment_constraint(payload):
    components = json.loads(payload['componentsJSON'])
    rule = {"type": "AlignmentConstraint", "axis": payload['axis'], "components": components, "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Align {len(components)} components.", "rule": rule}

def add_symmetry_constraint(payload):
    pairs = json.loads(payload['pairsJSON'])
    rule = {"type": "SymmetryConstraint", "axis": payload['axis'], "pairs": pairs, "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Symmetry for {len(pairs)} pairs.", "rule": rule}

def add_circular_constraint(payload):
    components = json.loads(payload['componentsJSON'])
    rule = {"type": "CircularConstraint", "components": components, "radius": payload['radius'], "center": [payload['centerX'], payload['centerY']], "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Circular arrangement for {len(components)} components.", "rule": rule}

def add_layer_constraint(payload):
    components = json.loads(payload['componentsJSON'])
    rule = {"type": "LayerConstraint", "layer": payload['layer'], "components": components, "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Place {len(components)} components on {payload['layer']}.", "rule": rule}

def add_fixed_property_constraint(payload):
    properties = json.loads(payload['propertiesJSON'])
    rule = {"type": "FixedPropertyConstraint", "component": payload['componentReference'], "properties": properties, "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Fix properties for {payload['componentReference']}.", "rule": rule}

def add_symmetrical_pair_constraint(payload):
    pair = json.loads(payload['pairJSON'])
    rule = {"type": "SymmetricalPairConstraint", "pair": pair, "axis": payload['axis'], "separation": payload['separation'], "enabled": True}
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Symmetrical pair for {pair[0]}/{pair[1]}.", "rule": rule}

def generate_netlist(payload):
    _initialize_libraries()
    skidl.reset()
    state_file = get_state_path(payload['projectName'], 'state.json')
    if not os.path.exists(state_file):
        raise FileNotFoundError("State file not found.")
    state = json.load(open(state_file))
    circuit = skidl.Circuit()
    with circuit:
        for comp_data in state.get("components", []):
            part_value = comp_data.get('value', '')
            pin_count = comp_data.get('pin_count', 0)
            if ':' in part_value and pin_count == 0:
                lib, name = part_value.split(':', 1)
                skidl.Part(lib=f"{lib}.kicad_sym", name=name, ref=comp_data['ref'], footprint=comp_data['footprint'])
            else:
                p = skidl.Part(tool=skidl.SKIDL, name=comp_data['part'], ref=comp_data['ref'], footprint=comp_data['footprint'])
                p.value = comp_data['value']
                if pin_count > 0: p += [skidl.Pin(num=i) for i in range(1, pin_count + 1)]
        for net_obj in state.get("nets", []):
            net = skidl.Net(net_obj['name'])
            pins_to_connect = []
            for pin_str in net_obj['pins']:
                ref, pin_num = re.match(r'([A-Za-z0-9_]+)-([0-9A-Za-z_]+)', pin_str).groups()
                part = next((p for p in circuit.parts if str(p.ref) == ref), None)
                if part: pins_to_connect.append(part[pin_num])
            net += tuple(pins_to_connect)
            
    netlist_path = get_state_path(payload['projectName'], 'netlist.net')
    circuit.generate_netlist(file_=netlist_path)
    return {"message": "Netlist generated successfully."}

def create_initial_pcb(payload):
    _initialize_libraries()
    netlist_path = get_state_path(payload['projectName'], 'netlist.net')
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(netlist_path):
        raise FileNotFoundError("Netlist file not found.")

    custom_footprints_path = os.path.join(STATE_DIR, 'footprints')
    command = ['kinet2pcb', '-i', netlist_path, '-o', pcb_path, '-l', '.']
    if os.path.isdir(custom_footprints_path):
        command.extend(['-l', custom_footprints_path])

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise Exception(f"kinet2pcb failed. Stderr: {e.stderr}. Stdout: {e.stdout}") from e
    
    # Load the newly created board and set its copper layer count to 4.
    board = pcbnew.LoadBoard(pcb_path)
    board.SetCopperLayerCount(4)
    pcbnew.SaveBoard(pcb_path, board)
    
    return {"message": "Initial 4-layer PCB created."}

def create_board_outline(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        raise FileNotFoundError("PCB file not found.")
    board = pcbnew.LoadBoard(pcb_path)
    for drawing in list(board.GetDrawings()):
        if drawing.GetLayerName() == 'Edge.Cuts':
            board.Remove(drawing)
    
    if payload.get('shape') == 'circle':
        diameter_mm = payload.get('diameterMillimeters', 0)
        # Auto-sizing logic for circle...
        radius_nm = pcbnew.FromMM(diameter_mm / 2.0)
        center = pcbnew.VECTOR2I(0,0)
        circle = pcbnew.PCB_SHAPE(board)
        circle.SetShape(pcbnew.S_CIRCLE)
        circle.SetLayer(pcbnew.Edge_Cuts)
        circle.SetStart(center)
        circle.SetEnd(pcbnew.VECTOR2I(center.x + radius_nm, center.y))
        board.Add(circle)
        message = f"Circular board outline created (diameter: {diameter_mm:.2f}mm)."
    else:
        width_mm, height_mm = payload.get('boardWidthMillimeters', 20), payload.get('boardHeightMillimeters', 20)
        w_nm, h_nm = pcbnew.FromMM(width_mm), pcbnew.FromMM(height_mm)
        x_offset, y_offset = -w_nm // 2, -h_nm // 2
        points = [ pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset) ]
        for i in range(len(points) - 1):
            seg = pcbnew.PCB_SHAPE(board)
            seg.SetShape(pcbnew.S_SEGMENT); seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1))
            board.Add(seg)
        message = f"Rectangular board outline created ({width_mm:.2f}mm x {height_mm:.2f}mm)."

    pcbnew.SaveBoard(pcb_path, board)
    return {"message": message}

def create_copper_pour(payload):
    _initialize_libraries()
    project_name = payload['projectName']
    layer_name = payload['layerName']
    net_name = payload['netName']
    
    pcb_path = get_state_path(project_name, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        raise FileNotFoundError(f"PCB file for project '{project_name}' not found.")
        
    board = pcbnew.LoadBoard(pcb_path)
    
    # Get the board outline to define the zone shape
    merged_outlines = dsn_utils.merge_all_drawings(board, 'Edge.Cuts')
    if not merged_outlines or not merged_outlines[0]:
        raise ValueError("Board outline (Edge.Cuts) is missing or empty. Cannot create copper pour.")
    
    zone_outline = pcbnew.SHAPE_POLY_SET()
    outline_contour = zone_outline.NewOutline()
    for point_tuple in merged_outlines[0]:
        x, y = point_tuple
        zone_outline.Append(int(x), int(y), outline_contour)

    # Find the net
    net_info = board.FindNet(net_name)
    if not net_info or net_info.GetNetCode() == 0:
        found = False
        for code, net in board.GetNetsByNetcode().items():
            if net.GetNetname().upper() == net_name.upper():
                net_info = net
                found = True
                break
        if not found:
            raise ValueError(f"Net '{net_name}' not found in the board.")
        
    layer_id = board.GetLayerID(layer_name)
    if layer_id == pcbnew.UNDEFINED_LAYER or not board.IsLayerEnabled(layer_id) or not pcbnew.IsCopperLayer(layer_id):
        raise ValueError(f"Layer '{layer_name}' is not a valid, enabled copper layer.")
        
    zone = pcbnew.ZONE(board)
    board.Add(zone)
    zone.SetLayer(layer_id)
    zone.SetNet(net_info)
    zone.SetOutline(zone_outline)
    
    zone.SetMinThickness(pcbnew.FromMM(0.25))
    zone.SetThermalReliefGap(pcbnew.FromMM(0.5))
    zone.SetThermalReliefSpokeWidth(pcbnew.FromMM(0.5))
    zone.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    zone.SetIsFilled(False)
    
    pcbnew.SaveBoard(pcb_path, board)
    
    return {"message": f"Copper pour created on layer '{layer_name}' for net '{net_name}'."}

def arrange_components(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    state_file = get_state_path(payload['projectName'], 'state.json')
    if not os.path.exists(pcb_path) or not os.path.exists(state_file):
        raise FileNotFoundError("PCB or State file not found.")
    board = pcbnew.LoadBoard(pcb_path)
    state_data = json.load(open(state_file))

    edge_cuts = dsn_utils.merge_all_drawings(board, 'Edge.Cuts')
    min_x, max_x, min_y, max_y = 0, 0, 0, 0
    if edge_cuts and edge_cuts[0]:
        all_x = [p[0] for p in edge_cuts[0]]; all_y = [p[1] for p in edge_cuts[0]]
        min_x, max_x, min_y, max_y = min(all_x), max(all_x), min(all_y), max(all_y)

    layout_data = {"nodes": [], "edges": [], "rules": state_data.get("rules", []), "layoutStrategy": payload.get("layoutStrategy", "agent"), "board_outline": {"x": pcbnew.ToMM(min_x), "y": pcbnew.ToMM(min_y), "width": pcbnew.ToMM(max_x - min_x), "height": pcbnew.ToMM(max_y - min_y)} }
    state_components_map = {comp['ref']: comp for comp in state_data.get('components', [])}
    for fp in board.Footprints():
        ref = fp.GetReference()
        state_comp = state_components_map.get(ref, {})
        layout_data["nodes"].append({
            "id": ref, "label": ref, "x": pcbnew.ToMM(fp.GetPosition().x), "y": pcbnew.ToMM(fp.GetPosition().y),
            "rotation": fp.GetOrientationDegrees(), "side": "bottom" if fp.IsFlipped() else "top",
            "svgPath": state_comp.get('svgPath'), "glbPath": state_comp.get('glbPath'),
            "pins": state_comp.get('pins', []), "footprint": state_comp.get('footprint'),
            "placeholder_dimensions": state_comp.get('placeholder_dimensions'),
            "placeholder_shape": state_comp.get('placeholder_shape'),
            "drc_dimensions": state_comp.get('drc_dimensions'),
            "drc_shape": state_comp.get('drc_shape'),
        })
    for net in state_data.get('nets', []):
        pins_on_net = net.get('pins', [])
        if len(pins_on_net) > 1:
            for i in range(len(pins_on_net)):
                for j in range(i + 1, len(pins_on_net)):
                    layout_data["edges"].append({ "source": pins_on_net[i], "target": pins_on_net[j], "label": net['name'] })

    return {"message": "Extracted layout data.", "layout_data": layout_data, "waitForUserInput": payload.get('waitForUserInput', True)}

def update_component_positions(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    board = pcbnew.LoadBoard(pcb_path)
    positions = json.loads(payload['componentPositionsJSON'])
    for ref, pos_data in positions.items():
        fp = board.FindFootprintByReference(ref)
        if fp:
            fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(pos_data['x']), pcbnew.FromMM(pos_data['y'])))
            fp.SetOrientation(pcbnew.EDA_ANGLE(float(pos_data.get('rotation', 0)), pcbnew.DEGREES_T))
            if pos_data.get('side') == 'bottom' and not fp.IsFlipped(): fp.SetLayerAndFlip(pcbnew.B_Cu)
            elif pos_data.get('side') == 'top' and fp.IsFlipped(): fp.SetLayerAndFlip(pcbnew.F_Cu)

    for drawing in list(board.GetDrawings()):
        if drawing.GetLayerName() == 'Edge.Cuts': board.Remove(drawing)
    footprints_bbox = pcbnew.BOX2I()
    for fp in board.Footprints(): footprints_bbox.Merge(fp.GetBoundingBox(True, False))
    margin_nm = pcbnew.FromMM(5)
    footprints_bbox.Inflate(margin_nm, margin_nm)
    x_offset, y_offset, w_nm, h_nm = footprints_bbox.GetX(), footprints_bbox.GetY(), footprints_bbox.GetWidth(), footprints_bbox.GetHeight()
    points = [ pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset) ]
    for i in range(len(points) - 1):
        seg = pcbnew.PCB_SHAPE(board); seg.SetShape(pcbnew.S_SEGMENT); seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1))
        board.Add(seg)

    pcbnew.SaveBoard(pcb_path, board)
    return {"message": "Component positions updated and board outline resized."}

def autoroute_pcb(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    dsn_path = get_state_path(payload['projectName'], 'design.dsn')
    ses_path = get_state_path(payload['projectName'], 'routed.ses')
    
    if not os.path.exists(pcb_path): raise FileNotFoundError("PCB file not found.")

    board = pcbnew.LoadBoard(pcb_path)
    dsn_content = dsn_utils.board_to_dsn(pcb_path, board)
    with open(dsn_path, 'w') as f: f.write(str(dsn_content))

    if not os.path.exists(FREEROUTING_JAR_PATH): raise FileNotFoundError(f"FreeRouting JAR not found at {FREEROUTING_JAR_PATH}")
    
    command = ["java", "-jar", FREEROUTING_JAR_PATH, "-de", dsn_path, "-do", ses_path, "-mp", "10", "-ep", "10"]
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace')
    
    auto_stopper = AutoStopper(patience=10, low_progress_threshold=5.0)
    stop_routing = False
    
    for line in iter(proc.stderr.readline, ''):
        print("FREEROUTING:", line.strip(), file=sys.stderr)
        if auto_stopper(line.strip()):
            proc.terminate()
            stop_routing = True
            break
    
    if not stop_routing: proc.wait()

    if proc.returncode != 0 and not stop_routing: raise Exception(f"FreeRouting failed. Last output: {proc.stderr.read()}")
    if not os.path.exists(ses_path): raise FileNotFoundError("Routed session file (.ses) not created.")
        
    for track in list(board.GetTracks()): board.Remove(track)
    
    ses_utils.parse_and_apply_ses(board, ses_path)
    pcbnew.SaveBoard(pcb_path, board)
    
    # SVG Plotting
    final_svg_path_abs = get_state_path(payload['projectName'], 'routed.svg')
    pctl = pcbnew.PLOT_CONTROLLER(board)
    popts = pctl.GetPlotOptions()
    popts.SetOutputDirectory(STATE_DIR)
    pctl.OpenPlotfile("routed", pcbnew.PLOT_FORMAT_SVG, "Routed board")
    for layer_id in [pcbnew.F_Cu, pcbnew.B_Cu, pcbnew.Edge_Cuts, pcbnew.F_SilkS, pcbnew.B_SilkS, pcbnew.F_Mask, pcbnew.B_Mask]:
        pctl.SetLayer(layer_id)
        pctl.PlotLayer()
    pctl.ClosePlot()
    temp_svg_path = os.path.join(STATE_DIR, "routed.svg")
    if os.path.exists(temp_svg_path):
        if os.path.exists(final_svg_path_abs): os.remove(final_svg_path_abs)
        os.rename(temp_svg_path, final_svg_path_abs)

    svg_rel_path = os.path.join('assets', os.path.basename(final_svg_path_abs)).replace(os.path.sep, '/')
    return {"message": "Autorouting complete. SVG preview generated.", "current_artifact": {"title": "Routed PCB", "path": svg_rel_path, "svgPath": svg_rel_path}}

def export_fabrication_files(payload):
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path): raise FileNotFoundError("PCB file not found.")

    fab_dir = os.path.join(STATE_DIR, f"{payload['projectName']}_fab")
    os.makedirs(fab_dir, exist_ok=True)

    try:
        layers = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"
        gerber_cmd = ['kicad-cli', 'pcb', 'export', 'gerbers', '--output', fab_dir, '--layers', layers, pcb_path]
        subprocess.run(gerber_cmd, check=True, capture_output=True, text=True)

        drill_cmd = ['kicad-cli', 'pcb', 'export', 'drill', '--output', fab_dir, pcb_path]
        subprocess.run(drill_cmd, check=True, capture_output=True, text=True)
        
        glb_path_rel = os.path.join('assets', f'{payload["projectName"]}_board.glb')
        glb_path_abs = os.path.join(os.path.dirname(__file__), '..', glb_path_rel)
        glb_cmd = ['kicad-cli', 'pcb', 'export', 'glb', '--output', glb_path_abs, '--subst-models', '--include-tracks', '--include-pads', '--include-zones', '--force', pcb_path]
        subprocess.run(glb_cmd, check=True, capture_output=True, text=True)

        zip_path_rel = os.path.join('assets', f"{payload['projectName']}_fab.zip")
        zip_path_abs = os.path.join(os.path.dirname(__file__), '..', zip_path_rel)
        with zipfile.ZipFile(zip_path_abs, 'w') as zf:
            for file in glob.glob(os.path.join(fab_dir, '*')):
                zf.write(file, os.path.basename(file))
        shutil.rmtree(fab_dir)

    except subprocess.CalledProcessError as e:
        raise Exception(f"kicad-cli failed. Command: '{' '.join(e.cmd)}'. Stderr: {e.stderr}")
    except Exception as e:
        raise Exception(f"An unexpected error occurred during fabrication export: {e}")

    return {"message": "Fabrication files exported and zipped.", "artifacts": { "boardName": payload['projectName'], "glbPath": glb_path_rel.replace(os.path.sep, '/'), "fabZipPath": zip_path_rel.replace(os.path.sep, '/') }}
`