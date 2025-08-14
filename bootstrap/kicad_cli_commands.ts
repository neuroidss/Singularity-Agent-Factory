//server/kicad_cli_commands.ts is typescript file with text variable with python code of server/kicad_cli_commands.py
export const KICAD_CLI_COMMANDS_SCRIPT = `
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
from math import sin, cos, acos, pi, sqrt, ceil, hypot

# --- SKiDL is only needed for netlist generation ---
try:
    from skidl import *
except ImportError:
    # This will be handled gracefully in generate_netlist
    pass

# --- pcbnew is needed for PCB manipulation ---
try:
    import sys; sys.path.insert(0,'/usr/lib/python3/dist-packages');
    import pcbnew
except ImportError:
    # This will be handled if a pcbnew-dependent command is run
    pass

from kicad_dsn_utils import *
from kicad_ses_utils import parse_and_apply_ses # Import the new parser

# --- State File Configuration ---
STATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(STATE_DIR, exist_ok=True)
# Freerouting configuration - assumes freerouting.jar is in the same directory as this script
FREEROUTING_JAR_PATH = os.path.join(os.path.dirname(__file__), 'freerouting.jar')


# --- Utility Functions ---
class AutoStopper:
    """A stateful class to decide when to stop the autorouter."""
    def __init__(self, patience=50, low_progress_threshold=10.0):
        self.patience = patience
        self.low_progress_threshold = low_progress_threshold
        self.low_progress_count = 0

    def __call__(self, msg):
        if msg.get('msg_type') in ['progress', 'warn']:
            message_text = msg.get('msg', '')
            
            # This regex captures the number of changes from both relevant message formats
            match = re.search("(?:making|There were only) (\\\\d+\\\\.?\\\\d*) changes", message_text)

            if match:
                changes = float(match.group(1))
                if changes < self.low_progress_threshold:
                    self.low_progress_count += 1
                else:
                    self.low_progress_count = 0 # Reset if progress is good
            
            if self.low_progress_count >= self.patience:
                print(f"INFO: Stopping autorouter due to low progress (\\{self.low_progress_count} consecutive rounds with < \\{self.low_progress_threshold} changes).", file=sys.stderr)
                return True # Signal to stop
        return False # Signal to continue

def get_state_path(board_name, suffix):
    return os.path.join(STATE_DIR, f"{board_name}_{suffix}")

def log_and_return(message, data=None):
    output = {"message": message}
    if data:
        output.update(data)
    print(json.dumps(output))
    sys.exit(0)

def log_error_and_exit(message):
    print(json.dumps({"error": message, "trace": traceback.format_exc()}), file=sys.stderr)
    sys.exit(1)

def run_subprocess(command):
    return subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def add_rule_to_state(project_name, rule_object):
    """A helper function to safely add a rule to the project's state file."""
    state_file = get_state_path(project_name, 'state.json')
    lock_path = state_file + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            try:
                state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            except json.JSONDecodeError:
                state = {}

            if 'rules' not in state or not isinstance(state['rules'], list):
                state['rules'] = []
            
            state['rules'].append(rule_object)
            
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)

# --- Tool Implementations ---

def define_components(args):
    """Adds a single component definition, exports its SVG footprint, and returns its dimensions."""
    state_file = get_state_path(args.projectName, 'state.json')
    lock_path = state_file + '.lock'
    
    svg_path_rel = None
    dimensions = None
    CrtYd_dimensions = None
    pins_data = []

    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            try:
                state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            except json.JSONDecodeError:
                state = {}

            if 'components' not in state: state['components'] = []
            if 'nets' not in state: state['nets'] = []
            
            # --- SVG Export, Dimension and Pin Extraction ---
            try:
                if 'pcbnew' in sys.modules and args.footprintIdentifier and ':' in args.footprintIdentifier:
                    library_name, footprint_name = args.footprintIdentifier.split(':', 1)
                    footprint_dir = os.environ.get('KICAD_FOOTPRINT_DIR', '/usr/share/kicad/footprints')
                    if not os.path.isdir(footprint_dir):
                        footprint_dir = '/usr/share/kicad/modules' # Fallback for some systems

                    library_path = os.path.join(footprint_dir, f"{library_name}.pretty")
                    
                    fp = None
                    if os.path.isdir(library_path):
                         fp = pcbnew.FootprintLoad(library_path, footprint_name)

                    if fp:
                        # Sanitize component reference to be a valid filename part
                        sanitized_ref = re.sub(r'[\\\\/:*?"<>|]+', '_', args.componentReference)
                        
                        # Export SVG
                        final_svg_filename = f"{sanitized_ref}_{footprint_name}.svg"
                        final_svg_path_abs = os.path.join(STATE_DIR, final_svg_filename)
                        
                        cli_command = [ 'kicad-cli', 'fp', 'export', 'svg', '--footprint', footprint_name, '--output', STATE_DIR, '--layers', 'F.Fab,F.Cu', '--black-and-white', library_path ]
                        temp_svg_path = os.path.join(STATE_DIR, f"{footprint_name}.svg")
                        if os.path.exists(temp_svg_path): os.remove(temp_svg_path)
                        subprocess.run(cli_command, check=True, capture_output=True, text=True)
                        if os.path.exists(temp_svg_path):
                            if os.path.exists(final_svg_path_abs): os.remove(final_svg_path_abs)
                            os.rename(temp_svg_path, final_svg_path_abs)
                            svg_path_rel = os.path.relpath(final_svg_path_abs, os.path.join(os.path.dirname(__file__), '..')).replace(os.path.sep, '/')

                        # Extract Dimensions (Physical BBox)
                        bbox = fp.GetBoundingBox(True, False)
                        dimensions = {'width': pcbnew.ToMM(bbox.GetWidth()), 'height': pcbnew.ToMM(bbox.GetHeight())}

                        # Extract CrtYd Dimensions
                        fp.BuildCourtyardCaches()
                        fp_side = fp.GetSide()
                        CrtYd_layer = pcbnew.F_CrtYd if fp_side == pcbnew.F_Cu else pcbnew.B_CrtYd
                        CrtYd_shape = fp.GetCourtyard(CrtYd_layer)
                        CrtYd_bbox = CrtYd_shape.BBox()
                        if CrtYd_bbox.IsValid() and CrtYd_bbox.GetWidth() > 0 and CrtYd_bbox.GetHeight() > 0:
                            CrtYd_dimensions = {'width': pcbnew.ToMM(CrtYd_bbox.GetWidth()), 'height': pcbnew.ToMM(CrtYd_bbox.GetHeight())}

                        # Extract Pin Data
                        for pad in fp.Pads():
                            pad_pos = pad.GetPosition()
                            pins_data.append({
                                "name": str(pad.GetPadName()),
                                "x": pcbnew.ToMM(pad_pos.x),
                                "y": pcbnew.ToMM(pad_pos.y),
                                "rotation": pad.GetOrientationDegrees()
                            })
            except Exception as e:
                print(f"Warning: Could not process footprint \\{args.footprintIdentifier}. Reason: \\{e}", file=sys.stderr)

            new_component = {
                "ref": args.componentReference, "part": args.componentDescription,
                "value": args.componentValue, "footprint": args.footprintIdentifier,
                "pin_count": args.numberOfPins, "svgPath": svg_path_rel, 
                "dimensions": dimensions,
                "CrtYdDimensions": CrtYd_dimensions,
                "pins": pins_data,
                "side": args.side
            }
            state['components'] = [c for c in state['components'] if c['ref'] != new_component['ref']]
            state['components'].append(new_component)
            
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)

    data_to_return = {"pins": pins_data}
    if svg_path_rel: data_to_return['svgPath'] = svg_path_rel
    if dimensions: data_to_return['dimensions'] = dimensions
    if CrtYd_dimensions: data_to_return['CrtYdDimensions'] = CrtYd_dimensions

    log_and_return(f"Component \\{args.componentReference} defined.", data=data_to_return)

def add_absolute_position_constraint(args):
    rule = {"type": "AbsolutePositionConstraint", "component": args.componentReference, "x": args.x, "y": args.y}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Lock {args.componentReference} to ({args.x}, {args.y}).")

def add_proximity_constraint(args):
    try:
        groups = json.loads(args.groupsJSON)
        if not isinstance(groups, list): raise ValueError()
    except (json.JSONDecodeError, ValueError):
        log_error_and_exit(f"Invalid --groupsJSON format. Expected JSON array of arrays. Received: {args.groupsJSON}")
    rule = {"type": "ProximityConstraint", "groups": groups}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Proximity constraint for {len(groups)} groups.")

def add_alignment_constraint(args):
    try:
        components = json.loads(args.componentsJSON)
        if not isinstance(components, list): raise ValueError()
    except (json.JSONDecodeError, ValueError):
        log_error_and_exit(f"Invalid --componentsJSON format. Expected JSON array of strings. Received: {args.componentsJSON}")
    rule = {"type": "AlignmentConstraint", "axis": args.axis, "components": components}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Align {len(components)} components along {args.axis} axis.")

def add_symmetry_constraint(args):
    try:
        pairs = json.loads(args.pairsJSON)
        if not isinstance(pairs, list): raise ValueError()
    except (json.JSONDecodeError, ValueError):
        log_error_and_exit(f"Invalid --pairsJSON format. Expected JSON array of pairs. Received: {args.pairsJSON}")
    rule = {"type": "SymmetryConstraint", "axis": args.axis, "pairs": pairs}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Symmetry for {len(pairs)} pairs across {args.axis} axis.")

def add_circular_constraint(args):
    try:
        components = json.loads(args.componentsJSON)
        if not isinstance(components, list): raise ValueError()
    except (json.JSONDecodeError, ValueError):
        log_error_and_exit(f"Invalid --componentsJSON format. Expected JSON array of strings. Received: {args.componentsJSON}")
    rule = {"type": "CircularConstraint", "components": components, "radius": args.radius, "center": [args.centerX, args.centerY]}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Circular arrangement for {len(components)} components.")

def add_layer_constraint(args):
    try:
        components = json.loads(args.componentsJSON)
        if not isinstance(components, list): raise ValueError()
    except (json.JSONDecodeError, ValueError):
        log_error_and_exit(f"Invalid --componentsJSON format. Expected JSON array of strings. Received: {args.componentsJSON}")
    rule = {"type": "LayerConstraint", "layer": args.layer, "components": components}
    add_rule_to_state(args.projectName, rule)
    log_and_return(f"Rule added: Place {len(components)} components on {args.layer} layer.")

def define_net(args):
    """Adds a single net definition to the board's state file, with file locking."""
    state_file = get_state_path(args.projectName, 'state.json')
    lock_path = state_file + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            try:
                state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            except json.JSONDecodeError:
                state = {}
            
            if 'components' not in state: state['components'] = []
            if 'nets' not in state: state['nets'] = []
            
            try:
                pins_data = ast.literal_eval(args.pins)
                if not isinstance(pins_data, list):
                    raise ValueError("Input did not evaluate to a list.")
            except (ValueError, SyntaxError):
                log_error_and_exit(f\"\"\"Invalid --pins format. Expected a Python-style list of strings, e.g., '["U1-1", "R1-2"]'. Received: \\{args.pins}\"\"\")

            if not pins_data:
                log_error_and_exit(f"No valid pins found in argument: '\\{args.pins}'")

            new_net = { "name": args.netName, "pins": pins_data }
            # Remove existing net with same name to allow updates
            state['nets'] = [n for n in state['nets'] if n['name'] != new_net['name']]
            state['nets'].append(new_net)

            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)
    
    log_and_return(f"Net '\\{args.netName}' defined successfully with \\{len(pins_data)} pins.")


def generate_netlist(args):
    """Generates a KiCad netlist file using SKiDL from the project state file."""
    if 'skidl' not in sys.modules:
        log_error_and_exit("SKiDL library not found. Please install it ('pip install skidl') to use this tool.")
    
    reset() # Reset SKiDL's internal state before each run

    state_file = get_state_path(args.projectName, 'state.json')
    if not os.path.exists(state_file):
        log_error_and_exit("State file not found. Please define components and nets first.")

    state = json.load(open(state_file))
    
    circuit = Circuit()

    with circuit:
        for comp_data in state.get("components", []):
            try:
                part_value = comp_data.get('value', '')
                pin_count = comp_data.get('pin_count', 0)
                
                # Use lib:part syntax only if pin_count is 0 AND value contains a colon
                if ':' in part_value and pin_count == 0:
                    lib, name = part_value.split(':', 1)
                    Part(lib=f"\\{lib}.kicad_sym", name=name, ref=comp_data['ref'], footprint=comp_data['footprint'])
                else:
                    # Otherwise, create a generic part.
                    # This handles parts with pin_count > 0,
                    # and parts with pin_count == 0 but a simple value (e.g. a resistor with value "10k").
                    p = Part(tool=SKIDL, name=comp_data['part'], ref=comp_data['ref'], footprint=comp_data['footprint'])
                    p.value = comp_data['value']
                    if pin_count > 0:
                        p += [Pin(num=i) for i in range(1, pin_count + 1)]

            except Exception as e:
                log_error_and_exit(f"Failed to create SKiDL part for \\{comp_data['ref']}: \\{e}. Ensure the library is available or provide a pin_count.")

        nets_data = state.get("nets", [])
        for net_obj in nets_data:
            net_name = net_obj['name']
            pins_to_connect_str = net_obj['pins']
            
            net = Net(net_name)
            pins_to_connect = []
            for pin_str in pins_to_connect_str:
                match = re.match(r'([A-Za-z0-9_]+)-([0-9A-Za-z_]+)', pin_str)
                if not match:
                    log_error_and_exit(f"Invalid pin format '\\{pin_str}' in net '\\{net_name}'. Expected format 'REF-PIN'.")
                ref, pin_num = match.groups()
                part = next((p for p in circuit.parts if str(p.ref) == ref), None)
                if not part:
                    log_error_and_exit(f"Part with reference '\\{ref}' not found in circuit for connection.")
                
                pins_to_connect.append(part[pin_num])
            
            net += tuple(pins_to_connect)
    
    netlist_path = get_state_path(args.projectName, 'netlist.net')
    circuit.generate_netlist(file_=netlist_path)
    
    log_and_return(f"Netlist generated successfully at \\{netlist_path}.")

def create_initial_pcb(args):
    """Creates a blank PCB file and imports the netlist using kinet2pcb."""
    netlist_path = get_state_path(args.projectName, 'netlist.net')
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')

    if not os.path.exists(netlist_path):
        log_error_and_exit("Netlist file not found. Please generate the netlist first.")

    try:
        # Define a path for custom project-specific footprint libraries
        custom_footprints_path = os.path.join(STATE_DIR, 'footprints')
        
        command = ['kinet2pcb', '-i', netlist_path, '-o', pcb_path, '-l', '.']
        
        # Add the custom library path to the command if it exists, allowing kinet2pcb to find custom footprints.
        if os.path.isdir(custom_footprints_path):
            command.extend(['-l', custom_footprints_path])
        
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        log_error_and_exit("The 'kinet2pcb' command was not found. Please ensure KiCad's bin directory is in your system's PATH.")
    except subprocess.CalledProcessError as e:
        log_error_and_exit(f"An error occurred while running kinet2pcb. Stderr: \\{e.stderr}. Stdout: \\{e.stdout}")
    except Exception as e:
        log_error_and_exit(f"An unexpected error occurred during initial PCB creation: \\{str(e)}")

    if not os.path.exists(pcb_path):
        log_error_and_exit(f"kinet2pcb ran without error, but the output PCB file '\\{os.path.basename(pcb_path)}' was not created.")

    log_and_return(f"Initial PCB created at \\{pcb_path} from netlist using kinet2pcb.")

def create_board_outline(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        log_error_and_exit("PCB file not found. Create the initial PCB first.")

    board = pcbnew.LoadBoard(pcb_path)
    
    # Clear existing outline
    for drawing in list(board.GetDrawings()): # Use list() to create a copy for safe removal
        if drawing.GetLayerName() == 'Edge.Cuts':
            board.Remove(drawing)

    if args.shape == 'circle':
        diameter_mm = args.diameterMillimeters
        if diameter_mm <= 0:
            # Auto-size logic for circle
            footprints_bbox = pcbnew.BOX2I()
            all_footprints = list(board.Footprints())
            if not all_footprints:
                 center = pcbnew.VECTOR2I(pcbnew.FromMM(25), pcbnew.FromMM(25))
                 radius_nm = pcbnew.FromMM(20) # Default 40mm diameter for empty board
            else:
                for fp in all_footprints:
                    footprints_bbox.Merge(fp.GetBoundingBox(True, False))
                
                center = footprints_bbox.Centre()
                # Calculate radius to enclose the bounding box
                max_dist_sq = 0
                corners = [
                    footprints_bbox.GetOrigin(),
                    pcbnew.VECTOR2I(footprints_bbox.GetRight(), footprints_bbox.GetTop()),
                    pcbnew.VECTOR2I(footprints_bbox.GetLeft(), footprints_bbox.GetBottom()),
                    footprints_bbox.GetEnd()
                ]
                for corner in corners:
                    dist_sq = center.SquaredDistance(corner)
                    if dist_sq > max_dist_sq:
                        max_dist_sq = dist_sq
                
                radius_nm = int(sqrt(max_dist_sq))
                margin_nm = max(pcbnew.FromMM(2), int(radius_nm * 0.1))
                radius_nm += margin_nm
            
            diameter_mm = pcbnew.ToMM(radius_nm * 2)

        else: # Diameter is specified
            radius_nm = pcbnew.FromMM(diameter_mm / 2.0)
            # Center it around all components if they exist, otherwise place at a default location
            footprints_bbox = pcbnew.BOX2I()
            all_footprints = list(board.Footprints())
            if all_footprints:
                 for fp in all_footprints:
                    footprints_bbox.Merge(fp.GetBoundingBox(True, False))
                 center = footprints_bbox.Centre()
            else:
                 center = pcbnew.VECTOR2I(pcbnew.FromMM(diameter_mm/2 + 5), pcbnew.FromMM(diameter_mm/2 + 5))

        # Create and add the circle
        circle = pcbnew.PCB_SHAPE(board)
        circle.SetShape(pcbnew.S_CIRCLE)
        circle.SetLayer(pcbnew.Edge_Cuts)
        circle.SetWidth(pcbnew.FromMM(0.1))
        circle.SetStart(center) # Center point
        circle.SetEnd(pcbnew.VECTOR2I(center.x + radius_nm, center.y)) # Point on circumference
        board.Add(circle)
        
        message = f"Circular board outline created (diameter: \\{diameter_mm:.2f}mm)."

    else: # Default to rectangle
        width_mm, height_mm = args.boardWidthMillimeters, args.boardHeightMillimeters
        
        if width_mm <= 0 or height_mm <= 0:
            footprints_bbox = pcbnew.BOX2I()
            all_footprints = list(board.Footprints())
            
            if not all_footprints:
                width_mm, height_mm = 20, 20
                x_offset, y_offset = pcbnew.FromMM(5), pcbnew.FromMM(5)
                w_nm, h_nm = pcbnew.FromMM(width_mm), pcbnew.FromMM(height_mm)
            else:
                for fp in all_footprints:
                    footprints_bbox.Merge(fp.GetBoundingBox(True, False))

                margin_x = max(pcbnew.FromMM(2), int(footprints_bbox.GetWidth() * 0.1))
                margin_y = max(pcbnew.FromMM(2), int(footprints_bbox.GetHeight() * 0.1))
                footprints_bbox.Inflate(margin_x, margin_y)
                
                x_offset, y_offset = footprints_bbox.GetX(), footprints_bbox.GetY()
                w_nm, h_nm = footprints_bbox.GetWidth(), footprints_bbox.GetHeight()
                width_mm, height_mm = pcbnew.ToMM(w_nm), pcbnew.ToMM(h_nm)
        else:
            x_offset, y_offset = pcbnew.FromMM(5), pcbnew.FromMM(5)
            w_nm, h_nm = pcbnew.FromMM(width_mm), pcbnew.FromMM(height_mm)

        points = [
            pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset),
            pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm),
            pcbnew.VECTOR2I(x_offset, y_offset)
        ]
        
        for i in range(len(points) - 1):
            seg = pcbnew.PCB_SHAPE(board)
            seg.SetShape(pcbnew.S_SEGMENT)
            seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1))
            board.Add(seg)
        
        message = f"Rectangular board outline created (\\{width_mm:.2f}mm x \\{height_mm:.2f}mm)."

    pcbnew.SaveBoard(pcb_path, board)
    log_and_return(message)


def arrange_components(args):
    """
    Extracts component data for client-side layout, including 3D models if available.
    """
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    state_file = get_state_path(args.projectName, 'state.json')

    if not os.path.exists(pcb_path): log_error_and_exit("PCB file not found for arrangement.")
    if not os.path.exists(state_file): log_error_and_exit("State file not found for arrangement.")

    board = pcbnew.LoadBoard(pcb_path)
    board.BuildConnectivity()
    state_data = json.load(open(state_file))

    # --- DETECT BOARD SHAPE ---
    board_shape = 'rectangle' # Default
    for drawing in board.GetDrawings():
        if drawing.GetLayerName() == 'Edge.Cuts' and drawing.GetShape() == pcbnew.S_CIRCLE:
            board_shape = 'circle'
            break

    edge_cuts = merge_all_drawings(board, 'Edge.Cuts')
    if not edge_cuts or not edge_cuts[0]:
        board_bbox = board.ComputeBoundingBox(False)
        if board_bbox.GetWidth() == 0 or board_bbox.GetHeight() == 0:
             board_bbox = pcbnew.BOX2I(pcbnew.VECTOR2I(0,0), pcbnew.VECTOR2I(pcbnew.FromMM(50), pcbnew.FromMM(50)))
        board_bbox.Inflate(pcbnew.FromMM(10), pcbnew.FromMM(10))
        min_x, max_x = board_bbox.GetX(), board_bbox.GetX() + board_bbox.GetWidth()
        min_y, max_y = board_bbox.GetY(), board_bbox.GetY() + board_bbox.GetHeight()
    else:
        all_x = [p[0] for p in edge_cuts[0]]
        all_y = [p[1] for p in edge_cuts[0]]
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)

    layout_data = {
        "nodes": [], "edges": [], "rules": state_data.get("rules", []),
        "layoutStrategy": args.layoutStrategy,
        "board_outline": {
            "x": pcbnew.ToMM(min_x), "y": pcbnew.ToMM(min_y),
            "width": pcbnew.ToMM(max_x - min_x), "height": pcbnew.ToMM(max_y - min_y),
            "shape": board_shape
        }
    }
    
    state_components_map = {comp['ref']: comp for comp in state_data.get('components', [])}
    
    for fp in board.Footprints():
        ref = fp.GetReference()
        state_comp = state_components_map.get(ref)
        
        if state_comp and state_comp.get('dimensions'):
            width, height = state_comp['dimensions']['width'], state_comp['dimensions']['height']
        else:
            bbox = fp.GetBoundingBox(True, False)
            width, height = pcbnew.ToMM(bbox.GetWidth()), pcbnew.ToMM(bbox.GetHeight())

        CrtYd_dims = None
        if state_comp and state_comp.get('CrtYdDimensions'):
            CrtYd_dims = state_comp['CrtYdDimensions']
        else:
            fp.BuildCourtyardCaches()
            fp_side = fp.GetSide()
            CrtYd_layer = pcbnew.F_CrtYd if fp_side == pcbnew.F_Cu else pcbnew.B_CrtYd
            CrtYd_shape = fp.GetCourtyard(CrtYd_layer)
            CrtYd_bbox = CrtYd_shape.BBox()
            if CrtYd_bbox.IsValid() and CrtYd_bbox.GetWidth() > 0 and CrtYd_bbox.GetHeight() > 0:
                CrtYd_dims = {'width': pcbnew.ToMM(CrtYd_bbox.GetWidth()), 'height': pcbnew.ToMM(CrtYd_bbox.GetHeight())}


        # --- 3D Model Logic: Extract properties first, then find/generate path ---
        model_path, model_props = None, None
        models = fp.Models()
        if models and len(models) > 0:
            model_3d = models[0]
            model_props = {
                "offset": {"x": model_3d.m_Offset.x, "y": model_3d.m_Offset.y, "z": model_3d.m_Offset.z},
                "scale": {"x": model_3d.m_Scale.x, "y": model_3d.m_Scale.y, "z": model_3d.m_Scale.z},
                "rotation": {"x": model_3d.m_Rotation.x, "y": model_3d.m_Rotation.y, "z": model_3d.m_Rotation.z}
            }
            
            print(f"INFO: [GLB Export] Found 3D model '\\{model_3d.m_Filename}' for '\\{ref}'. Attempting to generate GLB.", file=sys.stderr)

            temp_board = pcbnew.CreateEmptyBoard()
            fp_clone = pcbnew.FOOTPRINT(fp)
            fp_clone.SetPosition(pcbnew.VECTOR2I(0,0))
            temp_board.Add(fp_clone)
            
            temp_pcb_path = os.path.join(STATE_DIR, f"temp_{ref}.kicad_pcb")
            pcbnew.SaveBoard(temp_pcb_path, temp_board)
            
            glb_filename = f"{args.projectName}_{ref}.glb"
            glb_path_abs = os.path.join(STATE_DIR, glb_filename)
            glb_path_rel = os.path.relpath(glb_path_abs, os.path.join(os.path.dirname(__file__), '..'))
            
            glb_export_cmd = ['kicad-cli', 'pcb', 'export', 'glb', '--output', glb_path_abs, '--subst-models', '--include-tracks', '--include-pads', '--include-zones', '--force', temp_pcb_path]
            
            try:
                result = subprocess.run(glb_export_cmd, check=True, capture_output=True, text=True)
                if os.path.exists(glb_path_abs):
                    model_path = glb_path_rel.replace(os.path.sep, '/')
                    print(f"INFO: [GLB Export] Successfully exported GLB for '\\{ref}' to '\\{model_path}'.", file=sys.stderr)
            except subprocess.CalledProcessError as e:
                print(f"WARNING: [GLB Export] Failed for '\\{ref}'. Stderr: \\{e.stderr}", file=sys.stderr)
            finally:
                if os.path.exists(temp_pcb_path): os.remove(temp_pcb_path)

        layout_data["nodes"].append({
            "id": ref, "label": ref, "x": pcbnew.ToMM(fp.GetPosition().x), "y": pcbnew.ToMM(fp.GetPosition().y),
            "rotation": fp.GetOrientationDegrees(), "width": width, "height": height,
            "CrtYdDimensions": CrtYd_dims,
            "svgPath": state_comp.get('svgPath') if state_comp else None,
            "glbPath": model_path, "model3d_props": model_props,
            "pins": state_comp.get('pins', []),
            "pin_count": len(state_comp.get('pins', [])) if state_comp and state_comp.get('pins') else (state_comp.get('pin_count', 0) if state_comp else 0),
            "side": state_comp.get('side', 'top') if state_comp else 'top'
        })

    layout_data["edges"] = []
    for net in state_data.get('nets', []):
        pins_on_net = net.get('pins', [])
        if len(pins_on_net) > 1:
            for i in range(len(pins_on_net)):
                for j in range(i + 1, len(pins_on_net)):
                    layout_data["edges"].append({
                        "source": pins_on_net[i], "target": pins_on_net[j], "label": net['name']
                    })
    
    log_and_return("Extracted layout data. The client UI will now handle component arrangement.", {"layout_data": layout_data, "waitForUserInput": args.waitForUserInput})


def update_component_positions(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        log_error_and_exit("PCB file not found.")
    
    board = pcbnew.LoadBoard(pcb_path)
    positions = json.loads(args.componentPositionsJSON)

    for ref, pos_data in positions.items():
        fp = board.FindFootprintByReference(ref)
        if fp:
            fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(pos_data['x']), pcbnew.FromMM(pos_data['y'])))
            if 'rotation' in pos_data:
                fp.SetOrientation(pcbnew.EDA_ANGLE(float(pos_data['rotation']), pcbnew.DEGREES_T))
            
            if 'side' in pos_data:
                desired_side_str = pos_data['side']
                current_side_layer = fp.GetSide()
                
                is_currently_on_bottom = (current_side_layer == pcbnew.B_Cu)
                
                if desired_side_str == 'bottom' and not is_currently_on_bottom:
                    fp.SetLayerAndFlip(pcbnew.B_Cu)
                elif desired_side_str == 'top' and is_currently_on_bottom:
                    fp.SetLayerAndFlip(pcbnew.F_Cu)

    
    # --- NEW LOGIC: Recalculate board outline based on new positions ---
    # 1. Remove old outline
    for drawing in list(board.GetDrawings()): # Use list() to create a copy for safe removal
        if drawing.GetLayerName() == 'Edge.Cuts':
            board.Remove(drawing)
    
    # 2. Calculate new bounding box of all footprints
    footprints_bbox = pcbnew.BOX2I()
    all_footprints = list(board.Footprints())
    if not all_footprints:
        log_error_and_exit("No footprints found on board to calculate new outline.")

    for fp in all_footprints:
        footprints_bbox.Merge(fp.GetBoundingBox(True, False))

    # 3. Add a margin
    margin_nm = pcbnew.FromMM(5)
    footprints_bbox.Inflate(margin_nm, margin_nm)

    x_offset, y_offset = footprints_bbox.GetX(), footprints_bbox.GetY()
    w_nm, h_nm = footprints_bbox.GetWidth(), footprints_bbox.GetHeight()
    width_mm, height_mm = pcbnew.ToMM(w_nm), pcbnew.ToMM(h_nm)
    
    # 4. Draw the new outline
    points = [
        pcbnew.VECTOR2I(x_offset, y_offset), pcbnew.VECTOR2I(x_offset + w_nm, y_offset),
        pcbnew.VECTOR2I(x_offset + w_nm, y_offset + h_nm), pcbnew.VECTOR2I(x_offset, y_offset + h_nm),
        pcbnew.VECTOR2I(x_offset, y_offset)
    ]
    
    for i in range(len(points) - 1):
        seg = pcbnew.PCB_SHAPE(board)
        seg.SetShape(pcbnew.S_SEGMENT)
        seg.SetStart(points[i]); seg.SetEnd(points[i+1]); seg.SetLayer(pcbnew.Edge_Cuts); seg.SetWidth(pcbnew.FromMM(0.1))
        board.Add(seg)

    pcbnew.SaveBoard(pcb_path, board)
    log_and_return(f"Component positions updated and board outline resized to \\{width_mm:.2f}mm x \\{height_mm:.2f}mm.")


def autoroute_pcb(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    dsn_path = get_state_path(args.projectName, 'design.dsn')
    ses_path = get_state_path(args.projectName, 'routed.ses')
    
    if not os.path.exists(pcb_path):
        log_error_and_exit("PCB file not found.")

    board = pcbnew.LoadBoard(pcb_path)

    dsn_content = board_to_dsn(pcb_path, board, include_zones=False)
    with open(dsn_path, 'w') as f:
        f.write(str(dsn_content))

    if not os.path.exists(FREEROUTING_JAR_PATH):
        log_error_and_exit(f"FreeRouting JAR not found at \\{FREEROUTING_JAR_PATH}")
    
    command = ["java", "-jar", FREEROUTING_JAR_PATH, "-de", dsn_path, "-do", ses_path, "-mp", "10", "-ep", "10"]
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    auto_stopper = AutoStopper(patience=10, low_progress_threshold=5.0)
    stop_routing = False
    
    while proc.poll() is None:
        line = proc.stderr.readline()
        if line:
            print("FREEROUTING: " + line.strip(), file=sys.stderr)
            if auto_stopper({'msg_type': 'progress', 'msg': line.strip()}):
                proc.terminate()
                stop_routing = True
                break
        else:
            time.sleep(0.1)
    
    if proc.returncode != 0 and not stop_routing:
        log_error_and_exit(f"FreeRouting failed. Check server logs. Last output: \\{proc.stderr.read()}")
    
    if not os.path.exists(ses_path):
        log_error_and_exit("Routed session file (.ses) not created by FreeRouting.")
        
    # --- Clear existing tracks and vias before importing ---
    for track in list(board.GetTracks()):
         board.Remove(track)
    print(f"INFO: Cleared all existing tracks and vias from the board before import.", file=sys.stderr)
    
    parse_and_apply_ses(board, ses_path)
    
    pcbnew.SaveBoard(pcb_path, board)

    routed_svg_path = get_state_path(args.projectName, 'routed.svg')
    plot_controller = pcbnew.PLOT_CONTROLLER(board)
    plot_options = plot_controller.GetPlotOptions()
    plot_options.SetOutputDirectory(STATE_DIR); plot_options.SetPlotFrameRef(False)
    plot_options.SetScale(2); plot_options.SetBlackAndWhite(False)
    
    pctl = pcbnew.PLOT_CONTROLLER(board)
    popts = pctl.GetPlotOptions()
    popts.SetOutputDirectory(STATE_DIR)
    popts.SetPlotFrameRef(False)
    popts.SetAutoScale(False)
    popts.SetScale(4)
    popts.SetMirror(False)
    popts.SetUseAuxOrigin(True)

    layers = [
        ("F.Cu", pcbnew.F_Cu, None),
        ("B.Cu", pcbnew.B_Cu, None),
        ("Edge.Cuts", pcbnew.Edge_Cuts, None),
        ("F.SilkS", pcbnew.F_SilkS, None),
        ("B.SilkS", pcbnew.B_SilkS, None),
        ("F.Mask", pcbnew.F_Mask, None),
        ("B.Mask", pcbnew.B_Mask, None),
    ]

    # Plot to SVG
    pctl.SetLayer(pcbnew.F_Cu) # Just need to set one layer to open the file
    pctl.OpenPlotfile("routed", pcbnew.PLOT_FORMAT_SVG, "Routed board")
    for _, layer_id, _ in layers:
        pctl.SetLayer(layer_id)
        pctl.PlotLayer()
    pctl.ClosePlot()


    log_and_return("Autorouting complete.", {"artifacts": {"routed_svg": os.path.relpath(routed_svg_path, STATE_DIR)}})


def export_fabrication_files(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        log_error_and_exit(f"PCB file '\\{os.path.basename(pcb_path)}' not found for project '\\{args.projectName}'. Cannot export fabrication files.")

    fab_dir = os.path.join(STATE_DIR, f"\\{args.projectName}_fab")
    os.makedirs(fab_dir, exist_ok=True)

    try:
        # --- Generate Gerbers ---
        print("INFO: Generating Gerber files...", file=sys.stderr)
        layers = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"
        gerber_cmd = ['kicad-cli', 'pcb', 'export', 'gerbers', '--output', fab_dir, '--layers', layers, pcb_path]
        subprocess.run(gerber_cmd, check=True, capture_output=True, text=True)

        # --- Generate Drill files ---
        print("INFO: Generating drill files...", file=sys.stderr)
        drill_cmd = ['kicad-cli', 'pcb', 'export', 'drill', '--output', fab_dir, pcb_path]
        subprocess.run(drill_cmd, check=True, capture_output=True, text=True)
        
        # --- Generate final 3D GLB model ---
        print("INFO: Generating final 3D GLB model of the board...", file=sys.stderr)
        glb_path_rel = os.path.join('assets', f'{args.projectName}_board.glb')
        glb_path_abs = os.path.join(os.path.dirname(__file__), '..', glb_path_rel)
        glb_cmd = [
            'kicad-cli', 'pcb', 'export', 'glb',
            '--output', glb_path_abs, '--subst-models', '--include-tracks',
            '--include-pads', '--include-zones', '--force', pcb_path
        ]
        subprocess.run(glb_cmd, check=True, capture_output=True, text=True)

        # --- Zip all fabrication files ---
        print("INFO: Zipping all fabrication files...", file=sys.stderr)
        zip_path_rel = os.path.join('assets', f"{args.projectName}_fab.zip")
        zip_path_abs = os.path.join(os.path.dirname(__file__), '..', zip_path_rel)
        with zipfile.ZipFile(zip_path_abs, 'w') as zf:
            for file in glob.glob(os.path.join(fab_dir, '*')):
                zf.write(file, os.path.basename(file))
        
        shutil.rmtree(fab_dir)

    except subprocess.CalledProcessError as e:
        error_message = f"kicad-cli failed. Command: '\\{' '.join(e.cmd)}'. Stderr: \\{e.stderr}"
        log_error_and_exit(error_message)
    except Exception as e:
        log_error_and_exit(f"An unexpected error occurred during fabrication export: \\{e}")

    log_and_return("Fabrication files exported and zipped.", {
        "artifacts": {
            "boardName": args.projectName,
            "glbPath": glb_path_rel.replace(os.path.sep, '/'),
            "fabZipPath": zip_path_rel.replace(os.path.sep, '/')
        }
    })
`