//this is typescript file with text variable with python code
export const KICAD_CLI_MAIN_SCRIPT = `
import sys
import argparse
import os
import ast

# This script is the main entry point. The actual command implementations are in kicad_cli_commands.
# The complex DSN generation logic is in kicad_dsn_utils.
# The SES parsing logic is in kicad_ses_utils.
# We are assuming all four .py files (kicad_cli.py, kicad_cli_commands.py, kicad_dsn_utils.py, kicad_ses_utils.py) are in the same directory.
from kicad_cli_commands import (
    define_components,
    define_placement_constraint,
    define_net,
    generate_netlist,
    create_initial_pcb,
    create_board_outline,
    arrange_components,
    update_component_positions,
    autoroute_pcb,
    export_fabrication_files,
    log_error_and_exit
)

try:
    # Ensure pcbnew can be found
    import sys; sys.path.insert(0,'/usr/lib/python3/dist-packages');
    import pcbnew
except ImportError:
    # This will be handled in main()
    pass

def str_to_bool(value):
    """A custom type for argparse that handles string-to-boolean conversion."""
    if isinstance(value, bool):
        return value
    if value.lower() in ('yes', 'true', 't', 'y', '1'):
        return True
    elif value.lower() in ('no', 'false', 'f', 'n', '0'):
        return False
    else:
        raise argparse.ArgumentTypeError('Boolean value expected.')

def main():
    if 'pcbnew' not in sys.modules:
        log_error_and_exit("KiCad's pcbnew library not found in Python path. This script must be run in an environment where pcbnew is available (e.g., via 'kicad-cli exec-python').")

    parser = argparse.ArgumentParser(description="KiCad Automation CLI")
    subparsers = parser.add_subparsers(dest='command', required=True)

    p_define = subparsers.add_parser('define_component')
    p_define.add_argument('--projectName', required=True)
    p_define.add_argument('--componentReference', required=True)
    p_define.add_argument('--componentDescription', required=True)
    p_define.add_argument('--componentValue', required=True)
    p_define.add_argument('--footprintIdentifier', required=True)
    p_define.add_argument('--numberOfPins', type=int, default=0)
    p_define.set_defaults(func=define_components)

    p_constraint = subparsers.add_parser('define_placement_constraint')
    p_constraint.add_argument('--projectName', required=True)
    p_constraint.add_argument('--type', required=True, help="Constraint type: 'relative_position' or 'fixed_orientation'")
    p_constraint.add_argument('--components', required=True, help="Python list of component refs, e.g., '[\\"J1\\", \\"J2\\"]'")
    p_constraint.add_argument('--offsetX_mm', type=float)
    p_constraint.add_argument('--offsetY_mm', type=float)
    p_constraint.add_argument('--angle_deg', type=float)
    p_constraint.set_defaults(func=define_placement_constraint)

    p_define_net = subparsers.add_parser('define_net')
    p_define_net.add_argument('--projectName', required=True)
    p_define_net.add_argument('--netName', required=True)
    p_define_net.add_argument('--pins', required=True, help="Python list of pin name strings, e.g., '[\\"U1-1\\", \\"R1-2\\"]'.")
    p_define_net.set_defaults(func=define_net)

    p_gen_netlist = subparsers.add_parser('generate_netlist')
    p_gen_netlist.add_argument('--projectName', required=True)
    p_gen_netlist.set_defaults(func=generate_netlist)

    p_init_pcb = subparsers.add_parser('create_initial_pcb')
    p_init_pcb.add_argument('--projectName', required=True)
    p_init_pcb.set_defaults(func=create_initial_pcb)
    
    p_outline = subparsers.add_parser('create_board_outline')
    p_outline.add_argument('--projectName', required=True)
    p_outline.add_argument('--shape', type=str, default='rectangle', help="Shape of the board: 'rectangle' or 'circle'")
    p_outline.add_argument('--boardWidthMillimeters', type=float, default=0)
    p_outline.add_argument('--boardHeightMillimeters', type=float, default=0)
    p_outline.add_argument('--diameterMillimeters', type=float, default=0)
    p_outline.set_defaults(func=create_board_outline)

    p_arrange = subparsers.add_parser('arrange_components')
    p_arrange.add_argument('--projectName', required=True)
    # Use the custom str_to_bool type to handle 'true'/'false' from shell
    p_arrange.add_argument('--waitForUserInput', type=str_to_bool, default=True)
    p_arrange.set_defaults(func=arrange_components)
    
    p_update_pos = subparsers.add_parser('update_component_positions')
    p_update_pos.add_argument('--projectName', required=True)
    p_update_pos.add_argument('--componentPositionsJSON', required=True)
    p_update_pos.set_defaults(func=update_component_positions)

    p_autoroute = subparsers.add_parser('autoroute_pcb')
    p_autoroute.add_argument('--projectName', required=True)
    p_autoroute.set_defaults(func=autoroute_pcb)

    p_export = subparsers.add_parser('export_fabrication_files')
    p_export.add_argument('--projectName', required=True)
    p_export.set_defaults(func=export_fabrication_files)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
`
