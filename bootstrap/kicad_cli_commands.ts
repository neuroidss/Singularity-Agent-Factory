//server/kicad_cli_commands.ts is typescript file with text variable with python code of server/kicad_cli_commands.py
export const KICAD_CLI_SCHEMATIC_COMMANDS_SCRIPT = `
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
                print(f"Warning: Could not process footprint {args.footprintIdentifier}. Reason: {e}", file=sys.stderr)

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

    log_and_return(f"Component '{args.componentReference}' defined.", data=data_to_return)

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
                log_error_and_exit(f\"\"\"Invalid --pins format. Expected a Python-style list of strings, e.g., '["U1-1", "R1-2"]'. Received: {args.pins}\"\"\")

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
                part_value = comp_data.get('value', '')
                pin_count = comp_data.get('pin_count', 0)
                
                # Use lib:part syntax only if pin_count is 0 AND value contains a colon
                if ':' in part_value and pin_count == 0:
                    lib, name = part_value.split(':', 1)
                    Part(lib=f"{lib}.kicad_sym", name=name, ref=comp_data['ref'], footprint=comp_data['footprint'])
                else:
                    # Otherwise, create a generic part.
                    # This handles parts with pin_count > 0,
                    # and parts with pin_count == 0 but a simple value (e.g. a resistor with value "10k").
                    p = Part(tool=SKIDL, name=comp_data['part'], ref=comp_data['ref'], footprint=comp_data['footprint'])
                    p.value = comp_data['value']
                    if pin_count > 0:
                        p += [Pin(num=i) for i in range(1, pin_count + 1)]

            except Exception as e:
                log_error_and_exit(f"Failed to create SKiDL part for {comp_data['ref']}: {e}. Ensure the library is available or provide a pin_count.")

        nets_data = state.get("nets", [])
        for net_obj in nets_data:
            net_name = net_obj['name']
            pins_to_connect_str = net_obj['pins']
            
            net = Net(net_name)
            pins_to_connect = []
            for pin_str in pins_to_connect_str:
                match = re.match(r'([A-Za-z0-9_]+)-([0-9A-Za-z_]+)', pin_str)
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

`;