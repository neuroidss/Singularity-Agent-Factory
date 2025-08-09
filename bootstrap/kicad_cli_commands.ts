
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


# --- Tool Implementations ---
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
            match = re.search(r"(?:making|There were only) (\\\\d+\\\\.?\\\\d*) changes", message_text)

            if match:
                changes = float(match.group(1))
                if changes < self.low_progress_threshold:
                    self.low_progress_count += 1
                else:
                    self.low_progress_count = 0 # Reset if progress is good
            
            if self.low_progress_count >= self.patience:
                print(f"INFO: Stopping autorouter due to low progress ({self.low_progress_count} consecutive rounds with < {self.low_progress_threshold} changes).", file=sys.stderr)
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

def define_components(args):
    """Adds a single component definition, exports its SVG footprint, and returns its dimensions."""
    state_file = get_state_path(args.projectName, 'state.json')
    lock_path = state_file + '.lock'
    
    svg_path_rel = None
    dimensions = None

    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            try:
                state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            except json.JSONDecodeError:
                state = {}

            if 'components' not in state: state['components'] = []
            if 'nets' not in state: state['nets'] = []
            
            # --- SVG Export and Dimension Extraction ---
            try:
                if 'pcbnew' in sys.modules and args.footprintIdentifier and ':' in args.footprintIdentifier:
                    library_name, footprint_name = args.footprintIdentifier.split(':', 1)
                    footprint_dir = os.environ.get('KICAD_FOOTPRINT_DIR', '/usr/share/kicad/footprints')
                    if not os.path.isdir(footprint_dir):
                        footprint_dir = '/usr/share/kicad/modules' # Fallback for some systems

                    library_path = os.path.join(footprint_dir, f"{library_name}.pretty")

                    if os.path.isdir(library_path):
                        # Export SVG
                        final_svg_filename = f"{args.componentReference}_{footprint_name}.svg"
                        final_svg_path_abs = os.path.join(STATE_DIR, final_svg_filename)
                        
                        cli_command = [
                            'kicad-cli', 'fp', 'export', 'svg',
                            '--footprint', footprint_name,
                            '--output', STATE_DIR,
                            '--layers', 'F.SilkS,F.CrtYd,F.Fab,F.Cu',
                            '--black-and-white',
                            library_path
                        ]
                        
                        # kicad-cli outputs to <footprint_name>.svg, so we need to anticipate that and rename it
                        temp_svg_path = os.path.join(STATE_DIR, f"{footprint_name}.svg")
                        if os.path.exists(temp_svg_path): os.remove(temp_svg_path) # Clean up old temp file
                        
                        # Run the command
                        subprocess.run(cli_command, check=True, capture_output=True, text=True)
                        
                        # Rename the output file
                        if os.path.exists(temp_svg_path):
                            if os.path.exists(final_svg_path_abs): os.remove(final_svg_path_abs) # Clean up old final file
                            os.rename(temp_svg_path, final_svg_path_abs)
                            svg_path_rel = os.path.relpath(final_svg_path_abs, os.path.join(os.path.dirname(__file__), '..')) # Relative to project root

                        # Extract Dimensions
                        footprint_file_path = os.path.join(library_path, f"{footprint_name}.kicad_mod")
                        if os.path.exists(footprint_file_path):
                            fp = pcbnew.FootprintLoad(library_path, footprint_name)
                            if fp:
                                bbox = fp.GetBoundingBox(True, False) # include pads, no text
                                dimensions = {'width': pcbnew.ToMM(bbox.GetWidth()), 'height': pcbnew.ToMM(bbox.GetHeight())}
            except Exception as e:
                # Don't fail the whole step, just log a warning to stderr
                print(f"Warning: Could not export SVG or get dimensions for {args.footprintIdentifier}. Reason: {e}", file=sys.stderr)

            new_component = {
                "ref": args.componentReference, "part": args.componentDescription,
                "value": args.componentValue, "footprint": args.footprintIdentifier,
                "pin_count": args.numberOfPins, "svgPath": svg_path_rel, "dimensions": dimensions,
            }
            # Update or add the component
            state['components'] = [c for c in state['components'] if c['ref'] != new_component['ref']]
            state['components'].append(new_component)
            
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)

    data_to_return = {}
    if svg_path_rel: data_to_return['svgPath'] = svg_path_rel
    if dimensions: data_to_return['dimensions'] = dimensions

    log_and_return(f"Component {args.componentReference} defined.", data=data_to_return)

def define_placement_constraint(args):
    """Adds a placement constraint to the board's state file."""
    state_file = get_state_path(args.projectName, 'state.json')
    lock_path = state_file + '.lock'
    with open(lock_path, 'w') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            state = json.load(open(state_file)) if os.path.exists(state_file) else {}
            if 'constraints' not in state: state['constraints'] = []
            
            try:
                components = ast.literal_eval(args.components)
                if not isinstance(components, list): raise ValueError()
            except (ValueError, SyntaxError):
                log_error_and_exit("Invalid --components format. Expected a Python-style list of strings, e.g., '[\\"J1\\", \\"J2\\"]'. Received: {}".format(args.components))

            new_constraint = {
                "type": args.type,
                "components": components,
            }
            if args.type == 'relative_position':
                if args.offsetX_mm is None or args.offsetY_mm is None:
                    log_error_and_exit("offsetX_mm and offsetY_mm are required for 'relative_position' constraint.")
                new_constraint['offsetX_mm'] = float(args.offsetX_mm)
                new_constraint['offsetY_mm'] = float(args.offsetY_mm)
            elif args.type == 'fixed_orientation':
                if args.angle_deg is None:
                    log_error_and_exit("angle_deg is required for 'fixed_orientation' constraint.")
                new_constraint['angle_deg'] = float(args.angle_deg)
            else:
                log_error_and_exit(f"Unsupported constraint type: {args.type}")

            state['constraints'].append(new_constraint)
            
            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)
    
    log_and_return(f"Placement constraint of type '{args.type}' defined for components {args.components}.")

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
                log_error_and_exit(f"""Invalid --pins format. Expected a Python-style list of strings, e.g., '["U1-1", "R1-2"]'. Received: {args.pins}""")

            if not pins_data:
                log_error_and_exit(f"No valid pins found in argument: '{args.pins}'")

            new_net = { "name": args.netName, "pins": pins_data }
            # Remove existing net with same name to allow updates
            state['nets'] = [n for n in state['nets'] if n['name'] != new_net['name']]
            state['nets'].append(new_net)

            with open(state_file, 'w') as f:
                json.dump(state, f, indent=2)
        finally:
             fcntl.flock(lock_file, fcntl.LOCK_UN)
    
    log_and_return(f"Net '{args.netName}' defined successfully with {len(pins_data)} pins.")


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
                if comp_data.get("pin_count", 0) > 0:
                     p = Part(tool=SKIDL, name=comp_data['part'], ref=comp_data['ref'], footprint=comp_data['footprint'])
                     p.value = comp_data['value']
                     p += [Pin(num=i) for i in range(1, comp_data['pin_count'] + 1)]
                else:
                     Part(lib=f"{comp_data['value'].split(':')[0]}.kicad_sym", name=comp_data['value'].split(':')[1], ref=comp_data['ref'], footprint=comp_data['footprint'])
            except Exception as e:
                log_error_and_exit(f"Failed to create SKiDL part for {comp_data['ref']}: {e}. Ensure the library is available or provide a pin_count.")

        nets_data = state.get("nets", [])
        for net_obj in nets_data:
            net_name = net_obj['name']
            pins_to_connect_str = net_obj['pins']
            
            net = Net(net_name)
            pins_to_connect = []
            for pin_str in pins_to_connect_str:
                match = re.match(r'([A-Za-z]+[0-9]+)-([0-9A-Za-z_]+)', pin_str)
                if not match:
                    log_error_and_exit(f"Invalid pin format '{pin_str}' in net '{net_name}'. Expected format 'REF-PIN'.")
                ref, pin_num = match.groups()
                part = next((p for p in circuit.parts if str(p.ref) == ref), None)
                if not part:
                    log_error_and_exit(f"Part with reference '{ref}' not found in circuit for connection.")
                
                pins_to_connect.append(part[pin_num])
            
            net += tuple(pins_to_connect)
    
    netlist_path = get_state_path(args.projectName, 'netlist.net')
    circuit.generate_netlist(file_=netlist_path)
    
    log_and_return(f"Netlist generated successfully at {netlist_path}.")

def create_initial_pcb(args):
    """Creates a blank PCB file and imports the netlist using kinet2pcb."""
    netlist_path = get_state_path(args.projectName, 'netlist.net')
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')

    if not os.path.exists(netlist_path):
        log_error_and_exit("Netlist file not found. Please generate the netlist first.")

    try:
        command = ['kinet2pcb', '-i', netlist_path, '-o', pcb_path]
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        log_error_and_exit("The 'kinet2pcb' command was not found. Please ensure KiCad's bin directory is in your system's PATH.")
    except subprocess.CalledProcessError as e:
        log_error_and_exit(f"An error occurred while running kinet2pcb. Stderr: {e.stderr}. Stdout: {e.stdout}")
    except Exception as e:
        log_error_and_exit(f"An unexpected error occurred during initial PCB creation: {str(e)}")

    if not os.path.exists(pcb_path):
        log_error_and_exit(f"kinet2pcb ran without error, but the output PCB file '{os.path.basename(pcb_path)}' was not created.")

    log_and_return(f"Initial PCB created at {pcb_path} from netlist using kinet2pcb.")

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
        
        message = f"Circular board outline created (diameter: {diameter_mm:.2f}mm)."

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
        
        message = f"Rectangular board outline created ({width_mm:.2f}mm x {height_mm:.2f}mm)."

    pcbnew.SaveBoard(pcb_path, board)
    log_and_return(message)


def arrange_components(args):
    """
    This function no longer performs layout itself. It now extracts all necessary
    data from the PCB and the project state file and sends it to the client
    for interactive or autonomous layout in the browser.
    """
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    state_file = get_state_path(args.projectName, 'state.json')

    if not os.path.exists(pcb_path):
        log_error_and_exit("PCB file not found for arrangement.")
    if not os.path.exists(state_file):
        log_error_and_exit("State file not found for arrangement.")

    board = pcbnew.LoadBoard(pcb_path)
    board.BuildConnectivity()
    state_data = json.load(open(state_file))

    edge_cuts = merge_all_drawings(board, 'Edge.Cuts')
    if not edge_cuts:
        # If no outline exists, create a temporary large one for layout purposes
        board_bbox = board.ComputeBoundingBox(False)
        if board_bbox.GetWidth() == 0 or board_bbox.GetHeight() == 0:
             # If board is totally empty, make a default 50x50mm box
             board_bbox = pcbnew.BOX2I(pcbnew.VECTOR2I(0,0), pcbnew.VECTOR2I(pcbnew.FromMM(50), pcbnew.FromMM(50)))
        board_bbox.Inflate(pcbnew.FromMM(10), pcbnew.FromMM(10)) # Add a generous margin
        min_x, max_x = board_bbox.GetX(), board_bbox.GetX() + board_bbox.GetWidth()
        min_y, max_y = board_bbox.GetY(), board_bbox.GetY() + board_bbox.GetHeight()
    else:
        all_x = [p[0] for p in edge_cuts[0]]
        all_y = [p[1] for p in edge_cuts[0]]
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)

    layout_data = {
        "nodes": [],
        "edges": [],
        "constraints": state_data.get("constraints", []),
        "board_outline": {
            "x": pcbnew.ToMM(min_x),
            "y": pcbnew.ToMM(min_y),
            "width": pcbnew.ToMM(max_x - min_x),
            "height": pcbnew.ToMM(max_y - min_y),
        }
    }
    
    state_components_map = {comp['ref']: comp for comp in state_data.get('components', [])}
    
    for fp in board.Footprints():
        ref = fp.GetReference()
        state_comp = state_components_map.get(ref)
        
        # Get dimensions either from the state file (more accurate) or by calculating BBox
        if state_comp and state_comp.get('dimensions'):
            width, height = state_comp['dimensions']['width'], state_comp['dimensions']['height']
        else:
            bbox = fp.GetBoundingBox(True, False)
            width, height = pcbnew.ToMM(bbox.GetWidth()), pcbnew.ToMM(bbox.GetHeight())

        layout_data["nodes"].append({
            "id": ref,
            "label": ref,
            "x": pcbnew.ToMM(fp.GetPosition().x),
            "y": pcbnew.ToMM(fp.GetPosition().y),
            "width": width,
            "height": height,
            "svgPath": state_comp.get('svgPath') if state_comp else None,
            "pin_count": state_comp.get('pin_count') if state_comp else 0
        })

    # Use the nets from the state file as the source of truth for connections
    for net in state_data.get('nets', []):
        component_refs_on_net = list(set([pin.split('-')[0] for pin in net['pins']]))
        for i in range(len(component_refs_on_net)):
            for j in range(i + 1, len(component_refs_on_net)):
                layout_data["edges"].append({
                    "source": component_refs_on_net[i],
                    "target": component_refs_on_net[j],
                    "label": net['name']
                })
    
    message = "Extracted layout data. The client UI will now handle component arrangement."
    log_and_return(message, {"layout_data": layout_data})


def update_component_positions(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        log_error_and_exit("PCB file not found.")
    
    board = pcbnew.LoadBoard(pcb_path)
    positions = json.loads(args.componentPositionsJSON)

    for ref, pos in positions.items():
        fp = board.FindFootprintByReference(ref)
        if fp:
            fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(pos['x']), pcbnew.FromMM(pos['y'])))
    
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
    log_and_return(f"Component positions updated and board outline resized to {width_mm:.2f}mm x {height_mm:.2f}mm.")


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
        log_error_and_exit(f"FreeRouting JAR not found at {FREEROUTING_JAR_PATH}")
    
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
        log_error_and_exit(f"FreeRouting failed. Check server logs. Last output: {proc.stderr.read()}")
    
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
        log_error_and_exit(f"PCB file '{os.path.basename(pcb_path)}' not found for project '{args.projectName}'. Cannot export fabrication files.")

    fab_dir = os.path.join(STATE_DIR, f"{args.projectName}_fab")
    os.makedirs(fab_dir, exist_ok=True)

    try:
        # --- Generate Gerbers using kicad-cli ---
        print("INFO: Generating Gerber files...", file=sys.stderr)
        layers_to_plot = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"
        gerber_cmd = [
            'kicad-cli', 'pcb', 'export', 'gerbers',
            '--output', fab_dir,
            '--layers', layers_to_plot,
            '--subtract-soldermask',
            '--no-x2',
            '--use-drill-file-origin',
            pcb_path
        ]
        subprocess.run(gerber_cmd, check=True, capture_output=True, text=True)

        # --- Generate Drill files using kicad-cli ---
        print("INFO: Generating drill files...", file=sys.stderr)
        drill_cmd = [
            'kicad-cli', 'pcb', 'export', 'drill',
            '--output', fab_dir,
            '--format', 'excellon',
            '--excellon-units', 'mm',
            '--excellon-separate-th',
            pcb_path
        ]
        subprocess.run(drill_cmd, check=True, capture_output=True, text=True)
        
        # --- Generate Position files using kicad-cli ---
        print("INFO: Generating position files (for assembly)...", file=sys.stderr)
        pos_top_cmd = [
            'kicad-cli', 'pcb', 'export', 'pos',
            '--output', os.path.join(fab_dir, f'{args.projectName}-pos-top.csv'),
            '--format', 'csv',
            '--units', 'mm',
            '--side', 'front',
            pcb_path
        ]
        subprocess.run(pos_top_cmd, check=True, capture_output=True, text=True)
        
        pos_bottom_cmd = [
            'kicad-cli', 'pcb', 'export', 'pos',
            '--output', os.path.join(fab_dir, f'{args.projectName}-pos-bottom.csv'),
            '--format', 'csv',
            '--units', 'mm',
            '--side', 'back',
            pcb_path
        ]
        subprocess.run(pos_bottom_cmd, check=True, capture_output=True, text=True)

        # --- Generate 3D Renders ---
        print("INFO: Generating 3D renders...", file=sys.stderr)
        top_png_path_rel = os.path.join('assets', f'{args.projectName}_render_top.png')
        bottom_png_path_rel = os.path.join('assets', f'{args.projectName}_render_bottom.png')
        top_png_path_abs = os.path.join(os.path.dirname(__file__), '..', top_png_path_rel)
        bottom_png_path_abs = os.path.join(os.path.dirname(__file__), '..', bottom_png_path_rel)
        
        subprocess.run(['kicad-cli', 'pcb', 'render', '--output', top_png_path_abs, '--side', 'top', pcb_path], check=True, capture_output=True)
        subprocess.run(['kicad-cli', 'pcb', 'render', '--output', bottom_png_path_abs, '--side', 'bottom', pcb_path], check=True, capture_output=True)

        # --- Zip all fabrication files ---
        print("INFO: Zipping all fabrication files...", file=sys.stderr)
        zip_path_rel = os.path.join('assets', f"{args.projectName}_fab.zip")
        zip_path_abs = os.path.join(os.path.dirname(__file__), '..', zip_path_rel)
        with zipfile.ZipFile(zip_path_abs, 'w') as zf:
            for file in glob.glob(os.path.join(fab_dir, '*')):
                zf.write(file, os.path.basename(file))
        
        # Clean up the fab directory after zipping
        shutil.rmtree(fab_dir)

    except subprocess.CalledProcessError as e:
        error_message = f"kicad-cli failed during fabrication export. Command: '{' '.join(e.cmd)}'. Stderr: {e.stderr}"
        print(error_message, file=sys.stderr)
        log_error_and_exit(error_message)
    except Exception as e:
        log_error_and_exit(f"An unexpected error occurred during fabrication export: {e}")

    log_and_return("Fabrication files exported and zipped.", {
        "artifacts": {
            "boardName": args.projectName,
            "topImage": top_png_path_rel,
            "bottomImage": bottom_png_path_rel,
            "fabZipPath": zip_path_rel
        }
    })
`