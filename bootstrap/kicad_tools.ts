
import type { ToolCreatorPayload } from '../types';

// This is a comprehensive Python script that acts as a command-line utility for various KiCad tasks.
// It is synthesized from the user's provided Python source files (schematic_generator, router, etc.).
// It manages state by writing/reading temporary JSON files.
const KICAD_CLI_SCRIPT = `
import os
import sys
import json
import subprocess
import time
import re
import zipfile
import glob
import traceback
from math import sin, cos, acos, pi

# --- SKiDL is only needed for netlist generation ---
try:
    from skidl import *
except ImportError:
    # This will be handled gracefully in create_netlist
    pass

# --- pcbnew is needed for PCB manipulation ---
try:
    import sys; sys.path.insert(0,'/usr/lib/python3/dist-packages');
    import pcbnew
except ImportError:
    # This will be handled if a pcbnew-dependent command is run
    pass

# --- State File Configuration ---
STATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(STATE_DIR, exist_ok=True)
# Freerouting configuration - assumes freerouting.jar is in the same directory as this script
FREEROUTING_JAR_PATH = os.path.join(os.path.dirname(__file__), 'freerouting_stdout.jar')

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
    def __hash__(self): return hash((self.type,self.val))

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
    val_um = float(val) / 1000.0
    return LA(f"{val_um:.{nd}f}")

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

def merge_all_drawings(obj, layer, use_local=False):
    drawings = []
    if isinstance(obj,pcbnew.BOARD):
        drawings = [d for d in obj.Drawings() if d.GetLayerName()==layer and d.GetTypeDesc()=='Graphic']
        for fp in obj.Footprints(): drawings.extend([d for d in fp.GraphicalItems() if d.GetLayerName()==layer and d.GetTypeDesc()=='Graphic'])
    else: drawings = [d for d in obj.GraphicalItems() if d.GetLayerName()==layer and d.GetTypeDesc()=='Graphic']
    drawings_merged = merge_drawings(drawings,use_local)
    paths = []
    for merged in drawings_merged:
        path=[]
        for x,y in merged[2]:
            cc = get_coords(x,y,use_local)
            if not path: path.extend(cc)
            else: path.extend(cc[1:])
        paths.append(path)
    return paths

def add_coords(xx, coords):
    for i,(x,y) in enumerate(coords):
        if i>0 and (i%4)==0: xx.append(NL(12))
        else: xx.append(SP())
        xx.extend([LV(x), SP(), LV(-y)])

def make_path(layer, coords, width=0):
    xx=[LA("path"), SP(), LQ(layer), SP(), LA(f"{width/1000:g}")]
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

# --- dsn/structure.py ---
def make_structure(board,include_zones, box=None, quarter_smd_clearance=False):
    copper_layers = [(l_id, board.GetLayerName(l_id), pcbnew.LAYER.ShowType(board.GetLayerType(l_id))) for l_id in pcbnew.LSET.AllCuMask(board.GetCopperLayerCount()).Seq()]
    
    structure_parts = []
    for idx, (_, name, layer_type) in enumerate(copper_layers):
        structure_parts.append(TU([LA("layer"),SP(),LA(name),NL(6),TU([LA("type"),SP(),LA(layer_type)]),NL(6),TU([LA("property"),NL(8),TU([LA("index"),SP(),LA(idx)]),NL(6)]),NL(4)]))
    
    boundary_shape=None
    board_edge_merged = merge_all_drawings(board, 'Edge.Cuts')
    if board_edge_merged and len(board_edge_merged[0]) > 1:
        boundary_shape = make_path('pcb', board_edge_merged[0])
    else:
        # Fallback to the bounding box of all items if Edge.Cuts is empty
        bbox = board.ComputeBoundingBox(False) # This gets the bounding box of ALL items
        if bbox.GetWidth() > 0 and bbox.GetHeight() > 0:
             # Add a 2mm margin for safety
             margin = 2000000 # 2mm in nanometers
             bbox.Inflate(margin, margin)
             left, bottom, right, top = bbox.GetLeft(), bbox.GetBottom(), bbox.GetRight(), bbox.GetTop()
             coords = [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]
             boundary_shape = make_path('pcb', coords, width=0)

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
        vias_all[via_dia, via_drl] = [make_via_name(via_dia, via_drl, copper_layer_count), None]
    
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
        
        size_str = f"{size.x/1000.0:.6f}x{size.y/1000.0:.6f}"
        pad_name = name + f"[{letter}]Pad_"

        if name == 'RoundRect':
            radius = pad_obj.GetRoundRectCornerRadius()
            pad_name += f"{size_str}_{radius/1000.0:.6f}_um_{pad_obj.GetOrientationDegrees():.6f}_0"
        else: # Circle, Oval, Rect
            pad_name += f"{size_str}_um"
        
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
            path_tuple = make_path('signal', path, width)
            parts.extend([NL(6), TU([LA('outline'), SP(), path_tuple])])
            
    for pd in fp.Pads():
        if pd.GetNet() and (sel_pads is None or str(pd.GetNumber()) in sel_pads):
            pad_name=pads(pd)
            if pad_name:
                pos = get_local_position(pd, fp)
                xx = [LA('pin'),SP(),LQ(pad_name),SP(),LQ(str(pd.GetNumber())),SP(),LV(pos.x),SP(),LV(-pos.y)]
                parts.extend([NL(6),TU(xx)])
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
    for _,padstack in pads.items(): library.extend((NL(4), padstack))
    library.append(NL(2))
    return TU(library)

def make_network(board, vias, nets):
    net_classes=dict((str(a),[b.GetTrackWidth(),b.GetClearance(),[],b.GetViaDiameter(),b.GetViaDrill()]) for a,b in board.GetAllNetClasses().items())
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
        net_item = [LA('net'),SP(),LQ(net_name),NL(6), net_item_pins_tuple]
        network.append(TU(net_item))
        nc = board.FindNet(net_name).GetNetClassName()
        nc_str = str(nc)
        if nc_str in net_classes:
            net_classes[nc_str][2].append(net_name)
    for name, (track_width, clearance,net_names, via_dia, via_drl) in net_classes.items():
        use_name = 'kicad_default' if name=='Default' else name
        via_name_key = (via_dia, via_drl)
        via_name = vias.get(via_name_key, [None])[0]
        if not via_name: continue
        class_item = [LA('class'),SP(),LQ(use_name)]
        for n in net_names:
            class_item.extend([SP(), LQ(n)])
        class_item.extend([NL(6),TU([LA('circuit'),NL(8),TU([LA('use_via'),SP(), LQ(via_name)]),NL(6)])])
        class_item.extend([NL(6),TU([LA('rule'),NL(8),TU([LA('width'),SP(),LV(track_width)]),NL(8),TU([LA('clearance'),SP(),LV(clearance)]),NL(6)])])
        network.extend([NL(4),TU(class_item)])
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
            width_str = f"{width_val/1000000.0:g}" if isinstance(width_val, float) else LV(width_val)

            vals = [LA('wire'), SP(), TU([LA('path'), SP(), LA(track.GetLayerName()), SP(), width_str, SP(), LV(track.GetStart().x), SP(), LV(-track.GetStart().y), SP(), LV(track.GetEnd().x), SP(), LV(-track.GetEnd().y)]), SP(), TU([LA('net'), SP(), LQ(track.GetNetname())])]
            if fixed_wiring: vals.extend([SP(), TU([LA('type'), SP(), LA('route')])])
            res.append(TU(vals))
    res.append(NL(2))
    return TU(res)

# --- dsn/__init__.py (as board_to_dsn function) ---
def board_to_dsn(filename, board, include_zones=False, selected_pads=None, selected_tracks=None, box=None, fixed_wiring=True):
    structure, vias = make_structure(board,include_zones, box)
    footprints, nets, pads = handle_footprints(board, selected_pads, box)
    pads.update((b,c) for _,(b,c) in vias.items())
    result = [LA("pcb"), SP(), LQ(os.path.basename(filename))]
    result.extend([NL(2), TU([LA("parser"),NL(4),TU([LA("string_quote"),SP(),LA('"')]),NL(4),TU([LA("space_in_quoted_tokens"),SP(),LA("on")]),NL(4),TU([LA("host_cad"),SP(),QS("KiCad/Singularity")]),NL(4),TU([LA("host_version"),SP(),QS(pcbnew.FullVersion())]),NL(2)])])
    result.extend([NL(2), TU([LA("resolution"),SP(),LA("um"),SP(),LA("10")])])
    result.extend([NL(2), TU([LA("unit"),SP(),LA("um")])])
    result.extend([NL(2), structure])
    result.extend([NL(2), make_placement(footprints)])
    result.extend([NL(2), make_library(footprints, pads)])
    result.extend((NL(2), make_network(board, vias, nets)))
    result.extend((NL(2), make_wiring(board, vias, selected_tracks, fixed_wiring)))
    result.append(NL())
    return TU(result)

# --- tracks.py ---
def pcbpoint(p): return pcbnew.VECTOR2I(int(p[0]*10000), int(p[1]*-10000))
def split_coords(coords):
    for i in range(0, len(coords)-3, 2): yield pcbpoint(coords[i:i+2]), pcbpoint(coords[i+2:i+4])

class Tracks:
    def __init__(self, pcb):
        self.pcb = pcb
        self.nets = pcb.GetNetsByName()
        self.via_sizes = {}
        for _, v in pcb.GetAllNetClasses().items():
            via_dia, via_drl = v.GetViaDiameter(),v.GetViaDrill()
            self.via_sizes[make_via_name(via_dia, via_drl, pcb.GetCopperLayerCount())] = (via_dia, via_drl)
        self.tracks, self.vias = {}, {}
    def __call__(self, p):
        if p is None: return
        if p['object_type']=='track': self.track(p)
        elif p['object_type']=='via': self.via(p)
    def make_track(self, obj, fr, to):
        track = pcbnew.PCB_TRACK(self.pcb); track.SetStart(fr); track.SetEnd(to)
        track.SetWidth(int(obj['width']*10000)); track.SetLayer(self.pcb.GetLayerID(obj['layer'])); track.SetNet(self.nets[obj['nets'][0]])
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
        self.board_handler, self.message_handler, self.responses, self.get_process, self.raw_message_logger = board_handler, message_handler, responses, get_process, raw_message_logger
    def read_all(self):
        while self.read_next(): pass
    def handle_wait_reply(self, proc, msg):
        if msg.get('wait_reply')==True:
            proc.stdin.write(b'\\0\\0\\0\\1\\1'); proc.stdin.flush()
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


# --- Tool Implementations ---
def initialize_skidl():
    if 'skidl' not in sys.modules:
        print(json.dumps({"error": "SKiDL library not found. Please install it in the server's Python environment."}), file=sys.stdout)
        sys.exit(1)
    # This is often needed for SKiDL to find default libraries
    lib_search_paths[KICAD].append('/usr/share/kicad/symbols')

def get_abs_path(board_name, extension):
    return os.path.join(STATE_DIR, f"{board_name}{extension}")

def get_rel_path(abs_path):
    return os.path.join('assets', os.path.basename(abs_path)).replace('\\\\', '/')

def define_component(board_name, ref, part_description, value, footprint, pin_count_str):
    state_file = get_abs_path(board_name, "_components.json")
    try:
        with open(state_file, 'r') as f: part_definitions = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        part_definitions = {}
    
    is_library_part = ':' in value
    pin_count = int(pin_count_str)

    if pin_count > 0:
        part_definitions[ref] = {"ref": ref, "value": value, "library": "Connector_Generic", "part_name": f"Conn_01x{pin_count:02d}", "footprint": footprint, "description": part_description}
    elif is_library_part:
        library, part = value.split(':', 1)
        part_definitions[ref] = {"ref": ref, "value": value, "library": library, "part_name": part, "footprint": footprint, "description": part_description}
    else:
        print(json.dumps({"error": f"Component '{ref}' needs either a 'library:part' value or a non-zero 'pinCount'."}), file=sys.stdout)
        sys.exit(1)
    
    with open(state_file, 'w') as f: json.dump(part_definitions, f, indent=2)
    print(json.dumps({"message": f"Component '{ref}' defined for board '{board_name}'."}), file=sys.stdout)

def create_netlist(board_name, connections_json_str):
    state_file = get_abs_path(board_name, "_components.json")
    netlist_path = get_abs_path(board_name, ".xml")
    
    with open(state_file, 'r') as f: part_definitions = json.load(f)
    connections = json.loads(connections_json_str)
    
    reset(); initialize_skidl()
    parts = {ref: Part(p_def['library'], p_def['part_name'], ref=ref, footprint=p_def['footprint'], value=p_def['value']) for ref, p_def in part_definitions.items()}
    
    for conn in connections:
        net = Net(conn['net_name'])
        for pin_spec in conn['pin_connections']:
            ref, pin_num = pin_spec.split('-')
            net += parts[ref][pin_num]
    
    ERC()
    generate_netlist(file_=netlist_path)
    print(json.dumps({"message": f"Netlist for '{board_name}' generated."}), file=sys.stdout)

def create_pcb(board_name):
    netlist_path = get_abs_path(board_name, ".xml")
    pcb_path = get_abs_path(board_name, ".kicad_pcb")
    subprocess.run(["kinet2pcb", "-w", "-i", netlist_path, "-o", pcb_path], check=True, capture_output=True)
    image_path = get_abs_path(board_name, "_unrouted.png")
    subprocess.run(["kicad-cli", "pcb", "render", pcb_path, "--output", image_path], check=True, capture_output=True)
    print(json.dumps({"message": "Initial PCB created.", "artifacts": {"image_top": get_rel_path(image_path)}}), file=sys.stdout)

def autoroute(board_name):
    pcb_path = get_abs_path(board_name, ".kicad_pcb")
    if not os.path.exists(pcb_path):
        raise FileNotFoundError(f"PCB file not found for board '{board_name}'.")

    if not os.path.exists(FREEROUTING_JAR_PATH):
        raise FileNotFoundError(f"Freerouting JAR not found at '{FREEROUTING_JAR_PATH}'.")

    print("INFO: 1/3 Loading board and preparing for autorouting...", file=sys.stderr)
    board = pcbnew.LoadBoard(pcb_path)
    for track in board.GetTracks(): board.Remove(track)
    
    print("INFO: 2/3 Generating DSN and running Freerouting...", file=sys.stderr)
    dsn_obj = board_to_dsn(pcb_path, board, include_zones=False, fixed_wiring=False)
    dsn_text = str(dsn_obj) + '\\n'
    
    # --- For debugging: save the generated DSN file ---
    dsn_path = get_abs_path(board_name, ".dsn")
    with open(dsn_path, 'w', encoding='utf-8') as f:
        f.write(dsn_text)
    print(f"INFO: Debug DSN file saved to {dsn_path}", file=sys.stderr)
    
    tracks_handler = Tracks(board)
    args = ['java', '-jar', FREEROUTING_JAR_PATH, '-ms', '-fo', '-ap', '5000', '-pp', '3', '-tr', '2']
    
    # Force a UTF-8 environment for the Java subprocess to prevent locale-related errors
    java_env = os.environ.copy()
    java_env['LC_ALL'] = 'en_US.UTF-8'
    java_env['LANG'] = 'en_US.UTF-8'
    
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stdin=subprocess.PIPE, stderr=subprocess.PIPE, env=java_env)
    
    freerouting_raw_output_log = []
    def handle_message_console(msg):
        if not msg: return
        mm = f"{msg['index']:8d} {msg['time']/1e9:7.1f}s {msg['msg_type']:8s}: {msg['msg']}"
        print(f"\\rINFO: {mm}", end='', flush=True, file=sys.stderr)

    requests = {
        'design_file_text': {'file_name': board_name + '.dsn', 'design_file_text': dsn_text},
        'continue_autoroute': lambda a: {'continue': True}, 'continue_optimize': lambda a: {'continue': True}
    }
    
    message_receiver = MessageReceiver(tracks_handler, handle_message_console, requests, lambda: process, raw_message_logger=freerouting_raw_output_log.append)
    message_receiver.read_all()
    
    return_code = process.wait()
    stderr_output = process.stderr.read().decode('utf-8', errors='ignore')

    if return_code != 0:
        # The main exception handler will catch this and include stderr
        raise subprocess.CalledProcessError(return_code, args, stderr=stderr_output)

    if stderr_output.strip():
        # Print any non-fatal warnings from stderr for debugging
        print(f"\\nINFO: Freerouting stderr output (non-fatal):\\n---\\n{stderr_output}\\n---", file=sys.stderr)
    
    print("\\nINFO: 3/3 Freerouting process finished. Saving board...", file=sys.stderr)

    # Save the captured raw output log from freerouting (the modern equivalent of a .ses file)
    autorouter_output_path = get_abs_path(board_name, "_autorouter_output.log")
    with open(autorouter_output_path, 'w', encoding='utf-8') as f:
        f.write('\\n'.join(freerouting_raw_output_log))
    
    board.Save(pcb_path)
    
    image_path = get_abs_path(board_name, "_routed.png")
    svg_path = get_abs_path(board_name, "_routed_layers.svg")
    subprocess.run(["kicad-cli", "pcb", "render", pcb_path, "--output", image_path], check=True, capture_output=True)
    subprocess.run(["kicad-cli", "pcb", "export", "svg", pcb_path, "--layers", "F.Cu,B.Cu", "--output", svg_path], check=True, capture_output=True)

    print(json.dumps({
        "message": "Board successfully autorouted.",
        "artifacts": {
            "image_top": get_rel_path(image_path),
            "routed_svg": get_rel_path(svg_path),
            "dsn_file": get_rel_path(dsn_path),
            "autorouter_output_log": get_rel_path(autorouter_output_path)
        }
    }), file=sys.stdout)

def fabricate(board_name):
    pcb_path = get_abs_path(board_name, ".kicad_pcb")
    fab_dir = STATE_DIR
    
    subprocess.run(["kicad-cli", "pcb", "export", "gerbers", "-o", fab_dir, pcb_path], check=True, capture_output=True)
    subprocess.run(["kicad-cli", "pcb", "export", "drill", "-o", fab_dir, pcb_path], check=True, capture_output=True)
    
    top_3d_path = get_abs_path(board_name, "_top_3d.png")
    bottom_3d_path = get_abs_path(board_name, "_bottom_3d.png")
    subprocess.run(["kicad-cli", "pcb", "render", pcb_path, "--output", top_3d_path], check=True, capture_output=True)
    subprocess.run(["kicad-cli", "pcb", "render", pcb_path, "--output", bottom_3d_path, "--side", "bottom"], check=True, capture_output=True)
    
    zip_path = get_abs_path(board_name, "_fab.zip")
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for f in os.listdir(fab_dir):
            if f.startswith(board_name) and (f.endswith('.gbr') or f.endswith('.drl')):
                zf.write(os.path.join(fab_dir, f), os.path.basename(f))
    
    print(json.dumps({
        "message": f"Fabrication files for {board_name} generated.",
        "artifacts": {
            "boardName": board_name,
            "image_top_3d": get_rel_path(top_3d_path),
            "image_bottom_3d": get_rel_path(bottom_3d_path),
            "fab_zip": get_rel_path(zip_path)
        }
    }), file=sys.stdout)

# --- Main CLI Router ---
if __name__ == "__main__":
    command = sys.argv[1]
    args = sys.argv[2:]
    try:
        if command == "define": define_component(*args)
        elif command == "netlist": create_netlist(*args)
        elif command == "create_pcb": create_pcb(*args)
        elif command == "route": autoroute(*args)
        elif command == "fabricate": fabricate(*args)
        else:
            print(json.dumps({"error": f"Unknown command: {command}"}), file=sys.stdout)
            sys.exit(1)
    except Exception as e:
        error_details = ""
        if isinstance(e, subprocess.CalledProcessError):
            if e.stdout: error_details += f"Stdout: {e.stdout.decode() if isinstance(e.stdout, bytes) else e.stdout}\\n"
            if e.stderr: error_details += f"Stderr: {e.stderr.decode() if isinstance(e.stderr, bytes) else e.stderr}\\n"
        
        full_traceback = traceback.format_exc()
        if not error_details:
            error_details = str(e)

        final_error_message = f"Command '{command}' failed. Error: {error_details}\\nFull Traceback:\\n{full_traceback}"
        print(json.dumps({"error": final_error_message}), file=sys.stdout)
        sys.exit(1)
`;

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'KiCad Design Automation Panel',
        description: 'A dedicated UI panel to generate a full KiCad PCB from a natural language prompt. Manages the workflow and displays progress.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide a user-friendly interface for the most complex hardware generation task, abstracting the multi-step agent process.',
        parameters: [
            { name: 'onGeneratePlan', type: 'object', description: 'Function to call with the prompt to generate the workflow plan.', required: true },
            { name: 'onExecutePlan', type: 'object', description: 'Function to call to execute the generated plan.', required: true },
            { name: 'kicadLog', type: 'array', description: 'A log of messages from the KiCad generation workflow.', required: true },
            { name: 'isGenerating', type: 'boolean', description: 'Whether a generation task is currently in progress.', required: true },
            { name: 'plan', type: 'array', description: 'The AI-generated workflow plan.', required: false },
            { name: 'currentArtifact', type: 'object', description: 'The latest visual artifact generated by the workflow.', required: false },
            { name: 'serverUrl', type: 'string', description: 'The base URL of the backend server.', required: true },
        ],
        implementationCode: `
            const [prompt, setPrompt] = React.useState('');
            const logContainerRef = React.useRef(null);

            React.useEffect(() => {
                if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            }, [kicadLog]);
            
            const examplePrompt = \`I want to create a mezzanine board for the ADS131M08 ADC, designed to work with a generic XIAO module.

First, define all the necessary components using generic parts by specifying their pin counts:
- Define the ADC: ref 'U1', description '8-Channel, 24-Bit, 32-kSPS, Low-Power, Delta-Sigma ADC', value 'Texas_Instruments:ADS131M08', footprint 'Package_QFP:LQFP-32_5x5mm_P0.5mm', pinCount 0.
- Define the XIAO headers: ref 'J1' and 'J2', description 'XIAO Header', value 'XIAO Header', footprint 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', pinCount 7.

Second, create the schematic and netlist with the following connections:
- Net 'GND': Connect U1-13, U1-25, U1-27, U1-28, J2-1
- Net 'AVDD': Connect U1-15, J1-1
- Net 'DVDD': Connect U1-26, J1-2
- Net 'REFIN': Connect U1-14, J1-3
- Net 'SCLK': Connect U1-19, J1-4
- Net 'DOUT': Connect U1-20, J1-5
- Net 'DIN': Connect U1-21, J1-6
- Net 'CS': Connect U1-17, J1-7
- Net 'DRDY': Connect U1-18, J2-2
- Net 'SYNC_RESET': Connect U1-16, J2-3
- Net 'XTAL1': Connect U1-23, J2-4
- Net 'AIN0P': Connect U1-29
- Net 'AIN1P': Connect U1-32
- Net 'AIN2P': Connect U1-1
- Net 'AIN3P': Connect U1-4
- Net 'AIN4P': Connect U1-5
- Net 'AIN5P': Connect U1-8
- Net 'AIN6P': Connect U1-9
- Net 'AIN7P': Connect U1-12

Third, create the initial PCB from the generated netlist.
Fourth, autoroute the board.
Finally, export the fabrication files.
\`;

            React.useEffect(() => {
                if (!prompt) setPrompt(examplePrompt);
            }, [examplePrompt]);

            const Spinner = () => (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            );

            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
                    <h3 className="text-lg font-bold text-indigo-300">KiCad Design Automation</h3>
                    
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the full PCB design workflow..."
                        className="w-full h-40 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 transition-colors duration-200 resize-y disabled:cursor-not-allowed"
                        disabled={isGenerating}
                    />

                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            onClick={() => onGeneratePlan(prompt)}
                            disabled={isGenerating || !prompt.trim()}
                            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all"
                        >
                            {isGenerating && !plan ? <Spinner /> : '🧠'}
                            Generate Plan
                        </button>
                        <button
                            onClick={() => onExecutePlan()}
                            disabled={isGenerating || !plan}
                            className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all"
                        >
                            {isGenerating && plan ? <Spinner /> : '⚡️'}
                            Execute Plan
                        </button>
                    </div>

                    {currentArtifact && (
                        <div>
                            <h4 className="font-semibold text-gray-300 text-sm mb-1">{currentArtifact.title}</h4>
                             {currentArtifact.path && (
                                <div className="bg-black/30 p-2 rounded">
                                    <img src={serverUrl + '/' + currentArtifact.path} alt={currentArtifact.title} className="rounded-md w-full" />
                                </div>
                             )}
                             {currentArtifact.svgPath && (
                                 <a 
                                    href={serverUrl + '/' + currentArtifact.svgPath} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="mt-2 block text-center text-sm font-semibold text-cyan-300 bg-gray-700/50 hover:bg-gray-700 p-2 rounded-lg"
                                >
                                    View Detailed Layers (SVG)
                                 </a>
                             )}
                        </div>
                    )}
                    
                    {plan && !isGenerating && (
                        <div>
                           <h4 className="font-semibold text-gray-300 text-sm mb-1">Execution Plan</h4>
                           <pre className="h-32 bg-black/30 p-2 rounded text-xs font-mono overflow-y-auto">
                            {JSON.stringify(plan, null, 2)}
                           </pre>
                        </div>
                    )}
                    
                    {kicadLog.length > 0 && (
                         <div>
                            <h4 className="font-semibold text-gray-300 text-sm mb-1">Workflow Log</h4>
                            <div ref={logContainerRef} className="h-32 bg-black/30 p-2 rounded text-xs font-mono overflow-y-auto scroll-smooth">
                                {kicadLog.map((log, i) => <div key={i} className="text-slate-300 break-words py-0.5 border-b border-slate-800">{log}</div>)}
                            </div>
                        </div>
                    )}
                </div>
            )
        `
    },
    {
        name: 'Install KiCad Engineering Suite',
        description: 'A one-time setup tool that writes the necessary Python CLI script to the server and creates the corresponding server-side tools for the full KiCad workflow. It only needs to be run once.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To enable the "Genesis Loop" for hardware engineering, where the agent creates its own backend tools required for designing PCBs.',
        parameters: [],
        implementationCode: `
            const tools = runtime.tools.list();
            if (tools.find(t => t.name === 'Define KiCad Component')) {
                return { success: true, message: 'KiCad Engineering Suite is already installed.' };
            }

            // Step 1: Write the master Python CLI script to the server
            await runtime.tools.run('Server File Writer', { 
                filePath: 'kicad_cli_tool.py', 
                content: \`${KICAD_CLI_SCRIPT.replace(/`/g, '\\`')}\`
            });

            const pythonCmd = 'python scripts/kicad_cli_tool.py';

            // Step 2: Create the granular server-side tools that call the master script.
            await runtime.tools.run('Tool Creator', {
                name: 'Define KiCad Component',
                description: 'Defines a single component (symbol, footprint, value) for a specified board design. Must be called for each component.',
                category: 'Server',
                executionEnvironment: 'Server',
                parameters: [
                    {name: 'boardName', type: 'string', description: 'Base name for the project files (e.g., "my_board").', required: true},
                    {name: 'ref', type: 'string', description: 'The component reference designator (e.g., "U1", "R1").', required: true},
                    {name: 'partDescription', type: 'string', description: 'A human-readable description of the part.', required: true},
                    {name: 'value', type: 'string', description: 'The component value. For library parts, use "Library:PartName" format. For generic parts, use a descriptive name.', required: true},
                    {name: 'footprint', type: 'string', description: 'The KiCad footprint identifier (e.g., "Package_SO:TSSOP-32...").', required: true},
                    {name: 'pinCount', type: 'number', description: 'Number of pins for generic connector symbols. Use 0 for pre-existing library parts.', required: true}
                ],
                implementationCode: \`\${pythonCmd} define \\\${boardName} "\\\${ref}" "\\\${partDescription}" "\\\${value}" "\\\${footprint}" \\\${pinCount}\`,
                purpose: 'To build up the library of parts required for a specific PCB design.'
            });

            await runtime.tools.run('Tool Creator', {
                name: 'Create KiCad Netlist',
                description: 'Generates a KiCad XML netlist from all previously defined components and a new set of connections.',
                category: 'Server',
                executionEnvironment: 'Server',
                parameters: [
                    {name: 'boardName', type: 'string', description: 'Base name for the project files.', required: true},
                    {name: 'connectionsJson', type: 'string', description: 'A JSON string representing the list of nets and their pin connections.', required: true}
                ],
                implementationCode: \`\${pythonCmd} netlist \\\${boardName} '\\\${connectionsJson}'\`,
                purpose: 'To define the electrical connectivity of the circuit schematic.'
            });

            await runtime.tools.run('Tool Creator', {
                name: 'Create Initial PCB',
                description: 'Uses kicad-cli to generate an initial .kicad_pcb file from a netlist, placing all components.',
                category: 'Server',
                executionEnvironment: 'Server',
                parameters: [{name: 'boardName', type: 'string', description: 'Base name for the project files.', required: true}],
                implementationCode: \`\${pythonCmd} create_pcb \\\${boardName}\`,
                purpose: 'To bridge from the logical schematic to the physical PCB layout.'
            });

            await runtime.tools.run('Tool Creator', {
                name: 'Autoroute PCB',
                description: 'Performs an autorouting sequence on the PCB using an external Freerouting engine.',
                category: 'Server',
                executionEnvironment: 'Server',
                parameters: [{name: 'boardName', type: 'string', description: 'Base name of the board to route.', required: true}],
                implementationCode: \`kicad-cli script run --env ZMQ_DONT_CHECK_KERNEL_VERSION=1 -- \${pythonCmd} route \\\${boardName}\`,
                purpose: 'To automatically draw the copper connections between components.'
            });

            await runtime.tools.run('Tool Creator', {
                name: 'Export Fabrication Files',
                description: 'Exports Gerbers, drill files, and a BOM for the specified PCB into a single zip archive.',
                category: 'Server',
                executionEnvironment: 'Server',
                parameters: [{name: 'boardName', type: 'string', description: 'Base name of the board to export.', required: true}],
                implementationCode: \`\${pythonCmd} fabricate \\\${boardName}\`,
                purpose: 'To create the final deliverable needed to manufacture the physical device.'
            });

            return { success: true, message: 'KiCad Engineering Suite successfully installed on the server.' };
        `
    },
];
