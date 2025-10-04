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
            sys.path.insert(0, '/usr/lib/python3/dist-packages') # This can be problematic, better to rely on system path
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
DATASHEET_CACHE_DIR = os.path.join(STATE_DIR, 'datasheet_cache')
os.makedirs(DATASHEET_CACHE_DIR, exist_ok=True)
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

def query_entity_properties(payload):
    """
    [Vibe Engineering] Simulates fetching properties for a game entity.
    In a real implementation, this would query a live game state database.
    """
    target_id = payload.get('targetId', '')
    
    # This is a placeholder for a real database lookup.
    # We return different data based on the entity's name for demonstration.
    if 'mind_weaver' in target_id:
        return {
            "message": f"Insight gained for {target_id}",
            "properties": {
                "lore": "A schematic-creature woven from logic and psionic energy.",
                "physics": { "mass_kg": 25, "material": "Crystalline Silicon", "resonant_frequency_hz": 8192000 },
                "weaknesses": ["Resonant Vibrations", "Logic Bombs"]
            }
        }
    elif 'beetle' in target_id:
        return {
            "message": f"Insight gained for {target_id}",
            "properties": {
                "lore": "A creature whose core pulses with stable, regulated life force.",
                "physics": { "mass_kg": 0.5, "material": "Bioceramic Compound", "energy_output_v": 3.3 },
                "weaknesses": ["Energy Dampening Fields"]
            }
        }
    else:
         return {
            "message": f"Insight gained for {target_id}",
            "properties": { "lore": "An unknown entity.", "physics": { "mass_kg": 10 }, "weaknesses": ["Unknown"] }
        }

def read_datasheet_cache(payload):
    cache_key = payload.get('cacheKey')
    if not cache_key or '..' in cache_key or '/' in cache_key:
        raise ValueError("Invalid cache key.")
    
    file_path = os.path.join(DATASHEET_CACHE_DIR, cache_key)
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Cache entry not found for key: {cache_key}")
        
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    return {"message": "Cache read successfully.", "answer": data.get("answer")}

def write_datasheet_cache(payload):
    cache_key = payload.get('cacheKey')
    data_to_cache = payload.get('data')
    if not cache_key or '..' in cache_key or '/' in cache_key:
        raise ValueError("Invalid cache key.")
    if not data_to_cache:
        raise ValueError("No data provided to cache.")

    file_path = os.path.join(DATASHEET_CACHE_DIR, cache_key)
    
    with open(file_path, 'w') as f:
        json.dump(data_to_cache, f, indent=2)
        
    return {"message": f"Cache entry '{cache_key}' written successfully."}

def get_layer_geometry_info(footprint, layer_id):
    """
    Calculates the bounding box and shape type for graphical items on a specific layer, EXCLUDING TEXT.
    Returns (dimensions_dict, shape_string).
    """
    _initialize_libraries()
    layer_name = pcbnew.BOARD.GetStandardLayerName(layer_id)
    
    all_graphical_items = list(footprint.GraphicalItems())
    items_on_layer = [item for item in all_graphical_items if item.GetLayer() == layer_id]
    
    shape_items = [item for item in items_on_layer if isinstance(item, pcbnew.PCB_SHAPE)]
    
    if not shape_items:
        return None, 'rectangle'

    bbox = pcbnew.BOX2I()
    is_likely_circle = False
    if len(shape_items) == 1:
        item = shape_items[0]
        item_shape_enum = item.GetShape()
        if isinstance(item, pcbnew.PCB_SHAPE) and item_shape_enum == pcbnew.S_CIRCLE: is_likely_circle = True
        elif isinstance(item, pcbnew.PAD) and item_shape_enum == pcbnew.PAD_SHAPE_CIRCLE: is_likely_circle = True

    for item in shape_items:
        bbox.Merge(item.GetBoundingBox())

    if not bbox.IsValid(): return None, 'rectangle'

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
                    custom_footprint_dir = os.path.join(STATE_DIR, 'footprints')
                    
                    library_path_to_use = None
                    if os.path.isdir(os.path.join(custom_footprint_dir, f"{library_name}.pretty")): library_path_to_use = custom_footprint_dir
                    elif os.path.isdir(os.path.join(system_footprint_dir, f"{library_name}.pretty")): library_path_to_use = system_footprint_dir
                    
                    if library_path_to_use:
                        fp = pcbnew.FootprintLoad(os.path.join(library_path_to_use, f"{library_name}.pretty"), footprint_name)
                
                placeholder_dimensions, placeholder_shape, drc_dimensions, drc_shape = None, 'rectangle', None, 'rectangle'

                if fp:
                    is_bottom_side = fp.GetLayer() == pcbnew.B_Cu
                    fab_f_dimensions, fab_f_shape = get_layer_geometry_info(fp, pcbnew.F_Fab)
                    crtyd_f_dimensions, crtyd_f_shape = get_layer_geometry_info(fp, pcbnew.F_CrtYd)
                    
                    placeholder_dimensions = fab_f_dimensions
                    placeholder_shape = fab_f_shape
                    drc_dimensions = crtyd_f_dimensions or fab_f_dimensions
                    drc_shape = crtyd_f_shape or fab_f_shape
                    
                    if not placeholder_dimensions:
                        bbox = fp.GetBoundingBox(False, False)
                        placeholder_dimensions = {'width': pcbnew.ToMM(bbox.GetWidth()), 'height': pcbnew.ToMM(bbox.GetHeight())}
                    
                    if not drc_dimensions:
                        drc_dimensions, drc_shape = placeholder_dimensions, placeholder_shape
                    
                    sanitized_footprint_id = re.sub(r'[\\\\/:*?"<>|]+', '_', footprint_id.replace(':', '_'))

                    if payload.get('exportSVG'):
                        final_svg_filename = f"{sanitized_footprint_id}.svg"
                        final_svg_path_abs = os.path.join(STATE_DIR, final_svg_filename)
                        
                        if not os.path.exists(final_svg_path_abs):
                            try:
                                temp_svg_path = os.path.join(STATE_DIR, f"{footprint_name}.svg")
                                if os.path.exists(temp_svg_path): os.remove(temp_svg_path)
                                cli_command = [ 'kicad-cli', 'fp', 'export', 'svg', '--footprint', footprint_name, '--output', STATE_DIR, '--layers', 'F.Cu,F.Courtyard', '--black-and-white', os.path.join(library_path_to_use, f"{library_name}.pretty") ]
                                subprocess.run(cli_command, check=True, capture_output=True, text=True)
                                if os.path.exists(temp_svg_path): os.rename(temp_svg_path, final_svg_path_abs)
                            except subprocess.CalledProcessError as e:
                                print(f"ERROR: kicad-cli SVG export failed for {footprint_id}. Stderr: {e.stderr}", file=sys.stderr)
                        svg_path_rel = os.path.join('assets', final_svg_filename).replace(os.path.sep, '/')
                    
                    if payload.get('exportGLB'):
                        final_glb_filename = f"{sanitized_footprint_id}.glb"
                        final_glb_path_abs = os.path.join(STATE_DIR, final_glb_filename)
                        if not os.path.exists(final_glb_path_abs):
                            temp_pcb_path = None
                            try:
                                temp_board = pcbnew.BOARD(); temp_board.Add(fp)
                                temp_pcb_path = os.path.join(STATE_DIR, '_temp_fp_board.kicad_pcb')
                                pcbnew.SaveBoard(temp_pcb_path, temp_board)
                                glb_cmd = ['kicad-cli', 'pcb', 'export', 'glb', '--output', final_glb_path_abs, '--subst-models', '--force', temp_pcb_path]
                                subprocess.run(glb_cmd, check=True, capture_output=True, text=True)
                            except subprocess.CalledProcessError as e:
                                print(f"ERROR: kicad-cli GLB export failed for {footprint_id}. Stderr: {e.stderr}", file=sys.stderr)
                            finally:
                                if temp_pcb_path and os.path.exists(temp_pcb_path): os.remove(temp_pcb_path)
                        glb_path_rel = os.path.join('assets', final_glb_filename).replace(os.path.sep, '/')
                    
                    for pad in fp.Pads():
                        pad_pos = pad.GetPosition()
                        pins_data.append({"name": str(pad.GetPadName()), "x": pcbnew.ToMM(pad_pos.x), "y": pcbnew.ToMM(pad_pos.y), "rotation": pad.GetOrientationDegrees()})
            except Exception as e:
                print(f"WARNING: Footprint processing error for {payload.get('footprintIdentifier')}: {e}", file=sys.stderr)

            new_component = { "id": payload['componentReference'], "label": payload['componentReference'], "ref": payload['componentReference'], "part": payload['componentDescription'], "value": payload['componentValue'], "footprint": payload['footprintIdentifier'], "pin_count": payload.get('numberOfPins', 0), "svgPath": svg_path_rel, "glbPath": glb_path_rel, "pins": pins_data, "side": payload.get('side', 'top'), "placeholder_dimensions": placeholder_dimensions, "placeholder_shape": placeholder_shape, "drc_dimensions": drc_dimensions, "drc_shape": drc_shape }
            if payload.get('pinConnections'):
                try:
                    connections = json.loads(payload['pinConnections']) if isinstance(payload['pinConnections'], str) else payload['pinConnections']
                    if isinstance(connections, list):
                        new_component['pinConnections'] = connections
                except (json.JSONDecodeError, TypeError):
                    print(f"WARNING: Could not parse pinConnections for {payload['componentReference']}", file=sys.stderr)
            state['components'] = [c for c in state['components'] if c['ref'] != new_component['ref']]
            state['components'].append(new_component)
            with open(state_file, 'w') as f: json.dump(state, f, indent=2)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
    return {"message": f"Component '{payload['componentReference']}' defined.", "newNode": new_component}

def define_net(payload):
    state_file = get_state_path(payload['projectName'], 'state.json')
    lock_path = state_file + '.lock'
    new_net = {}
    warnings = []
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            if 'nets' not in state: state['nets'] = []
            
            components_map = {c['ref']: c for c in state.get('components', [])}
            pins_data = payload.get('pins', [])
            if isinstance(pins_data, str):
                 pins_data = ast.literal_eval(pins_data)

            for pin_str in pins_data:
                match = re.match(r'([A-Za-z0-9_]+)-([0-9A-Za-z_]+)', pin_str)
                if not match: continue
                ref, pin_num_str = match.groups()
                component = components_map.get(ref)
                if component and 'pinConnections' in component:
                    for conn in component.get('pinConnections', []):
                        if str(conn.get('pin')) == pin_num_str:
                            component_net_name = conn.get('net')
                            if component_net_name != payload['netName']:
                                warnings.append(f"Pin {pin_str}: Net is '{payload['netName']}', but component '{ref}' expects '{component_net_name}'. Please verify datasheet.")
                            break
            
            new_net = { "name": payload['netName'], "pins": pins_data }
            state['nets'] = [n for n in state['nets'] if n['name'] != new_net['name']]
            state['nets'].append(new_net)
            with open(state_file, 'w') as f: json.dump(state, f, indent=2)
        finally: fcntl.flock(lock_file, fcntl.LOCK_UN)
    
    final_message = f"Net '{payload['netName']}' defined."
    if warnings:
        final_message += " VALIDATION WARNINGS: " + " | ".join(warnings)

    edges = []
    pins_on_net = new_net.get('pins', [])
    if len(pins_on_net) > 1:
        for i in range(len(pins_on_net)):
            for j in range(i + 1, len(pins_on_net)):
                edges.append({
                    "source": pins_on_net[i],
                    "target": pins_on_net[j],
                    "label": new_net['name']
                })

    return {"message": final_message, "net": new_net, "warnings": warnings, "edges": edges}

def add_absolute_position_constraint(payload):
    if 'x' not in payload and 'y' not in payload: raise ValueError("Absolute Position Constraint requires at least an 'x' or a 'y' coordinate.")
    rule = {"type": "AbsolutePositionConstraint", "component": payload['componentReference'], "enabled": True}
    message_parts = []
    if 'x' in payload: rule['x'] = payload['x']; message_parts.append(f"x={payload['x']}")
    if 'y' in payload: rule['y'] = payload['y']; message_parts.append(f"y={payload['y']}")
    add_rule_to_state(payload['projectName'], rule)
    return {"message": f"Rule added: Lock {payload['componentReference']} to ({', '.join(message_parts)}).", "rule": rule}

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
    if not os.path.exists(state_file): raise FileNotFoundError("State file not found.")
    state = json.load(open(state_file))
    circuit = skidl.Circuit()
    with circuit:
        for comp_data in state.get("components", []):
            part_value, pin_count = comp_data.get('value', ''), comp_data.get('pin_count', 0)
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
    netlist_path, pcb_path = get_state_path(payload['projectName'], 'netlist.net'), get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(netlist_path): raise FileNotFoundError("Netlist file not found.")
    custom_footprints_path = os.path.join(STATE_DIR, 'footprints')
    command = ['kinet2pcb', '-i', netlist_path, '-o', pcb_path, '-l', '.']
    if os.path.isdir(custom_footprints_path): command.extend(['-l', custom_footprints_path])
    try: subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e: raise Exception(f"kinet2pcb failed. Stderr: {e.stderr}. Stdout: {e.stdout}") from e
    board = pcbnew.LoadBoard(pcb_path); board.SetCopperLayerCount(4)
    state_file = get_state_path(payload['projectName'], 'state.json')
    if os.path.exists(state_file):
        state_data = json.load(open(state_file))
        for comp_data in state_data.get('components', []):
            if comp_data.get('side') == 'bottom':
                ref = comp_data.get('ref')
                fp = board.FindFootprintByReference(ref)
                if fp and fp.GetLayer() == pcbnew.F_Cu:
                    fp.SetLayerAndFlip(pcbnew.B_Cu)
    pcbnew.SaveBoard(pcb_path, board)
    return {"message": "Initial 4-layer PCB created."}

def create_board_outline(payload):
    _initialize_libraries()
    project_name, pcb_path = payload['projectName'], get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    state_file, lock_path = get_state_path(project_name, 'state.json'), get_state_path(project_name, 'state.json') + '.lock'
    if not os.path.exists(pcb_path): raise FileNotFoundError("PCB file not found.")
    board = pcbnew.LoadBoard(pcb_path)
    for drawing in list(board.GetDrawings()):
        if drawing.GetLayerName() == 'Edge.Cuts': board.Remove(drawing)
    is_auto_size = not any(key in payload and payload[key] is not None and payload[key] > 0 for key in ['boardWidthMillimeters', 'boardHeightMillimeters', 'diameterMillimeters'])
    outline_data = {"shape": payload.get('shape', 'rectangle'), "autoSize": is_auto_size}
    if payload.get('shape') == 'circle':
        diameter_mm = payload.get('diameterMillimeters', 0) or (0 if is_auto_size else 50)
        outline_data['diameter'] = diameter_mm
        if not is_auto_size:
            radius_nm, center = pcbnew.FromMM(diameter_mm / 2.0), pcbnew.VECTOR2I(0,0)
            circle = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_CIRCLE); circle.SetLayer(pcbnew.Edge_Cuts); circle.SetStart(center); circle.SetEnd(pcbnew.VECTOR2I(center.x + int(radius_nm), center.y)); board.Add(circle)
        message = f"Circular board outline created (diameter: {diameter_mm:.2f}mm, autoSize: {is_auto_size})."
    else: # rectangle
        width_mm, height_mm = payload.get('boardWidthMillimeters', 0) or (0 if is_auto_size else 50), payload.get('boardHeightMillimeters', 0) or (0 if is_auto_size else 50)
        outline_data.update({'width': width_mm, 'height': height_mm})
        if not is_auto_size:
            w_nm, h_nm = pcbnew.FromMM(width_mm), pcbnew.FromMM(height_mm)
            x_offset, y_offset = -w_nm // 2, -h_nm // 2
            points = [ pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset) ]
            for i in range(len(points) - 1):
                seg = pcbnew.PCB_SHAPE(board); seg.SetShape(pcbnew.S_SEGMENT); seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1)); board.Add(seg)
        message = f"Rectangular board outline created ({width_mm:.2f}mm x {height_mm:.2f}mm, autoSize: {is_auto_size})."
    pcbnew.SaveBoard(pcb_path, board)
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            state['board_outline'] = outline_data
            with open(state_file, 'w') as f: json.dump(state, f, indent=2)
        finally: fcntl.flock(lock_file, fcntl.LOCK_UN)
    return {"message": message, "board_outline": outline_data}

def create_copper_pour(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path): raise FileNotFoundError(f"PCB file not found.")
    board = pcbnew.LoadBoard(pcb_path)
    merged_outlines = dsn_utils.merge_all_drawings(board, 'Edge.Cuts')
    if not merged_outlines or not merged_outlines[0]: raise ValueError("Board outline is missing.")
    zone_outline = pcbnew.SHAPE_POLY_SET(); outline_contour = zone_outline.NewOutline()
    for point_tuple in merged_outlines[0]: zone_outline.Append(int(point_tuple[0]), int(point_tuple[1]), outline_contour)
    net_info = board.FindNet(payload['netName'])
    if not net_info or net_info.GetNetCode() == 0: raise ValueError(f"Net '{payload['netName']}' not found.")
    layer_id = board.GetLayerID(payload['layerName'])
    if layer_id == pcbnew.UNDEFINED_LAYER or not board.IsLayerEnabled(layer_id) or not pcbnew.IsCopperLayer(layer_id): raise ValueError(f"Layer '{payload['layerName']}' is not a valid copper layer.")
    zone = pcbnew.ZONE(board); board.Add(zone); zone.SetLayer(layer_id); zone.SetNet(net_info); zone.SetOutline(zone_outline);
    zone.SetMinThickness(pcbnew.FromMM(0.25)); zone.SetThermalReliefGap(pcbnew.FromMM(0.5)); zone.SetThermalReliefSpokeWidth(pcbnew.FromMM(0.5)); zone.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL); zone.SetIsFilled(False)
    pcbnew.SaveBoard(pcb_path, board)
    return {"message": f"Copper pour created on layer '{payload['layerName']}' for net '{payload['netName']}'."}

def arrange_components(payload):
    _initialize_libraries()
    pcb_path, state_file = get_state_path(payload['projectName'], 'pcb.kicad_pcb'), get_state_path(payload['projectName'], 'state.json')
    if not os.path.exists(pcb_path) or not os.path.exists(state_file): raise FileNotFoundError("PCB or State file not found.")
    board = pcbnew.LoadBoard(pcb_path); state_data = json.load(open(state_file))
    board_outline_settings = state_data.get('board_outline', {})
    edge_cuts = dsn_utils.merge_all_drawings(board, 'Edge.Cuts')
    min_x, max_x, min_y, max_y = (0, 0, 0, 0)
    if edge_cuts and edge_cuts[0]:
        all_x = [p[0] for p in edge_cuts[0]]; all_y = [p[1] for p in edge_cuts[0]]
        min_x, max_x, min_y, max_y = min(all_x), max(all_x), min(all_y), max(all_y)
    final_outline = { "shape": board_outline_settings.get('shape', 'rectangle'), "autoSize": board_outline_settings.get('autoSize', True), "x": pcbnew.ToMM(min_x), "y": pcbnew.ToMM(min_y), "width": pcbnew.ToMM(max_x - min_x), "height": pcbnew.ToMM(max_y - min_y) }
    layout_data = { "nodes": [], "edges": [], "rules": state_data.get("rules", []), "layoutStrategy": payload.get("layoutStrategy", "agent"), "board_outline": final_outline }
    state_components_map = {comp['ref']: comp for comp in state_data.get('components', [])}
    for fp in board.Footprints():
        ref, state_comp = fp.GetReference(), state_components_map.get(fp.GetReference(), {})
        layout_data["nodes"].append({ "id": ref, "label": ref, "x": pcbnew.ToMM(fp.GetPosition().x), "y": pcbnew.ToMM(fp.GetPosition().y), "rotation": fp.GetOrientationDegrees(), "side": state_comp.get('side', 'top'), "svgPath": state_comp.get('svgPath'), "glbPath": state_comp.get('glbPath'), "pins": state_comp.get('pins', []), "footprint": state_comp.get('footprint'), "placeholder_dimensions": state_comp.get('placeholder_dimensions'), "placeholder_shape": state_comp.get('placeholder_shape'), "drc_dimensions": state_comp.get('drc_dimensions'), "drc_shape": state_comp.get('drc_shape') })
    
    # Re-enable clique topology for nets to ensure all-to-all connections are simulated.
    for net in state_data.get('nets', []):
        pins_on_net = net.get('pins', [])
        if len(pins_on_net) > 1:
            for i in range(len(pins_on_net)):
                for j in range(i + 1, len(pins_on_net)):
                    layout_data["edges"].append({
                        "source": pins_on_net[i],
                        "target": pins_on_net[j],
                        "label": net['name']
                    })

    return {"message": "Extracted layout data.", "layout_data": layout_data, "waitForUserInput": payload.get('waitForUserInput', True)}

def update_component_positions(payload):
    _initialize_libraries()
    project_name = payload['projectName']
    pcb_path = get_state_path(project_name, 'pcb.kicad_pcb')
    state_file = get_state_path(project_name, 'state.json')
    lock_path = state_file + '.lock'
    
    board = pcbnew.LoadBoard(pcb_path)
    positions = json.loads(payload['componentPositionsJSON'])
    
    for ref, pos_data in positions.items():
        fp = board.FindFootprintByReference(ref)
        if fp:
            fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(pos_data['x']), pcbnew.FromMM(pos_data['y'])))
            fp.SetOrientation(pcbnew.EDA_ANGLE(float(pos_data.get('rotation', 0)), pcbnew.DEGREES_T))
            if pos_data.get('side') == 'bottom' and not fp.IsFlipped(): fp.SetLayerAndFlip(pcbnew.B_Cu)
            elif pos_data.get('side') == 'top' and fp.IsFlipped(): fp.SetLayerAndFlip(pcbnew.F_Cu)

    state_data = json.load(open(state_file)) if os.path.exists(state_file) else {}
    board_outline_settings = state_data.get('board_outline', {})
    should_auto_resize = board_outline_settings.get('autoSize', False)
    message = "Component positions updated."

    if should_auto_resize:
        for drawing in list(board.GetDrawings()):
            if drawing.GetLayerName() == 'Edge.Cuts': board.Remove(drawing)
        
        footprints_bbox = pcbnew.BOX2I()
        for fp in board.Footprints(): footprints_bbox.Merge(fp.GetBoundingBox(True, False))
        
        margin_mm = payload.get('boardPadding', 5.0)
        margin_nm = pcbnew.FromMM(margin_mm)
        footprints_bbox.Inflate(margin_nm, margin_nm)
        
        x_offset, y_offset, w_nm, h_nm = footprints_bbox.GetX(), footprints_bbox.GetY(), footprints_bbox.GetWidth(), footprints_bbox.GetHeight()

        new_outline_data = { "autoSize": False } # After sizing, it's no longer auto
        
        if board_outline_settings.get('shape') == 'circle':
            new_outline_data['shape'] = 'circle'
            diameter_nm, radius_nm = max(w_nm, h_nm), max(w_nm, h_nm) / 2
            new_outline_data['diameter'] = pcbnew.ToMM(diameter_nm)
            center = pcbnew.VECTOR2I(int(x_offset + w_nm / 2), int(y_offset + h_nm / 2))
            circle = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_CIRCLE)
            circle.SetLayer(pcbnew.Edge_Cuts)
            circle.SetStart(center)
            circle.SetEnd(pcbnew.VECTOR2I(center.x + int(radius_nm), center.y))
            board.Add(circle)
        else: # rectangle
            new_outline_data['shape'] = 'rectangle'
            new_outline_data['width'] = pcbnew.ToMM(w_nm)
            new_outline_data['height'] = pcbnew.ToMM(h_nm)
            points = [ pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset) ]
            for i in range(len(points) - 1):
                seg = pcbnew.PCB_SHAPE(board); seg.SetShape(pcbnew.S_SEGMENT); seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1)); board.Add(seg)
        
        message = "Component positions updated and board outline resized."
        
        with open(lock_path, 'w') as lock_file:
            fcntl.flock(lock_file, fcntl.LOCK_EX)
            try:
                state_data['board_outline'] = new_outline_data
                with open(state_file, 'w') as f: json.dump(state_data, f, indent=2)
            finally: fcntl.flock(lock_file, fcntl.LOCK_UN)
    
    pcbnew.SaveBoard(pcb_path, board)
    return {"message": message}

def autoroute_pcb(payload):
    _initialize_libraries()
    project_name = payload['projectName']
    pcb_path = get_state_path(project_name, 'pcb.kicad_pcb')
    dsn_path = get_state_path(project_name, 'design.dsn')
    ses_path = get_state_path(project_name, 'routed.ses')
    
    if not os.path.exists(pcb_path): raise FileNotFoundError("PCB file not found.")
    board = pcbnew.LoadBoard(pcb_path)

    # Hybrid DSN Generation: Try official API, fall back to custom implementation
    dsn_generated = False
    try:
        # pcbnew.ExportSpecctraDSN returns a boolean in some versions, None in others
        result = pcbnew.ExportSpecctraDSN(board, dsn_path)
        if result is False: raise Exception("pcbnew.ExportSpecctraDSN returned False.")
        dsn_generated = True
        print(f"INFO: Successfully exported DSN using official pcbnew.ExportSpecctraDSN.", file=sys.stderr)
    except Exception as e:
        print(f"WARNING: Official DSN export failed: {e}. Falling back to custom DSN generator.", file=sys.stderr)
        try:
            dsn_content = dsn_utils.board_to_dsn(pcb_path, board)
            with open(dsn_path, 'w', encoding='utf-8') as f:
                f.write(str(dsn_content))
            dsn_generated = True
            print(f"INFO: Successfully exported DSN using custom kicad_dsn_utils.", file=sys.stderr)
        except Exception as custom_e:
            raise Exception(f"Custom DSN export also failed: {custom_e}")

    if not dsn_generated: raise Exception("All DSN generation methods failed.")

    if not os.path.exists(FREEROUTING_JAR_PATH): raise FileNotFoundError(f"FreeRouting JAR not found at {FREEROUTING_JAR_PATH}")
    
    command = ["java", "-jar", FREEROUTING_JAR_PATH, "-de", dsn_path, "-do", ses_path]
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors='replace')
    
    auto_stopper = AutoStopper(patience=10, low_progress_threshold=5.0)
    stop_routing = False
    
    for line in iter(proc.stderr.readline, ''):
        print("FREEROUTING:", line.strip(), file=sys.stderr)
        if auto_stopper(line.strip()):
            proc.terminate(); stop_routing = True; break
    
    if not stop_routing: proc.wait()
    if proc.returncode != 0 and not stop_routing: raise Exception(f"FreeRouting failed. Last output: {proc.stderr.read()}")
    if not os.path.exists(ses_path): raise FileNotFoundError("Routed session file (.ses) not created.")
    
    # Clear existing tracks before import
    for track in list(board.GetTracks()): board.Remove(track)
    
    # Hybrid SES Import
    ses_imported = False
    try:
        result = pcbnew.ImportSpecctraSES(board, ses_path)
        if result is False: raise Exception("pcbnew.ImportSpecctraSES returned False.")
        ses_imported = True
        print(f"INFO: Successfully imported SES using official pcbnew.ImportSpecctraSES.", file=sys.stderr)
    except Exception as e:
        print(f"WARNING: Official SES import failed: {e}. Falling back to custom SES parser.", file=sys.stderr)
        try:
            ses_utils.parse_and_apply_ses(board, ses_path)
            ses_imported = True
            print(f"INFO: Successfully imported SES using custom kicad_ses_utils.", file=sys.stderr)
        except Exception as custom_e:
            raise Exception(f"Custom SES import also failed: {custom_e}")
    
    if not ses_imported: raise Exception("All SES import methods failed.")

    pcbnew.SaveBoard(pcb_path, board)
    
    # SVG Plotting
    svg_rel_path = os.path.join('assets', f'{project_name}_routed.svg').replace(os.path.sep, '/')
    final_svg_path_abs = get_state_path(project_name, 'routed.svg')
    pctl = pcbnew.PLOT_CONTROLLER(board)
    popts = pctl.GetPlotOptions(); popts.SetOutputDirectory(STATE_DIR)
    pctl.OpenPlotfile("temp_routed_svg", pcbnew.PLOT_FORMAT_SVG, "Routed board")
    for layer_id in [pcbnew.F_Cu, pcbnew.B_Cu, pcbnew.Edge_Cuts, pcbnew.F_SilkS, pcbnew.B_SilkS, pcbnew.F_Mask, pcbnew.B_Mask]:
        pctl.SetLayer(layer_id); pctl.PlotLayer()
    pctl.ClosePlot()
    temp_svg_path = os.path.join(STATE_DIR, "temp_routed_svg-B_Cu.svg") # Example, KiCad might name them differently
    
    # This is a bit of a hack because kicad-cli names files based on layer. We'll find the most relevant one.
    best_svg = None
    for f in glob.glob(os.path.join(STATE_DIR, "temp_routed_svg-*.svg")):
        if 'F_Cu' in f: best_svg = f; break
        best_svg = f
    
    if best_svg and os.path.exists(best_svg):
        if os.path.exists(final_svg_path_abs): os.remove(final_svg_path_abs)
        os.rename(best_svg, final_svg_path_abs)
        # Clean up other plot files
        for f in glob.glob(os.path.join(STATE_DIR, "temp_routed_svg-*.svg")): os.remove(f)

    return {"message": "Autorouting complete. SVG preview generated.", "current_artifact": {"title": "Routed PCB", "path": svg_rel_path, "svgPath": svg_rel_path}}

def export_fabrication_files(payload):
    _initialize_libraries()
    pcb_path = get_state_path(payload['projectName'], 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path): raise FileNotFoundError("PCB file not found.")
    fab_dir = os.path.join(STATE_DIR, f"{payload['projectName']}_fab"); os.makedirs(fab_dir, exist_ok=True)
    try:
        layers = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"
        gerber_cmd = ['kicad-cli', 'pcb', 'export', 'gerbers', '--output', fab_dir, '--layers', layers, pcb_path]
        subprocess.run(gerber_cmd, check=True, capture_output=True, text=True)
        drill_cmd = ['kicad-cli', 'pcb', 'export', 'drill', '--output', fab_dir, pcb_path]
        subprocess.run(drill_cmd, check=True, capture_output=True, text=True)
        glb_path_rel = os.path.join('assets', f'{payload["projectName"]}_board.glb').replace(os.path.sep, '/')
        glb_path_abs = os.path.join(os.path.dirname(__file__), '..', 'assets', f'{payload["projectName"]}_board.glb')
        glb_cmd = ['kicad-cli', 'pcb', 'export', 'glb', '--output', glb_path_abs, '--subst-models', '--include-tracks', '--include-pads', '--include-zones', '--force', pcb_path]
        subprocess.run(glb_cmd, check=True, capture_output=True, text=True)
        zip_path_rel = os.path.join('assets', f"{payload['projectName']}_fab.zip").replace(os.path.sep, '/')
        zip_path_abs = os.path.join(os.path.dirname(__file__), '..', 'assets', f"{payload['projectName']}_fab.zip")
        with zipfile.ZipFile(zip_path_abs, 'w') as zf:
            for file in glob.glob(os.path.join(fab_dir, '*')): zf.write(file, os.path.basename(file))
        shutil.rmtree(fab_dir)
    except subprocess.CalledProcessError as e:
        raise Exception(f"kicad-cli failed. Command: '{' '.join(e.cmd)}'. Stderr: {e.stderr}")
    except Exception as e:
        raise Exception(f"An unexpected error occurred during fabrication export: {e}")
    return {"message": "Fabrication files exported and zipped.", "artifacts": { "boardName": payload['projectName'], "glbPath": glb_path_rel, "fabZipPath": zip_path_rel }}
`