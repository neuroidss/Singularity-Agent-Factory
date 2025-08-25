// bootstrap/kicad_ses_utils.ts
export const KICAD_SES_UTILS_SCRIPT = `
import sys
import os
import traceback
import json
import re

# Deferred pcbnew import
pcbnew = None

def _initialize_pcbnew():
    global pcbnew
    if pcbnew is None:
        try:
            sys.path.insert(0, '/usr/lib/python3/dist-packages') # This can be problematic, better to rely on system path
            import pcbnew as pcbnew_lib
            pcbnew = pcbnew_lib
        except ImportError:
            raise RuntimeError("KiCad's pcbnew library not found for SES parsing.")

def log_error_and_exit(message):
    print(json.dumps({"error": message, "trace": traceback.format_exc()}), file=sys.stderr)
    sys.exit(1)

def tokenize_s_expression(text):
    """A robust, character-by-character tokenizer for S-expressions."""
    tokens = []
    in_quote = False
    current_token = ''
    i = 0
    while i < len(text):
        char = text[i]
        if in_quote:
            if char == '\\\\' and i + 1 < len(text):
                current_token += text[i+1]
                i += 1
            elif char == '"':
                in_quote = False
                tokens.append(f'"{current_token}"')
                current_token = ''
            else:
                current_token += char
        elif char in '()':
            if current_token:
                tokens.append(current_token)
                current_token = ''
            tokens.append(char)
        elif char.isspace():
            if current_token:
                tokens.append(current_token)
                current_token = ''
        elif char == '"':
            if current_token:
                tokens.append(current_token)
                current_token = ''
            in_quote = True
        else:
            current_token += char
        i += 1
    if current_token:
        tokens.append(current_token)
    return tokens


def parse_s_expression_recursive(tokens):
    """Recursively parses a list of tokens into an S-expression AST."""
    if not tokens:
        raise ValueError("Unexpected EOF while parsing S-expression.")
    
    token = tokens.pop(0)
    if token == '(':
        ast = []
        while tokens and tokens[0] != ')':
            ast.append(parse_s_expression_recursive(tokens))
        if not tokens or tokens.pop(0) != ')':
            raise ValueError("Missing ')' in S-expression.")
        return ast
    elif token == ')':
        raise ValueError("Unexpected ')' in S-expression.")
    else:
        # It's an atom.
        if token.startswith('"') and token.endswith('"'):
            return token[1:-1] # Unquote string
        try:
            return int(token)
        except ValueError:
            try:
                return float(token)
            except ValueError:
                return token # It's a symbol (string without quotes)

def find_node_recursively(ast_list, key):
    """Recursively finds the first node starting with a specific key in a list of ASTs."""
    if not isinstance(ast_list, list): return None
    for item in ast_list:
        if isinstance(item, list) and item and len(item) > 0 and item[0] == key: return item
        if isinstance(item, list):
            found = find_node_recursively(item, key)
            if found: return found
    return None

def find_all_nodes(ast, key):
    """Finds all nodes starting with a specific key in a parsed AST."""
    if not isinstance(ast, list): return []
    return [node for node in ast if isinstance(node, list) and node and node[0] == key]
    
def find_node(ast, key):
    """Finds the first node starting with a specific key in a parsed AST."""
    if not isinstance(ast, list): return None
    for node in ast:
        if isinstance(node, list) and node and node[0] == key:
            return node
    return None

def parse_and_apply_ses(board, ses_path):
    """Parses a FreeRouting SES file and applies tracks and vias to the board."""
    _initialize_pcbnew()
    try:
        with open(ses_path, 'r', encoding='utf-8') as f: content = f.read()
        tokens = tokenize_s_expression(content)
        
        parsed_ast = []
        while tokens: parsed_ast.append(parse_s_expression_recursive(tokens))

        routes_node = find_node_recursively(parsed_ast, 'routes')
        if not routes_node: routes_node = find_node_recursively(parsed_ast, 'network_out')
        if not routes_node: raise ValueError("Could not find a '(routes ...)' or '(network_out ...)' block in the parsed SES file.")

        multiplier = 1000.0
        resolution_node = find_node(routes_node, 'resolution')
        if resolution_node and len(resolution_node) == 3:
            unit, value = resolution_node[1], resolution_node[2]
            if unit == 'um' and isinstance(value, (int, float)) and value > 0:
                multiplier = 1000.0 / float(value)
        
        network_node = find_node(routes_node, 'network_out') or routes_node

        for net_def in find_all_nodes(network_node, 'net'):
            net_name_from_ses = net_def[1] if len(net_def) > 1 and not isinstance(net_def[1], list) else ""
            items_to_process = net_def[2:] if net_name_from_ses else net_def[1:]
            
            original_net_name = "" if net_name_from_ses == "unnamed_net" else net_name_from_ses
            net_info = board.FindNet(original_net_name)
            if not net_info:
                print(f"Warning: Net '{original_net_name}' not found in board. Skipping.", file=sys.stderr)
                continue
            
            netclass = board.GetDesignSettings().m_NetSettings.GetDefaultNetclass()
            try:
                netclass = net_info.GetNetClassSlow()
            except AttributeError: pass

            for item in items_to_process:
                if not isinstance(item, list) or not item: continue
                item_type = item[0]
                if item_type == 'wire':
                    for path_data in find_all_nodes(item, 'path'):
                        layer_name, width, *coords = path_data[1:]
                        layer_id, width_nm = board.GetLayerID(layer_name), int(width * multiplier)
                        
                        for i in range(0, len(coords) - 2, 2):
                            start_x, start_y = coords[i], coords[i+1]
                            end_x, end_y = coords[i+2], coords[i+3]
                            
                            start_pt = pcbnew.VECTOR2I(int(start_x * multiplier), int(-start_y * multiplier))
                            end_pt = pcbnew.VECTOR2I(int(end_x * multiplier), int(-end_y * multiplier))
                            
                            track = pcbnew.PCB_TRACK(board)
                            track.SetStart(start_pt); track.SetEnd(end_pt)
                            track.SetWidth(width_nm); track.SetLayer(layer_id)
                            track.SetNet(net_info)
                            board.Add(track)
                elif item_type == 'via':
                    if len(item) < 4: continue
                    padstack_name, x, y = item[1], item[2], item[3]
                    x_nm, y_nm = int(x * multiplier), int(-y * multiplier)
                    match = re.search(r'_(\\\\d+):(\\\\d+)_um', padstack_name)
                    if match:
                        via_dia_um, via_drill_um = int(match.group(1)), int(match.group(2))
                        via_dia_nm, via_drill_nm = via_dia_um * 1000, via_drill_um * 1000
                    else:
                        via_dia_nm, via_drill_nm = netclass.GetViaDiameter(), netclass.GetViaDrill()
                        print(f"Warning: Could not parse via size from '{padstack_name}'. Falling back to netclass defaults.", file=sys.stderr)
                    via = pcbnew.PCB_VIA(board)
                    via.SetPosition(pcbnew.VECTOR2I(x_nm, y_nm))
                    via.SetNet(net_info)
                    via.SetDrill(via_drill_nm)
                    via.SetWidth(via_dia_nm)
                    via.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                    board.Add(via)
    except Exception as e:
        log_error_and_exit(f"Failed to parse and apply the routed session (SES) file '{os.path.basename(ses_path)}'. Error: {e}")
`;