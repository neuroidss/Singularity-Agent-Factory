// This is the second part of the kicad_cli_commands script, focusing on layout, routing, and export.
export const KICAD_CLI_LAYOUT_COMMANDS_SCRIPT = `
def get_footprint_shape(footprint_string):
    """Determines if a footprint should be represented as a circle or rectangle."""
    if 'pogo_pin' in str(footprint_string): # Use str() for safety
        return 'circle'
    return 'rectangle'

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
                 center = pcbnew.VECTOR2I(0,0)
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
            # Center the circle at (0,0) when a specific diameter is given
            center = pcbnew.VECTOR2I(0,0)

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
                x_offset, y_offset = pcbnew.FromMM(-10), pcbnew.FromMM(-10) # Centered
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
            w_nm, h_nm = pcbnew.FromMM(width_mm), pcbnew.FromMM(height_mm)
            x_offset, y_offset = -w_nm // 2, -h_nm // 2 # Centered

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
    Extracts component data for client-side layout, optionally generating SVG and 3D models.
    """
    # HARD OVERRIDE: Ensure no visual assets are generated by default.
    args.loadSVGs = False
    args.load3DModels = False
    
    print(f"DEBUG: Running 'arrange_components' for project '{args.projectName}'.", file=sys.stderr)
    print(f"DEBUG: Flag --loadSVGs is forced to: {args.loadSVGs}", file=sys.stderr)
    print(f"DEBUG: Flag --load3DModels is forced to: {args.load3DModels}", file=sys.stderr)
    
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
        board_bbox = board.ComputeBoundingBox(False) # This gets the bounding box of ALL items
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
        
        side = state_comp.get('side', 'top') if state_comp else ('bottom' if fp.IsFlipped() else 'top')

        courtyard_dims = None
        fab_dims = None

        if state_comp:
            if side == 'top':
                courtyard_dims = state_comp.get('CrtYdF_dimensions')
                fab_dims = state_comp.get('FabF_dimensions')
            else: # bottom
                courtyard_dims = state_comp.get('CrtYdB_dimensions')
                fab_dims = state_comp.get('FabB_dimensions')

        if courtyard_dims and courtyard_dims.get('width', 0) > 0:
            width, height = courtyard_dims['width'], courtyard_dims['height']
            dim_source = f"Courtyard ({'Top' if side == 'top' else 'Bottom'})"
        elif fab_dims and fab_dims.get('width', 0) > 0:
            width, height = fab_dims['width'], fab_dims['height']
            dim_source = f"Fab ({'Top' if side == 'top' else 'Bottom'})"
        elif state_comp and state_comp.get('dimensions'):
            width, height = state_comp['dimensions']['width'], state_comp['dimensions']['height']
            dim_source = "Pad BBox"
        else:
            bbox = fp.GetBoundingBox(True, False)
            width, height = pcbnew.ToMM(bbox.GetWidth()), pcbnew.ToMM(bbox.GetHeight())
            dim_source = "Raw BBox Fallback"
        
        print(f"DEBUG: For '{ref}' on side '{side}', using dimensions from '{dim_source}': width={width:.3f}, height={height:.3f}", file=sys.stderr)
        
        svg_path_rel, model_path, model_props = None, None, None

        if args.loadSVGs:
             print(f"DEBUG: SVG LOAD ENABLED for '{ref}'.", file=sys.stderr)
        else:
             print(f"DEBUG: SVG LOAD DISABLED for '{ref}'. No SVG will be generated.", file=sys.stderr)

        if args.load3DModels:
            print(f"DEBUG: 3D MODEL LOAD ENABLED for '{ref}'.", file=sys.stderr)
        else:
            print(f"DEBUG: 3D MODEL LOAD DISABLED for '{ref}'. No GLB will be generated.", file=sys.stderr)
        
        shape = get_footprint_shape(fp.GetFPID().GetLibItemName())

        layout_data["nodes"].append({
            "id": ref, "label": ref, "x": pcbnew.ToMM(fp.GetPosition().x), "y": pcbnew.ToMM(fp.GetPosition().y),
            "rotation": fp.GetOrientationDegrees(), "width": width, "height": height,
            "shape": shape,
            "CrtYdF_dimensions": courtyard_dims if side == 'top' else None,
            "CrtYdB_dimensions": courtyard_dims if side == 'bottom' else None,
            "svgPath": svg_path_rel,
            "glbPath": model_path, "model3d_props": model_props,
            "pins": state_comp.get('pins', []) if state_comp else [],
            "pin_count": len(state_comp.get('pins', [])) if state_comp and state_comp.get('pins') else (state_comp.get('pin_count', 0) if state_comp else 0),
            "side": side
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
    log_and_return(f"Component positions updated and board outline resized to {width_mm:.2f}mm x {height_mm:.2f}mm.")


def autoroute_pcb(args):
    print(f"DEBUG: Running 'autoroute_pcb' for project '{args.projectName}'.", file=sys.stderr)
    print(f"DEBUG: Flag --plotSVG is set to: {args.plotSVG}", file=sys.stderr)
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

    final_svg_path_abs = None
    if args.plotSVG:
        print("DEBUG: FINAL SVG PLOT ENABLED. Plotting routed board...", file=sys.stderr)
        pctl = pcbnew.PLOT_CONTROLLER(board)
        popts = pctl.GetPlotOptions()
        popts.SetOutputDirectory(STATE_DIR)
        popts.SetPlotFrameRef(False); popts.SetAutoScale(False)
        popts.SetScale(4); popts.SetMirror(False); popts.SetUseAuxOrigin(True)
        popts.SetBlackAndWhite(False)

        layers = [
            ("F.Cu", pcbnew.F_Cu, None), ("B.Cu", pcbnew.B_Cu, None),
            ("Edge.Cuts", pcbnew.Edge_Cuts, None), ("F.SilkS", pcbnew.F_SilkS, None),
            ("B.SilkS", pcbnew.B_SilkS, None), ("F.Mask", pcbnew.F_Mask, None),
            ("B.Mask", pcbnew.B_Mask, None),
        ]

        pctl.SetLayer(pcbnew.F_Cu)
        pctl.OpenPlotfile("routed", pcbnew.PLOT_FORMAT_SVG, "Routed board")
        for _, layer_id, _ in layers:
            pctl.SetLayer(layer_id)
            pctl.PlotLayer()
        pctl.ClosePlot()
        
        final_svg_path_abs = get_state_path(args.projectName, 'routed.svg')
        temp_svg_path = os.path.join(STATE_DIR, "routed.svg")
        if os.path.exists(temp_svg_path):
            if os.path.exists(final_svg_path_abs): os.remove(final_svg_path_abs)
            os.rename(temp_svg_path, final_svg_path_abs)
        if final_svg_path_abs and os.path.exists(final_svg_path_abs):
            print(f"DEBUG: Final board SVG created at '{final_svg_path_abs}'", file=sys.stderr)
    else:
        print("DEBUG: FINAL SVG PLOT DISABLED. Skipping final board SVG generation.", file=sys.stderr)

    message = "Autorouting complete."
    data_to_return = {}
    if final_svg_path_abs and os.path.exists(final_svg_path_abs):
        svg_rel_path = os.path.relpath(final_svg_path_abs, os.path.join(os.path.dirname(__file__), '..')).replace(os.path.sep, '/')
        data_to_return["current_artifact"] = {"title": "Routed PCB", "path": svg_rel_path, "svgPath": svg_rel_path}
        message += " SVG preview generated."

    log_and_return(message, data=data_to_return)


def export_fabrication_files(args):
    pcb_path = get_state_path(args.projectName, 'pcb.kicad_pcb')
    if not os.path.exists(pcb_path):
        log_error_and_exit(f"PCB file '{os.path.basename(pcb_path)}' not found for project '{args.projectName}'. Cannot export fabrication files.")

    fab_dir = os.path.join(STATE_DIR, f"{args.projectName}_fab")
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
        error_message = f"kicad-cli failed. Command: '{' '.join(e.cmd)}'. Stderr: {e.stderr}"
        log_error_and_exit(error_message)
    except Exception as e:
        log_error_and_exit(f"An unexpected error occurred during fabrication export: {e}")

    log_and_return("Fabrication files exported and zipped.", {
        "artifacts": {
            "boardName": args.projectName,
            "glbPath": glb_path_rel.replace(os.path.sep, '/'),
            "fabZipPath": zip_path_rel.replace(os.path.sep, '/')
        }
    })
`