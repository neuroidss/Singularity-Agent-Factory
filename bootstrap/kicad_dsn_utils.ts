//this is typescript file with text variable with python code
export const KICAD_DSN_UTILS_SCRIPT = `
import os
import sys
import json
import subprocess
import time
import re
import zipfile
import glob
from math import sin, cos, acos, pi, sqrt, ceil, hypot

# --- pcbnew is needed for PCB manipulation ---
try:
    import sys; sys.path.insert(0,'/usr/lib/python3/dist-packages');
    import pcbnew
except ImportError:
    # This will be handled if a pcbnew-dependent command is run
    pass

# #############################################################################
# --- START VENDORED CODE FROM FREEROUTING_ALT (github.com/jharris2268/kicad-freerouting-plugin-alt) ---
# #############################################################################

# --- s_tuple_parser.py ---
ALL_WHITESPACE_EQUAL=True
class Tuple:
    type='Tuple'
    def __init__(self, vals): self.vals = vals
    def __str__(self): return "(%s)" % "".join(str(v) for v in self.vals)
    def __repr__(self): return "(%s... [%d %d])" % (self.vals[0], len(self.vals), len(str(self)))
    @property
    def non_ws(self): return [v for v in self.vals if not isinstance(v, Whitespace)]
    def find(self, label):
        res=[]
        for v in self.vals:
            if isinstance(v, Tuple) and isinstance(v.vals[0], Label) and v.vals[0].val==label: res.append(v)
        return res
    def __eq__(self, other): return self.type==other.type and self.vals==other.type
    def __hash__(self): return hash((self.type,tuple(self.vals)))

class Whitespace:
    type='Whitespace'
    def __init__(self, val): self.val=val
    def __str__(self): return self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return self.type==other.type and (self.val==other.val or ALL_WHITESPACE_EQUAL)
    def __hash__(self): return hash(self.type) if ALL_WHITESPACE_EQUAL else hash((self.type,self.val))

class Label:
    type='Label'
    def __init__(self, val): self.val=val
    def __str__(self): return self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return self.type==other.type and self.val==other.val
    def __hash__(self): return hash((self.type,self.val))

class QuotedString:
    type='QuotedString'
    def __init__(self, val): self.val=val
    def __str__(self): return '"%s"' % self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return self.type==other.type and self.val==other.val
    def __hash__(self): return hash((self.type,tuple(self.vals)))

# --- dsn/misc.py ---
def get_board_layers(board):
    copper_layers_set = pcbnew.LSET.AllCuMask(board.GetCopperLayerCount())
    non_copper_layers = [
        pcbnew.F_SilkS, pcbnew.B_SilkS, pcbnew.F_Adhes, pcbnew.B_Adhes,
        pcbnew.F_Paste, pcbnew.B_Paste, pcbnew.F_Mask, pcbnew.B_Mask,
        pcbnew.Dwgs_User, pcbnew.Cmts_User, pcbnew.Eco1_User, pcbnew.Eco2_User,
        pcbnew.Edge_Cuts, pcbnew.Margin, pcbnew.F_CrtYd, pcbnew.B_CrtYd,
        pcbnew.F_Fab, pcbnew.B_Fab
    ] + [l for l in range(pcbnew.User_1, pcbnew.User_9 + 1)]
    all_layers = copper_layers_set.Seq() + non_copper_layers
    return [(i, board.GetLayerName(i), pcbnew.LAYER.ShowType(board.GetLayerType(i))) for i in all_layers if board.IsLayerEnabled(i)]

TU = lambda vals: Tuple(vals)
NL = lambda sp=0: Whitespace("\\n"+(" "*sp))
SP = lambda: Whitespace(" ")
LA = lambda la: Label(str(la))
QS = lambda la: QuotedString(str(la))
reserved_chars = {"(", ")", " ", ";", "-", "{", "}", ":"}

def LQ(val):
    s_val = str(val)
    if not s_val: return QS("")
    if any(c in reserved_chars for c in s_val): return QS(s_val)
    return LA(s_val)

def LV(val, nd=6):
    # Simply convert the value to an integer and return it as a string
    return LA(int(val / 1000))

def make_via_name(via_dia, via_drl, num_layers):
    return f'Via[0-{num_layers-1}]_{int(via_dia/1000)}:{int(via_drl/1000)}_um'

# --- dsn/geometry.py ---
get_start = lambda d, use_local: tuple(d.GetStart())
def get_end(d, use_local):
    if d.GetShape() == pcbnew.S_RECT: return get_start(d, use_local)
    return tuple(d.GetEnd())

def merge_drawings(dd, use_local):
    parts = [[get_start(d,use_local), get_end(d,use_local), [(d,False)]] for d in dd]
    last_len = len(parts)+1
    while len(parts)>1 and len(parts) < last_len:
        last_len=len(parts)
        parts = merge_parts(parts)
    return parts

def add_to_parts(result, a,b,c):
    for r in result:
        if a==r[0]:
            r[0] = b; r[2] = [(x,not y) for x,y in reversed(c)]+r[2]; return True
        elif a==r[1]:
            r[1] = b; r[2] = r[2] + c; return True
        elif b==r[0]:
            r[0] = a; r[2] = c + r[2]; return True
        elif b==r[1]:
            r[1] = a; r[2] = r[2]+[(x,not y) for x,y in reversed(c)]; return True
    return False

def merge_parts(parts):
    if len(parts)==1: return parts
    a,b,c=parts[0]
    result = [[a,b,c[:]]]
    for a,b,c in parts[1:]:
        if not add_to_parts(result, a,b,c): result.append([a,b,c])
    return result

def merge_all_drawings(parent, layer, use_local=False):
    """Gets all drawings on a specific layer and merges them into continuous paths."""
    items = []
    if hasattr(parent, 'Drawings'): # For BOARD objects
        # Explicitly convert to list to avoid issues with generator-like objects
        items = list(parent.Drawings())
    elif hasattr(parent, 'GraphicalItems'): # For FOOTPRINT objects
        items = list(parent.GraphicalItems())

    # Filter for PCB_SHAPE objects only, to avoid trying to get start/end from text, etc.
    drawings = [d for d in items if d.GetLayerName() == layer and isinstance(d, pcbnew.PCB_SHAPE)]
    if not drawings:
        return []
    
    merged = merge_drawings(drawings, use_local)
    
    all_paths = []
    for _start_point, _end_point, segments in merged:
        path_coords = []
        if segments:
            first_drawing, first_is_reversed = segments[0]
            path_coords.extend(get_coords(first_drawing, first_is_reversed, use_local))

            for i in range(1, len(segments)):
                drawing, is_reversed = segments[i]
                path_coords.extend(get_coords(drawing, is_reversed, use_local)[1:])
        
        all_paths.append(path_coords)
        
    return all_paths

num_segs=lambda angle,radius: round(pi*angle/360/acos(1-5000/radius)) if radius > 5000 else 1
arc_pos=lambda cx, cy, r, a: (cx+r*cos(a*pi/180), cy+r*sin(a*pi/180))

def arc_coords(arc, is_circle=False,use_local=False):
    cx,cy = arc.GetCenter()
    r=arc.GetRadius()
    sa,sc=0,360
    if not is_circle:
        sa = round(arc.GetArcAngleStartDegrees(),1)
        sc = round(arc.GetArcAngle().AsDegrees(),1)
    nstp=num_segs(sc,r)
    stp=sc/nstp
    if is_circle: return [arc_pos(cx,cy,r,sa+i*stp) for i in range(0,int(nstp)+1)]   
    else: return [get_start(arc,use_local)]+[arc_pos(cx,cy,r,sa+i*stp) for i in range(1,int(nstp))]+[get_end(arc, use_local)]

def get_shape_as_string(shape_enum):
    """Converts a pcbnew.SHAPE_T enum to its string representation."""
    shape_map = {
        pcbnew.S_SEGMENT: 'Line',
        pcbnew.S_RECT: 'Rect',
        pcbnew.S_ARC: 'Arc',
        pcbnew.S_CIRCLE: 'Circle',
        pcbnew.S_POLYGON: 'Polygon',
        pcbnew.S_CURVE: 'Curve',
    }
    return shape_map.get(shape_enum, 'Unknown')

def get_coords(shape, is_reversed, use_local=False):
    res = []
    shape_str = get_shape_as_string(shape.GetShape())
    if shape_str == 'Line': res = [get_start(shape,use_local),get_end(shape,use_local)]
    elif shape_str == 'Arc': res = arc_coords(shape,False,use_local)
    elif shape_str == 'Circle': res = arc_coords(shape, True,use_local)
    elif shape_str in ('Polygon','Rect'):
        x0,y0 = shape.GetParent().GetPosition() if use_local else (0,0)
        res = [(c.x-x0,c.y-y0) for c in shape.GetCorners()]
        res.append(res[0])
    else: print(f"?? Unknown shape {shape_str}", file=sys.stderr)
    if is_reversed: res.reverse()
    return res

def add_coords(xx, coords):
    for i,(x,y) in enumerate(coords):
        if i>0 and (i%4)==0: xx.append(NL(12))
        else: xx.append(SP())
        xx.extend([LV(x), SP(), LV(-y)])

def make_path(layer, coords, width=0):
    xx=[LA("path"), SP(), LQ(layer), SP(), LA(int(width / 1000))]
    add_coords(xx, coords)
    return TU(xx)

def make_polygon(layer, zone):
    outline = zone.Outline()
    if outline.OutlineCount()!=1: raise Exception("can't handle zone with multiple outlines")
    outline_boundary = outline.Outline(0)
    vertices = [outline_boundary.GetPoint(i) for i in range(outline_boundary.PointCount())]
    vertices.append(vertices[0])
    polygon_parts=[LA('polygon'),SP(),LQ(layer), SP(), LA("0")]
    add_coords(polygon_parts, vertices)
    return TU(polygon_parts)

def fix_angle(a, b,side='front'):
    if side=='back': a += 180
    if a==b: return 0
    c=b-a
    if c<=-180: c+=360
    if c>180: c-=360
    return c

def make_shape(shape, layer, size, pos,obj=None):
    x,y=pos
    if shape=='Circle' or shape=='Round':
        return TU([LA('circle'), SP(), LA(layer), SP(), LV(size[0])]+([] if x==0 and y==0 else [SP(),LV(x), SP(), LV(-y)]))
    if shape=='Oval':
        w, h = size
        if w > h:
            ln, wd = (w - h) / 2.0, h
            return TU([LA('path'), SP(), LA(layer), SP(), LV(wd), SP(), LV(x - ln), SP(), LV(-y), SP(), LV(x + ln), SP(), LV(-y)])
        else:
            ln, wd = (h - w) / 2.0, w
            return TU([LA('path'), SP(), LA(layer), SP(), LV(wd), SP(), LV(x), SP(), LV(-y - ln), SP(), LV(x), SP(), LV(-y + ln)])
    if shape=='Rect':
        w,h=size[0]/2, size[1]/2
        return TU([LA('rect'),SP(),LA(layer),SP(),LV(x-w),SP(),LV(-y-h),SP(),LV(x+w),SP(),LV(-y+h)])
    if shape=='RoundRect':
        w,h=size[0]/2,size[1]/2; R = obj.GetRoundRectCornerRadius(); S,C=0.5*R,(1-3**0.5/2)*R
        vertices = [(-w+R,h),(w-R,h),(w-S,h-C),(w-C,h-S),(w,h-R),(w,-h+R),(w-C,-h+S),(w-S,-h+C),(w-R,-h),(-w+R,-h),(-w+S,-h+C),(-w+C,-h+S),(-w,-h+R),(-w,h-R),(-w+C,h-S),(-w+S,h-C),(-w+R,h)]
        vertices = [(a+x,b-y) for a,b in vertices]
        polygon_parts=[LA('polygon'),SP(),LQ(layer), SP(), LA("0")]
        add_coords(polygon_parts, vertices)
        return TU(polygon_parts)
    if shape=='CustomShape':
        bx=obj.GetEffectiveShape().BBox(); a,b,c,d = bx.GetLeft(),bx.GetBottom(),bx.GetRight(),bx.GetTop(); x0,y0 = obj.GetPosition()
        return TU([LA('rect'),SP(),LA(layer),SP(),LV(a-x0),SP(),LV(y0-d),SP(),LV(c-x0),SP(),LV(y0-b)])
    raise Exception(f"can't make shape {shape}")

def make_via_padstack(via_name, via_dia):
    """Creates a padstack definition for a via."""
    padstack = [LA('padstack'), SP(), LQ(via_name)]
    
    # A via is just a circular pad on both top and bottom layers
    shape_top = TU([LA('circle'), SP(), LA('F.Cu'), SP(), LV(via_dia)])
    padstack.extend([NL(6), TU([LA('shape'), SP(), shape_top])])
    
    shape_bottom = TU([LA('circle'), SP(), LA('B.Cu'), SP(), LV(via_dia)])
    padstack.extend([NL(6), TU([LA('shape'), SP(), shape_bottom])])
    
    padstack.extend([NL(6), TU([LA('attach'), SP(), LA('off')]), NL(4)])
    return TU(padstack)

# --- dsn/structure.py ---
def make_structure(board,include_zones, box=None, quarter_smd_clearance=False):
    copper_layers = [(l_id, board.GetLayerName(l_id), pcbnew.LAYER.ShowType(board.GetLayerType(l_id))) for l_id in pcbnew.LSET.AllCuMask(board.GetCopperLayerCount()).Seq()]
    
    structure_parts = []
    for idx, (_, name, layer_type) in enumerate(copper_layers):
        structure_parts.append(TU([LA("layer"),SP(),LA(name),NL(6),TU([LA("type"),SP(),LA(layer_type)]),NL(6),TU([LA("property"),NL(8),TU([LA("index"),SP(),LA(idx)]),NL(6)]),NL(4)]))
    
    boundary_shape=None
    board_edge_merged = merge_all_drawings(board, 'Edge.Cuts')
    if board_edge_merged and len(board_edge_merged[0]) > 1:
        # FIX: The boundary path must be on the special "pcb" layer.
        boundary_shape = make_path("pcb", board_edge_merged[0], width=0)
    else:
        # Fallback to the bounding box of all items if Edge.Cuts is empty
        bbox = board.ComputeBoundingBox(False) # This gets the bounding box of ALL items
        if bbox.GetWidth() > 0 and bbox.GetHeight() > 0:
             # Add a 2mm margin for safety
             margin = 2000000 # 2mm in nanometers
             bbox.Inflate(margin, margin)
             left, bottom, right, top = bbox.GetLeft(), bbox.GetBottom(), bbox.GetRight(), bbox.GetTop()
             coords = [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]
             # FIX: The boundary path must be on the special "pcb" layer.
             boundary_shape = make_path("pcb", coords, width=0)

    if boundary_shape:
        structure_parts.append(TU([LA("boundary"), NL(6), boundary_shape, NL(4)]))
    
    zones = []
    if include_zones:
        for zone in board.Zones():
            layers = [b for a,b,c in copper_layers if zone.IsOnLayer(a)]
            net = zone.GetNet().GetNetname()
            if net and layers:
                for layer in layers:
                    poly = make_polygon(layer, zone)
                    zones.append(TU([LA('plane'),SP(),LQ(net),SP(),poly]))
    structure_parts.extend(zones)
    
    vias_all = {}
    copper_layer_count = board.GetCopperLayerCount()
    for _,net_class in board.GetAllNetClasses().items():
        via_dia, via_drl = net_class.GetViaDiameter(), net_class.GetViaDrill()
        via_name = make_via_name(via_dia, via_drl, copper_layer_count)
        vias_all[via_dia, via_drl] = [via_name, make_via_padstack(via_name, via_dia)]
    
    vias = TU([LA('via')])
    for _,(n,_) in vias_all.items(): vias.vals.extend([SP(),LQ(n)])
    structure_parts.append(vias)
    
    default_netclass = board.GetAllNetClasses()['Default']
    track_width, clearance = default_netclass.GetTrackWidth(), default_netclass.GetClearance()
    rule = TU([LA('rule'),NL(6),TU([LA('width'),SP(),LV(track_width)]),NL(6),TU([LA('clearance'),SP(),LV(clearance)]),NL(6),TU([LA('clearance'),SP(),LV(clearance/4 if quarter_smd_clearance else clearance),SP(), TU([LA("type"),SP(),LA("smd_smd")])]),NL(4)])
    structure_parts.append(rule)    
    
    result = TU([LA("structure")])
    for pp in structure_parts: result.vals.extend([NL(4),pp])
    result.vals.append(NL(2))
    return result, vias_all

# --- dsn/footprints.py ---
def get_local_position(pad, footprint):
    x,y = pad.GetPosition() - footprint.GetPosition()
    rad = -footprint.GetOrientation().AsRadians()
    sina, cosa = sin(rad), cos(rad)
    return pcbnew.VECTOR2I(int(round(x*cosa - y*sina)), int(round(x*sina + y*cosa)))

def get_pad_shape_as_string(shape_enum):
    """Converts a pcbnew.PAD_SHAPE_T enum to its string representation."""
    shape_map = {
        pcbnew.PAD_SHAPE_CIRCLE: 'Circle',
        pcbnew.PAD_SHAPE_RECTANGLE: 'Rect',
        pcbnew.PAD_SHAPE_OVAL: 'Oval',
        pcbnew.PAD_SHAPE_TRAPEZOID: 'Trapezoid',
        pcbnew.PAD_SHAPE_ROUNDRECT: 'RoundRect',
        pcbnew.PAD_SHAPE_CHAMFERED_RECT: 'Chamfered_Rect',
        pcbnew.PAD_SHAPE_CUSTOM: 'CustomShape'
    }
    return shape_map.get(shape_enum, 'Unknown')

class Pads:
    def __init__(self): self.pads = {}
    def __call__(self, pad_obj):
        pad_name, pad_tup = self.make_pad(pad_obj)
        if pad_name is not None and pad_name not in self.pads: self.pads[pad_name]=pad_tup
        return pad_name
    def make_pad(self, pad_obj):
        name = get_pad_shape_as_string(pad_obj.GetShape())
        size = pad_obj.GetSize()
        on_top = pad_obj.IsOnLayer(pcbnew.F_Cu)
        on_bottom = pad_obj.GetLayerSet().Contains(pcbnew.B_Cu)
        
        if not (on_top or on_bottom): return None, None
        
        is_th = pad_obj.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
        letter = 'A' if is_th else 'T' if on_top else 'B'
        
        size_str_um = f"{int(size.x/1000)}x{int(size.y/1000)}"
        pad_name = name + f"[{letter}]Pad_"

        if name == 'RoundRect':
            radius_um = int(pad_obj.GetRoundRectCornerRadius() / 1000)
            pad_name += f"{size_str_um}_{radius_um}_um_{int(pad_obj.GetOrientationDegrees())}_0"
        else: # Circle, Oval, Rect
            pad_name += f"{size_str_um}_um"
        
        padstack = [LA('padstack'), SP(), LQ(pad_name)]
        
        if on_top:
            shape_top = make_shape(name, 'F.Cu', size, (0,0), obj=pad_obj)
            padstack.extend([NL(6),TU([LA('shape'), SP(), shape_top])])
        
        if is_th and on_bottom:
            shape_bottom = make_shape(name, 'B.Cu', size, (0,0), obj=pad_obj)
            padstack.extend([NL(6),TU([LA('shape'), SP(), shape_bottom])])
            
        padstack.extend([NL(6), TU([LA('attach'),SP(), LA('off')]), NL(4)])
        return pad_name, TU(padstack)

def handle_footprints(board, selected_pads=None, box=None):
    components, all_network, pads = {}, {}, Pads()
    for fp in board.Footprints():
        if selected_pads and not str(fp.GetReference()) in selected_pads: continue
        sel_pads = selected_pads.get(str(fp.GetReference())) if selected_pads else None
        comp_name, comp_image, comp_network, place = process_component(pads, fp, sel_pads)
        comp_name_str = str(comp_name)
        if comp_name_str not in components: components[comp_name_str]=[comp_image,[]]
        components[comp_name_str][1].append(place)
        for k,v in comp_network.items():
            k_str = str(k)
            if k_str not in all_network: all_network[k_str]=[]
            all_network[k_str].extend(v)
    return components, all_network, pads.pads

def process_component(pads, fp, sel_pads=None):
    fpid = fp.GetFPID()
    lib_name = str(fpid.GetLibNickname())
    item_name = str(fpid.GetLibItemName())
    name = f"{lib_name}:{item_name}" if lib_name else item_name
    nets={}; parts = [LA('image'), SP(), LQ(name)]
    is_flipped = fp.IsFlipped()
    if is_flipped: fp.SetLayerAndFlip(0)

    outline_layers = ['F.SilkS', 'B.SilkS', 'F.Fab', 'B.Fab', 'F.CrtYd', 'B.CrtYd']
    for layer in outline_layers:
        merged_drawings = merge_all_drawings(fp, layer, use_local=True)
        for path in merged_drawings:
            width = 120 # Default width, e.g., 0.12mm in um. A better implementation would find the real width.
            path_tuple = make_path('F.Cu', path, width)
            parts.extend([NL(6), TU([LA('outline'), SP(), path_tuple])])
            
    for pd in fp.Pads():
        if pd.GetNet() and (sel_pads is None or str(pd.GetNumber()) in sel_pads):
            pad_name=pads(pd)
            if pad_name:
                pos = get_local_position(pd, fp)
                xx = [LA('pin'),SP(),LQ(pad_name),SP(),LQ(str(pd.GetNumber())),SP(),LV(pos.x),SP(),LV(-pos.y)]
                parts.extend([NL(6), TU(xx)])
                net = pd.GetNet()
                if net:
                    net_str = str(net.GetNetname())
                    if net_str not in nets: nets[net_str]=[]
                    nets[net_str].append(f"{fp.GetReference()}-{pd.GetNumber()}")
    if is_flipped: fp.SetLayerAndFlip(31)
    side = 'back' if is_flipped else 'front'
    place = TU([LA('place'), SP(), LQ(fp.GetReference()), SP(), LV(fp.GetPosition().x), SP(), LV(-fp.GetPosition().y), SP(), LA(side), SP(), LV(fp.GetOrientationDegrees()), SP(), TU([LA('PN'), SP(), LQ(str(fp.GetValue()))])])
    return name, TU(parts), nets, place

def make_placement(footprints):
    placement = [LA('placement')]
    for comp_name, (_,places) in footprints.items():
        placement_item = [LA("component"),SP(),LQ(comp_name)]
        for place in places: placement_item.extend([NL(6), place])
        placement.extend([NL(4), TU(placement_item)])
    placement.append(NL(2))
    return TU(placement)

def make_library(footprints, pads):
    library = [LA('library')]
    for comp_name, (comp,_) in footprints.items(): library.extend((NL(4), comp))
    for _,padstack in pads.items(): 
        if padstack: library.extend((NL(4), padstack))
    library.append(NL(2))
    return TU(library)

def make_network(board, vias, nets):
    """Rewritten to be more robust about netclass names."""
    
    # 1. Sanitize all netclass names and prepare data structures
    sanitized_class_map = {}
    netclass_data = {}
    all_board_netclasses = board.GetAllNetClasses()
    
    for original_name, netclass_obj in all_board_netclasses.items():
        name_str = str(original_name)
        if not name_str:
            sanitized_name = 'unnamed_class'
        elif name_str == 'Default':
            sanitized_name = 'kicad_default'
        else:
            sanitized_name = name_str
        
        sanitized_class_map[name_str] = sanitized_name
        
        if sanitized_name not in netclass_data:
            via_dia, via_drl = netclass_obj.GetViaDiameter(), netclass_obj.GetViaDrill()
            netclass_data[sanitized_name] = {
                "track_width": netclass_obj.GetTrackWidth(),
                "clearance": netclass_obj.GetClearance(),
                "via_dia": via_dia,
                "via_drl": via_drl,
                "via_name": vias.get((via_dia, via_drl), [None])[0],
                "nets": []
            }
            
    # 2. Process nets and assign them to sanitized netclasses
    network = [LA('network')]
    for net_name, pins in nets.items():
        network.append(NL(4))
        pin_elements = [LA(p) for p in pins]
        final_pin_elements = []
        for i, pin_el in enumerate(pin_elements):
            if i > 0:
                final_pin_elements.append(SP())
            final_pin_elements.append(pin_el)
        net_item_pins_tuple = TU([LA('pins'), SP()] + final_pin_elements)

        safe_net_name = net_name if net_name else "unnamed_net"
        net_item = [LA('net'), SP(), LQ(safe_net_name), NL(6), net_item_pins_tuple]
        network.append(TU(net_item))

        # Assign net to its class
        net_info = board.FindNet(net_name)
        if net_info:
            original_class_name = str(net_info.GetNetClassName())
            if not original_class_name:
                original_class_name = 'Default'

            sanitized_class_name = sanitized_class_map.get(original_class_name)
            if sanitized_class_name and sanitized_class_name in netclass_data:
                netclass_data[sanitized_class_name]["nets"].append(safe_net_name)

    # 3. Generate class definitions, skipping any that are empty
    for class_name, data in netclass_data.items():
        if not data["nets"] or not data["via_name"]:
            continue
            
        class_item = [LA('class'), SP(), LQ(class_name)]
        for n in data["nets"]:
            class_item.extend([SP(), LQ(n)])
        
        class_item.extend([NL(6), TU([LA('circuit'), NL(8), TU([LA('use_via'), SP(), LQ(data["via_name"])]), NL(6)])])
        class_item.extend([NL(6), TU([LA('rule'), NL(8), TU([LA('width'), SP(), LV(data["track_width"])]), NL(8), TU([LA('clearance'), SP(), LV(data["clearance"])]), NL(6)])])
        network.extend([NL(4), TU(class_item)])
        
    network.append(NL(2))
    return TU(network)

# --- dsn/wiring.py ---
def make_wiring(board, vias, selected_tracks, fixed_wiring):
    res = [LA('wiring')]
    all_tracks = board.Tracks() if selected_tracks is None else selected_tracks
    for track in all_tracks:
        res.append(NL(4))
        if track.Type() == pcbnew.PCB_VIA_T:
            via_key = (track.GetWidth(), track.GetDrill())
            if via_key in vias:
                via_name = vias[via_key][0]
                vals = [LA('via'), SP(), LQ(via_name), SP(), LV(track.GetPosition().x), SP(), LV(-track.GetPosition().y), SP(), TU([LA('net'), SP(), LQ(track.GetNetname())])]
                if fixed_wiring: vals.extend([SP(), TU([LA('type'), SP(), LA('route')])])
                res.append(TU(vals))
        else:
            width_val = track.GetWidth()
            width_str = LV(width_val)

            vals = [LA('wire'), SP(), TU([LA('path'), SP(), LA(track.GetLayerName()), SP(), width_str, SP(), LV(track.GetStart().x), SP(), LV(-track.GetStart().y), SP(), LV(track.GetEnd().x), SP(), LV(-track.GetEnd().y)]), SP(), TU([LA('net'), SP(), LQ(track.GetNetname())])]
            if fixed_wiring: vals.extend([SP(), TU([LA('type'), SP(), LA('route')])])
            res.append(TU(vals))
    res.append(NL(2))
    return TU(res)

# --- dsn/__init__.py (as board_to_dsn function) ---
def board_to_dsn(filename, board, include_zones=False, selected_pads=None, selected_tracks=None, box=None, fixed_wiring=True):
    structure, vias = make_structure(board,include_zones, box)
    footprints, nets, pads = handle_footprints(board, selected_pads, box)
    pads.update((v[0], v[1]) for _,v in vias.items())
    result = [LA("pcb"), SP(), LQ(os.path.basename(filename))]
    result.extend([NL(2), TU([LA("parser"),NL(4),TU([LA("string_quote"),SP(),LA('"')]),NL(4),TU([LA("space_in_quoted_tokens"),SP(),LA("on")]),NL(4),TU([LA("host_cad"),SP(),QS("KiCad/Singularity")]),NL(4),TU([LA("host_version"),SP(),QS(pcbnew.FullVersion())]),NL(2)])])
    result.extend([NL(2), TU([LA("resolution"),SP(),LA("um"),SP(),LA("10")])])
    result.extend([NL(2), TU([LA("unit"),SP(),LA("um")])])
    result.extend([NL(2), structure])
    result.extend([NL(2), make_placement(footprints)])
    result.extend([NL(2), make_library(footprints, pads)])
    result.extend((NL(2), make_network(board, vias, nets)))
    # The autorouter needs an UNROUTED board. Exporting existing wiring confuses it.
    # result.extend((NL(2), make_wiring(board, vias, selected_tracks, fixed_wiring)))
    result.append(NL())
    return TU(result)

# --- tracks.py ---
def pcbpoint(p): return pcbnew.VECTOR2I(int(p[0] * 1000), int(p[1] * -1000))
def split_coords(coords):
    for i in range(0, len(coords)-3, 2): yield pcbpoint(coords[i:i+2]), pcbpoint(coords[i+2:i+4])

class Tracks:
    def __init__(self, pcb):
        self.pcb = pcb
        self.nets = pcb.GetNetsByName()
        self.via_sizes = {}
        copper_layer_count = pcb.GetCopperLayerCount()
        for _, v in pcb.GetAllNetClasses().items():
            via_dia, via_drl = v.GetViaDiameter(),v.GetViaDrill()
            self.via_sizes[make_via_name(via_dia, via_drl, copper_layer_count)] = (via_dia, via_drl)
        self.tracks, self.vias = {}, {}
    def __call__(self, p):
        if p is None: return
        if p['object_type']=='track': self.track(p)
        elif p['object_type']=='via': self.via(p)
    def make_track(self, obj, fr, to):
        track = pcbnew.PCB_TRACK(self.pcb); track.SetStart(fr); track.SetEnd(to)
        track.SetWidth(int(obj['width'] * 1000));
        track.SetLayer(self.pcb.GetLayerID(obj['layer'])); track.SetNet(self.nets[obj['nets'][0]])
        return track
    def make_via(self, obj):
        via = pcbnew.PCB_VIA(self.pcb); via.SetPosition(pcbpoint([obj['x'], obj['y']]))
        via_dia, via_drl = self.via_sizes[obj['padstack']]; via.SetWidth(via_dia); via.SetDrill(via_drl)
        via.SetNet(self.nets[obj['nets'][0]])
        return via
    def track(self, p):
        i, op = p['id'], p['operation']
        if op in ('new', 'changed'):
            if i in self.tracks:
                for t in self.tracks[i]: self.pcb.Remove(t)
            tt = [self.make_track(p, fr, to) for fr, to in split_coords(p['coords'])]
            for t in tt: self.pcb.Add(t)
            self.tracks[i] = tt
        elif op == 'deleted' and i in self.tracks:
            for t in self.tracks[i]: self.pcb.Remove(t)
            del self.tracks[i]
    def via(self, p):
        i, op = p['id'], p['operation']
        if op in ('new', 'changed'):
            if i in self.vias: self.pcb.Remove(self.vias[i])
            v = self.make_via(p); self.pcb.Add(v); self.vias[i] = v
        elif op == 'deleted' and i in self.vias:
            self.pcb.Remove(self.vias[i]); del self.vias[i]

# --- messages.py ---
import struct
def read_exact(sock, ln):
    res = b''
    while len(res) < ln:
        x = sock.read(ln - len(res))
        if not x: raise Exception(f"read {ln} bytes from {sock} failed")
        res+=x
    return res

class MessageReceiver:
    def __init__(self, board_handler, message_handler, responses, get_process, raw_message_logger=None):
        self.board_handler, self.message_handler, self.responses, self.get_process, self.raw_message_logger = board_handler, message_handler, self.responses, get_process, raw_message_logger
    def read_all(self):
        while self.read_next(): pass
    def handle_wait_reply(self, proc, msg):
        if msg.get('wait_reply')==True:
            # To avoid JS interpreting escape sequences like \\\\x00 as null bytes when writing the script,
            # we construct the bytes from a list of integers. This is safe for both JS stringification
            # and Python execution, creating the required 5-byte sequence [0, 0, 0, 1, 1].
            proc.stdin.write(bytes([0, 0, 0, 1, 1])); proc.stdin.flush()
    def read_next(self):
        proc = self.get_process();
        if proc is None: return False
        try:
            ln, = struct.unpack('>L',read_exact(proc.stdout, 4))
            msg_bytes = read_exact(proc.stdout, ln)
            if self.raw_message_logger is not None: self.raw_message_logger(msg_bytes.decode('utf-8'))
            msg = json.loads(msg_bytes.decode('utf-8'))
            if msg['type'] == 'message': self.message_handler(msg); self.handle_wait_reply(proc, msg); return True
            if msg['type'] == 'finished': self.handle_wait_reply(proc, msg); self.board_handler(None); self.message_handler(None); return False
            if msg['type'] == 'board_notify': self.handle_wait_reply(proc, msg); self.board_handler(msg); return True
            if msg['type'] == 'request':
                rr = self.responses.get(msg['request_type'], {}); jj = rr(msg) if callable(rr) else rr
                jjp = json.dumps(jj).encode('utf-8'); zz = struct.pack('>L', len(jjp))+jjp
                proc.stdin.write(zz); proc.stdin.flush(); return True
            return True
        except Exception as ex:
            print(f"MessageReceiver Error: {ex}", file=sys.stderr)
            return False

# #############################################################################
# --- END VENDORED CODE ---
# #############################################################################
`
