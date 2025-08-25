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
    # This path might be needed in some environments, but can cause issues in others.
    # It's a common workaround for Linux systems.
    sys.path.insert(0, '/usr/lib/python3/dist-packages')
    import pcbnew
except ImportError:
    # This will be handled gracefully if a pcbnew-dependent command is run
    pcbnew = None

# #############################################################################
# --- START VENDORED CODE FROM FREEROUTING_ALT (github.com/jharris2268/kicad-freerouting-plugin-alt) ---
# This code has been adapted and corrected for modern KiCad APIs based on the logic in the C++ source.
# #############################################################################

# --- s_tuple_parser.py ---
ALL_WHITESPACE_EQUAL=True
class Tuple:
    type='Tuple'
    def __init__(self, vals): self.vals = vals
    def __str__(self): return "(%s)" % "".join(str(v) for v in self.vals)
    def __repr__(self): return "(%s... [%d %d])" % (self.vals[0] if self.vals else '', len(self.vals), len(str(self)))
    @property
    def non_ws(self): return [v for v in self.vals if not isinstance(v, Whitespace)]
    def find(self, label):
        res=[]
        for v in self.vals:
            if isinstance(v, Tuple) and v.vals and isinstance(v.vals[0], Label) and v.vals[0].val==label: res.append(v)
        return res
    def __eq__(self, other): return isinstance(other, Tuple) and self.type==other.type and self.vals==other.vals
    def __hash__(self): return hash((self.type,tuple(self.vals)))

class Whitespace:
    type='Whitespace'
    def __init__(self, val): self.val=val
    def __str__(self): return self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return isinstance(other, Whitespace) and self.type==other.type and (self.val==other.val or ALL_WHITESPACE_EQUAL)
    def __hash__(self): return hash(self.type) if ALL_WHITESPACE_EQUAL else hash((self.type,self.val))

class Label:
    type='Label'
    def __init__(self, val): self.val=val
    def __str__(self): return self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return isinstance(other, Label) and self.type==other.type and self.val==other.val
    def __hash__(self): return hash((self.type,self.val))

class QuotedString:
    type='QuotedString'
    def __init__(self, val): self.val=val
    def __str__(self): return '"%s"' % self.val
    def __repr__(self): return repr(str(self))
    def __eq__(self, other): return isinstance(other, QuotedString) and self.type==other.type and self.val==other.val
    def __hash__(self): return hash((self.type,self.val))

# --- dsn/misc.py ---
def get_board_layers(board):
    return [(i,board.GetLayerName(i),pcbnew.LAYER.ShowType(board.GetLayerType(i))) for i in board.GetDesignSettings().GetEnabledLayers().Seq()]

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
    # This function is now for coordinates and dimensions, scaled to micrometers (um)
    float_val = val / 1000.0 # Convert nanometers to micrometers
    # Format with up to 'nd' decimal places, stripping trailing zeros for cleaner output
    formatted = f"{float_val:.{nd}f}".rstrip('0').rstrip('.')
    return LA(formatted if formatted != '-0' else '0')


def make_via_name(via_dia, via_drl, num_layers):
    return f'Via[0-{num_layers-1}]_{int(via_dia/1000)}:{int(via_drl/1000)}_um'

# --- dsn/geometry.py ---
def get_start(d, use_local):
    return tuple(d.GetStart())

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
    items = []
    if hasattr(parent, 'Drawings'):
        items = list(parent.Drawings())
    elif hasattr(parent, 'GraphicalItems'):
        items = list(parent.GraphicalItems())

    drawings = [d for d in items if d.GetLayerName() == layer and isinstance(d, pcbnew.PCB_SHAPE)]
    if not drawings: return []
    
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

num_segs=lambda angle,radius: round(pi*abs(angle)/360/acos(1-5000/radius)) if radius > 5000 else 16
arc_pos=lambda cx, cy, r, a: (cx+r*cos(a*pi/180), cy+r*sin(a*pi/180))

def arc_coords(arc, is_circle=False,use_local=False):
    cx,cy = arc.GetCenter()
    r=arc.GetRadius()
    sa,sc=0,360
    if not is_circle:
        sa = round(arc.GetArcAngleStartDegrees(),1)
        sc = round(arc.GetArcAngle().AsDegrees(),1)
    nstp=num_segs(sc,r)
    stp=sc/nstp if nstp > 0 else 0
    if is_circle: return [arc_pos(cx,cy,r,sa+i*stp) for i in range(0,int(nstp)+1)]
    else: return [get_start(arc,use_local)]+[arc_pos(cx,cy,r,sa+i*stp) for i in range(1,int(nstp))]+[get_end(arc, use_local)]

def get_shape_as_string(shape_enum):
    shape_map = {pcbnew.S_SEGMENT: 'Line', pcbnew.S_RECT: 'Rect', pcbnew.S_ARC: 'Arc', pcbnew.S_CIRCLE: 'Circle', pcbnew.S_POLYGON: 'Polygon', pcbnew.S_CURVE: 'Curve'}
    return shape_map.get(shape_enum, 'Unknown')

def get_coords(shape, is_reversed, use_local=False):
    res = []
    shape_str = get_shape_as_string(shape.GetShape())
    if shape_str == 'Line': res = [get_start(shape,use_local),get_end(shape,use_local)]
    elif shape_str == 'Arc': res = arc_coords(shape,False,use_local)
    elif shape_str == 'Circle': res = arc_coords(shape, True,use_local)
    elif shape_str in ('Polygon','Rect'):
        res = [(c.x,c.y) for c in shape.GetCorners()]
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
    xx=[LA("path"), SP(), LQ(layer), SP(), LV(width)]
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

def fix_angle(fp_angle_deg, item_angle_deg, side='front'):
    """Correctly calculates the DSN angle based on footprint side and rotation."""
    if side == 'back':
        # Per specctra.cpp logic, the angle for back-side components is mirrored.
        final_angle = 180.0 - item_angle_deg
    else:
        final_angle = item_angle_deg

    # Normalize angle to be within [0, 360) and format it.
    final_angle = final_angle % 360
    if final_angle < 0:
        final_angle += 360
    
    # Return as a string with fixed precision, removing trailing zeros.
    return f"{final_angle:.6f}".rstrip('0').rstrip('.')

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
        bx=obj.GetEffectiveShape().BBox(); a,b,c,d = bx.GetLeft(),bx.GetBottom(),bx.GetRight(),bx.GetTop(); pos = obj.GetPosition(); x0,y0 = pos.x, pos.y
        return TU([LA('rect'),SP(),LA(layer),SP(),LV(a-x0),SP(),LV(y0-d),SP(),LV(c-x0),SP(),LV(y0-b)])
    raise Exception(f"can't make shape {shape}")

def make_via_padstack(via_name, via_dia, num_layers, board_ref):
    padstack = [LA('padstack'), SP(), LQ(via_name)]
    for i in range(num_layers):
        layer_id = board_ref.GetLayerID(pcbnew.BOARD.GetStandardLayerName(i))
        if pcbnew.IsCopperLayer(layer_id):
            layer_name = board_ref.GetLayerName(layer_id)
            shape_tuple = TU([LA('circle'), SP(), LA(layer_name), SP(), LV(via_dia)])
            padstack.extend([NL(6), TU([LA('shape'), SP(), shape_tuple])])
    padstack.extend([NL(6), TU([LA('attach'), SP(), LA('off')]), NL(4)])
    return TU(padstack)

# --- dsn/structure.py ---
def make_structure(board,include_zones, box=None):
    copper_layers = [(l_id, board.GetLayerName(l_id), pcbnew.LAYER.ShowType(board.GetLayerType(l_id))) for l_id in pcbnew.LSET.AllCuMask(board.GetCopperLayerCount()).Seq()]
    
    structure_parts = []
    for idx, (l_id, name, layer_type) in enumerate(copper_layers):
        structure_parts.append(TU([LA("layer"),SP(),LA(name),NL(6),TU([LA("type"),SP(),LA(layer_type)]),NL(6),TU([LA("property"),NL(8),TU([LA("index"),SP(),LA(idx)]),NL(6)]),NL(4)]))
    
    boundary_shape=None
    board_edge_merged = merge_all_drawings(board, 'Edge.Cuts')
    if board_edge_merged and len(board_edge_merged[0]) > 1:
        boundary_shape = make_path("pcb", board_edge_merged[0], width=0)
    else:
        bbox = board.ComputeBoundingBox(False)
        if bbox.GetWidth() > 0 and bbox.GetHeight() > 0:
             margin = 2000000
             bbox.Inflate(margin, margin)
             left, bottom, right, top = bbox.GetLeft(), bbox.GetBottom(), bbox.GetRight(), bbox.GetTop()
             coords = [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]
             boundary_shape = make_path("pcb", coords, width=0)

    if boundary_shape:
        structure_parts.append(TU([LA("boundary"), NL(6), boundary_shape, NL(4)]))
    
    if include_zones:
        for zone in board.Zones():
            layers = [b for a,b,c in copper_layers if zone.IsOnLayer(a)]
            net = zone.GetNet()
            if net and net.GetNetCode() != 0 and layers:
                for layer in layers:
                    poly = make_polygon(layer, zone)
                    structure_parts.append(TU([LA('plane'),SP(),LQ(net.GetNetname()),SP(),poly]))
    
    vias_all = {}
    copper_layer_count = board.GetCopperLayerCount()
    for _,net_class in board.GetAllNetClasses().items():
        via_dia, via_drl = net_class.GetViaDiameter(), net_class.GetViaDrill()
        via_name = make_via_name(via_dia, via_drl, copper_layer_count)
        vias_all[(via_dia, via_drl)] = [via_name, make_via_padstack(via_name, via_dia, copper_layer_count, board)]
    
    vias_tuple = TU([LA('via')])
    for _,(n,_) in vias_all.items(): vias_tuple.vals.extend([SP(),LQ(n)])
    structure_parts.append(vias_tuple)
    
    default_netclass = board.GetAllNetClasses()['Default']
    track_width, clearance = default_netclass.GetTrackWidth(), default_netclass.GetClearance()
    rule = TU([LA('rule'),NL(6),TU([LA('width'),SP(),LV(track_width)]),NL(6),TU([LA('clearance'),SP(),LV(clearance)]),NL(6),TU([LA('clearance'),SP(),LV(50000),SP(), TU([LA("type"),SP(),LA("smd_smd")])]),NL(4)])
    structure_parts.append(rule)    
    
    result = TU([LA("structure")])
    for pp in structure_parts: result.vals.extend([NL(4),pp])
    result.vals.append(NL(2))
    return result, vias_all

# --- dsn/footprints.py ---
def get_local_position(pad, footprint):
    pos = pad.GetPosition() - footprint.GetPosition()
    rad = -footprint.GetOrientation().AsRadians()
    sina, cosa = sin(rad), cos(rad)
    return pcbnew.VECTOR2I(int(round(pos.x*cosa - pos.y*sina)), int(round(pos.x*sina + pos.y*cosa)))

def get_pad_shape_as_string(shape_enum):
    shape_map = {pcbnew.PAD_SHAPE_CIRCLE: 'Circle', pcbnew.PAD_SHAPE_RECTANGLE: 'Rect', pcbnew.PAD_SHAPE_OVAL: 'Oval', pcbnew.PAD_SHAPE_TRAPEZOID: 'Trapezoid', pcbnew.PAD_SHAPE_ROUNDRECT: 'RoundRect', pcbnew.PAD_SHAPE_CHAMFERED_RECT: 'Chamfered_Rect', pcbnew.PAD_SHAPE_CUSTOM: 'CustomShape'}
    return shape_map.get(shape_enum, 'Unknown')

class Pads:
    def __init__(self): self.pads = {}
    def __call__(self, pad_obj):
        pad_name, pad_tup = self.make_pad(pad_obj)
        if pad_name is not None and pad_name not in self.pads: self.pads[pad_name]=pad_tup
        return pad_name
    def make_pad(self, pad_obj):
        name = get_pad_shape_as_string(pad_obj.GetShape())
        size_tuple, offset_tuple = pad_obj.GetSize(), pad_obj.GetOffset()
        size, offset = (size_tuple.x, size_tuple.y), (offset_tuple.x, offset_tuple.y)
        layer_set = pad_obj.GetLayerSet()
        on_top, on_bottom = layer_set.Contains(pcbnew.F_Cu), layer_set.Contains(pcbnew.B_Cu)
        if not (on_top or on_bottom): return None, None
        is_th = pad_obj.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
        letter = 'A' if is_th else 'T' if on_top else 'B'
        x,y = size
        size_str = f'{int(x/1000)}x{int(y/1000)}'
        pad_name = f"{name.capitalize()}[{letter}]Pad_{size_str}_um"
        
        padstack = [LA('padstack'), SP(), LQ(pad_name)]
        board_ref = pad_obj.GetBoard() # Store reference
        for layer_id in layer_set.Seq():
            if pcbnew.IsCopperLayer(layer_id):
                layer_name = board_ref.GetLayerName(layer_id)
                shape_tuple = make_shape(name, layer_name, size, offset, obj=pad_obj)
                padstack.extend([NL(6),TU([LA('shape'), SP(), shape_tuple])])
        padstack.extend([NL(6), TU([LA('attach'),SP(), LA('off')]), NL(4)])
        return pad_name, TU(padstack)

def handle_footprints(board, selected_pads=None):
    components, all_network, pads = {}, {}, Pads()
    for fp in board.Footprints():
        comp_name, comp_image, comp_network, place = process_component(board, pads, fp)
        comp_name_str = str(comp_name)
        if comp_name_str not in components: components[comp_name_str]=[comp_image,[]]
        components[comp_name_str][1].append(place)
        for k,v in comp_network.items():
            k_str = str(k)
            if k_str not in all_network: all_network[k_str]=[]
            all_network[k_str].extend(v)
    return components, all_network, pads.pads

def process_component(board, pads, fp):
    fpid = fp.GetFPID()
    name = str(fpid.GetLibItemName())
    nets={}; parts = [LA('image'), SP(), LQ(f"{fpid.GetLibNickname()}:{name}")]
    
    for pd in fp.Pads():
        # Correctly check for unconnected pads (net code 0)
        if pd.GetNet() and pd.GetNetCode() != 0:
            pad_name=pads(pd)
            if pad_name:
                pos = get_local_position(pd, fp)
                pad_angle = pd.GetOrientationDegrees() 
                
                xx = [LA('pin'),SP(),LQ(pad_name)]
                if pad_angle != 0:
                    xx.extend([SP(), TU([LA('rotate'),SP(), LA(fix_angle(0, pad_angle))])])
                xx.extend([SP(),LQ(str(pd.GetNumber())),SP(),LV(pos.x),SP(),LV(-pos.y)])
                parts.extend([NL(6), TU(xx)])
                
                net = pd.GetNet()
                net_str = str(net.GetNetname())
                if net_str not in nets: nets[net_str]=[]
                nets[net_str].append(f"{fp.GetReference()}-{pd.GetNumber()}")
                
    side = 'back' if fp.IsFlipped() else 'front'
    angle = fix_angle(0, fp.GetOrientationDegrees(), side)
    
    place = TU([LA('place'), SP(), LQ(fp.GetReference()), SP(), LV(fp.GetPosition().x), SP(), LV(-fp.GetPosition().y), SP(), LA(side), SP(), LA(angle), SP(), TU([LA('PN'), SP(), LQ(str(fp.GetValue()))])])
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
    net_classes = {str(name): obj for name, obj in board.GetAllNetClasses().items()}
    network = [LA('network')]
    
    class_to_nets = {str(nc.GetName()): [] for nc in net_classes.values()}
    for net_info in board.GetNetsByNetcode().values():
        class_name = str(net_info.GetNetClassName())
        if class_name in class_to_nets:
            class_to_nets[class_name].append(str(net_info.GetNetname()))

    for net_name, pins in nets.items():
        network.extend([NL(4), TU([LA('net'), SP(), LQ(net_name), NL(6), TU([LA('pins'), SP()] + [LQ(p) for p in pins])])])

    for class_name_orig, nc_obj in net_classes.items():
        class_name = 'kicad_default' if class_name_orig == 'Default' else class_name_orig
        nets_in_class = class_to_nets.get(class_name_orig, [])
        if not nets_in_class: continue

        via_dia, via_drl = nc_obj.GetViaDiameter(), nc_obj.GetViaDrill()
        via_name_info = vias.get((via_dia, via_drl), [None])
        via_name = via_name_info[0]
        if not via_name: continue

        class_item = [LA('class'), SP(), LQ(class_name)]
        for n in nets_in_class: class_item.extend([SP(), LQ(n)])
        
        class_item.extend([NL(6), TU([LA('circuit'), NL(8), TU([LA('use_via'), SP(), LQ(via_name)]), NL(6)])])
        class_item.extend([NL(6), TU([LA('rule'), NL(8), TU([LA('width'), SP(), LV(nc_obj.GetTrackWidth())]), NL(8), TU([LA('clearance'), SP(), LV(nc_obj.GetClearance())]), NL(6)])])
        network.extend([NL(4), TU(class_item)])
        
    network.append(NL(2))
    return TU(network)

# --- dsn/wiring.py ---
def make_wiring(board, vias, selected_tracks, fixed_wiring):
    # Autorouters need an unrouted board. Returning an empty wiring section is correct.
    return TU([LA('wiring')])

# --- dsn/__init__.py (as board_to_dsn function) ---
def board_to_dsn(filename, board, include_zones=False, selected_pads=None, selected_tracks=None, box=None, fixed_wiring=True):
    structure_info = make_structure(board, include_zones, box)
    structure, vias = structure_info[0], structure_info[1]
    footprints, nets, pads = handle_footprints(board, selected_pads)
    pads.update((v[0], v[1]) for _,v in vias.items())
    
    result = [LA("pcb"), SP(), LQ(os.path.basename(filename))]
    result.extend([NL(2), TU([LA("parser"),NL(4),TU([LA("string_quote"),SP(),LA('"')]),NL(4),TU([LA("space_in_quoted_tokens"),SP(),LA("on")]),NL(4),TU([LA("host_cad"),SP(),QS("KiCad/Singularity")]),NL(4),TU([LA("host_version"),SP(),QS(pcbnew.GetBuildVersion())]),NL(2)])])
    result.extend([NL(2), TU([LA("resolution"),SP(),LA("um"),SP(),LA("10")])])
    result.extend([NL(2), TU([LA("unit"),SP(),LA("um")])])
    result.extend([NL(2), structure])
    result.extend([NL(2), make_placement(footprints)])
    result.extend([NL(2), make_library(footprints, pads)])
    result.extend((NL(2), make_network(board, vias, nets)))
    result.extend((NL(2), make_wiring(board, vias, selected_tracks, fixed_wiring)))
    result.append(NL())
    return TU(result)
`;