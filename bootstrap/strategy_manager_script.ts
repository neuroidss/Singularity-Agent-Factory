// This file exports the Python script content as a string,
// which will be used by the 'Install Strategic Cognition Suite' tool.

export const STRATEGIC_MEMORY_SCRIPT = `
import argparse
import json
import os
import sys
import fcntl
import traceback

# --- Configuration ---
# The script is in server/scripts, so we go up one level to find the assets dir.
STATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
MEMORY_FILE = os.path.join(STATE_DIR, 'strategic_memory.json')
LOCK_FILE = MEMORY_FILE + '.lock'

# --- Utility Functions ---
def log_error_and_exit(message):
    """Prints a JSON error message to stderr and exits."""
    print(json.dumps({"error": message, "trace": traceback.format_exc()}), file=sys.stderr)
    sys.exit(1)

def read_graph_with_lock():
    """Reads the memory graph from disk, handling locking and file creation."""
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(LOCK_FILE, 'w') as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            if not os.path.exists(MEMORY_FILE):
                return {"nodes": [], "edges": []}
            with open(MEMORY_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            # If the file is corrupted, return a default structure
            return {"nodes": [], "edges": []}
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)

def write_graph_with_lock(graph_data):
    """Writes the memory graph to disk, handling locking."""
    with open(LOCK_FILE, 'w') as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            with open(MEMORY_FILE, 'w') as f:
                json.dump(graph_data, f, indent=2)
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)

# --- Command Functions ---
def handle_read(args):
    """Reads and prints the entire graph to stdout."""
    graph = read_graph_with_lock()
    print(json.dumps(graph))

def handle_define_directive(args):
    """Adds a new 'Directive' node to the graph."""
    graph = read_graph_with_lock()
    
    # Check if node already exists
    if any(n['id'] == args.id for n in graph['nodes']):
        log_error_and_exit(f"Directive with id '{args.id}' already exists.")

    # Add the new directive node
    new_directive = {"id": args.id, "label": args.label, "type": "directive"}
    graph['nodes'].append(new_directive)

    # If a parent is specified, add an edge
    if args.parent:
        if not any(n['id'] == args.parent for n in graph['nodes']):
            log_error_and_exit(f"Parent node with id '{args.parent}' not found.")
        graph['edges'].append({"source": args.parent, "target": args.id})
    
    write_graph_with_lock(graph)
    print(json.dumps({"success": True, "message": f"Directive '{args.label}' defined."}))

def handle_update_memory(args):
    """Adds or updates nodes and edges in the graph."""
    graph = read_graph_with_lock()
    
    nodes_updated = 0
    nodes_added = 0
    edges_added = 0

    # Process nodes
    if args.nodes:
        try:
            new_nodes = json.loads(args.nodes)
            if not isinstance(new_nodes, list):
                raise ValueError("Nodes argument must be a JSON list.")
        except (json.JSONDecodeError, ValueError) as e:
            log_error_and_exit(f"Invalid JSON in --nodes argument: {e}")

        existing_node_ids = {n['id']: n for n in graph['nodes']}
        for node in new_nodes:
            if 'id' not in node:
                continue # Skip nodes without an ID
            if node['id'] in existing_node_ids:
                # Update existing node
                existing_node_ids[node['id']].update(node)
                nodes_updated += 1
            else:
                # Add new node
                graph['nodes'].append(node)
                existing_node_ids[node['id']] = node # Add to map for edge checking
                nodes_added += 1

    # Process edges
    if args.edges:
        try:
            new_edges = json.loads(args.edges)
            if not isinstance(new_edges, list):
                raise ValueError("Edges argument must be a JSON list.")
        except (json.JSONDecodeError, ValueError) as e:
            log_error_and_exit(f"Invalid JSON in --edges argument: {e}")

        existing_edge_set = {f"{e['source']}-{e['target']}" for e in graph['edges']}
        all_node_ids = {n['id'] for n in graph['nodes']}

        for edge in new_edges:
            if 'source' in edge and 'target' in edge:
                # Ensure nodes exist before adding an edge
                if edge['source'] not in all_node_ids or edge['target'] not in all_node_ids:
                    continue # Skip edges with missing nodes
                
                edge_key = f"{edge['source']}-{edge['target']}"
                if edge_key not in existing_edge_set:
                    graph['edges'].append(edge)
                    existing_edge_set.add(edge_key)
                    edges_added += 1

    write_graph_with_lock(graph)
    message = f"Strategic Memory updated: {nodes_added} nodes added, {nodes_updated} nodes updated, {edges_added} edges added."
    print(json.dumps({"success": True, "message": message}))

# --- Main Entry Point ---
def main():
    parser = argparse.ArgumentParser(description="Strategic Memory Manager for Singularity Agent")
    subparsers = parser.add_subparsers(dest='command', required=True)

    # Read command
    p_read = subparsers.add_parser('read', help='Read the entire strategic memory graph.')
    p_read.set_defaults(func=handle_read)

    # Define Directive command
    p_directive = subparsers.add_parser('define_directive', help='Define a new long-term directive.')
    p_directive.add_argument('--id', required=True, help='Unique machine-readable ID.')
    p_directive.add_argument('--label', required=True, help='Human-readable description.')
    p_directive.add_argument('--parent', help='Optional ID of a parent node to connect to.')
    p_directive.set_defaults(func=handle_define_directive)

    # Update Memory command
    p_update = subparsers.add_parser('update_memory', help='Add or update nodes and edges.')
    p_update.add_argument('--nodes', help='JSON string of an array of node objects.')
    p_update.add_argument('--edges', help='JSON string of an array of edge objects.')
    p_update.set_defaults(func=handle_update_memory)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
`;
