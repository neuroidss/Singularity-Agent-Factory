import type { KnowledgeGraph } from '../types';

// This data is derived from the FreeEEG8-alpha project, but rearranged according to the new spec.
export const COMPONENTS = [
  { ref: "J1", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J2", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J3", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J4", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J5", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J6", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J7", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J8", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J9", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "J10", part: "POGO_PIN", value: "POGO", footprint: "freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom", assetTransforms: { svg: { rotation: [-90, 0, 0] } } },
  { ref: "U1", part: "ADC", value: "ADS131M08", footprint: "Package_QFP:LQFP-32_5x5mm_P0.5mm", assetTransforms: { glb: { rotation: [0, 0, 0], scale: 1.0, offset: [0, -0.0016, 0] }, svg: { rotation: [0, 0, 0], scale: 1.0, offset: [0, 0, 0] } } },
  { ref: "C1", part: "CAP", value: "1uF", footprint: "Capacitor_SMD:C_0402_1005Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C2", part: "CAP", value: "1uF", footprint: "Capacitor_SMD:C_0402_1005Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C3", part: "CAP", value: "10uF", footprint: "Capacitor_SMD:C_0402_1005Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C4", part: "CAP", value: "10uF", footprint: "Capacitor_SMD:C_0402_1005Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "U2", part: "LDO", value: "LP5907QMFX-3.3Q1", footprint: "Package_TO_SOT_SMD:SOT-23-5", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C5", part: "CAP", value: "2.2uF", footprint: "Capacitor_SMD:C_0603_1608Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C6", part: "CAP", value: "2.2uF", footprint: "Capacitor_SMD:C_0603_1608Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "U3", part: "LDO", value: "LP5907QMFX-3.3Q1", footprint: "Package_TO_SOT_SMD:SOT-23-5", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C7", part: "CAP", value: "2.2uF", footprint: "Capacitor_SMD:C_0603_1608Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "C8", part: "CAP", value: "2.2uF", footprint: "Capacitor_SMD:C_0603_1608Metric", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
  { ref: "J_XIAO_1", part: "HEADER", value: "XIAO_HEADER", footprint: "Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical", assetTransforms: { glb: { rotation: [0, 90, 0], scale: 1.0, offset: [0, -0.0016, 0] }, svg: { rotation: [0, 0, 0], scale: 1.0, offset: [0, 0, 0] } } },
  { ref: "J_XIAO_2", part: "HEADER", value: "XIAO_HEADER", footprint: "Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical", assetTransforms: { glb: { rotation: [0, 90, 0], scale: 1.0, offset: [0, -0.0016, 0] }, svg: { rotation: [0, 0, 0], scale: 1.0, offset: [0, 0, 0] } } },
  { ref: "X1", part: "OSC", value: "8.192MHz", footprint: "freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering", assetTransforms: { glb: { rotation: [-90, 0, 0] }, svg: { rotation: [-90, 0, 0] } } },
];

const NETS = {
  "AIN0P": ["J1-1", "U1-29"],
  "AIN1P": ["J2-1", "U1-32"],
  "AIN2P": ["J3-1", "U1-1"],
  "AIN3P": ["J4-1", "U1-4"],
  "AIN4P": ["J5-1", "U1-5"],
  "AIN5P": ["J6-1", "U1-8"],
  "AIN6P": ["J7-1", "U1-9"],
  "AIN7P": ["J8-1", "U1-12"],
  "AINREF": ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"],
  "GND": ["J10-1", "U1-13", "U1-25", "U1-28", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-1", "U3-2", "C7-1", "C8-2", "J_XIAO_2-1", "X1-2"],
  "CAP": ["C1-2", "U1-24"],
  "REFIN": ["C2-2", "U1-14"],
  "AVDD": ["C3-1", "U2-5", "C5-1", "U1-15"],
  "DVDD": ["C4-1", "U3-5", "C7-2", "X1-4", "U1-26"],
  "5V": ["C6-2", "C8-1", "J_XIAO_2-2"],
  "SYNC/RESET": ["U1-16", "J_XIAO_1-1"],
  "CS": ["U1-17", "J_XIAO_1-3"],
  "DRDY": ["U1-18", "J_XIAO_1-2"],
  "SCLK": ["U1-19", "J_XIAO_1-5"],
  "DOUT": ["U1-20", "J_XIAO_1-6"],
  "DIN": ["U1-21", "J_XIAO_1-7"],
  "XTAL2": ["U1-22"], // Unconnected
  "XTAL1/CLKIN": ["U1-23", "X1-1"],
  "ADC_NC": ["U1-27"], // Unconnected
  "LDO_IN": ["U2-1", "U3-1"],
  "LDO_EN": ["U2-3", "U3-3"],
};

const footprintToGlbMap: Record<string, string> = {
    'Package_QFP:LQFP-32_5x5mm_P0.5mm': 'http://localhost:5173/Singularity-Agent-Factory/assets/LQFP-32_5x5mm_P0.5mm.glb',
    'Capacitor_SMD:C_0402_1005Metric': 'https://raw.githubusercontent.com/lewis-s-clark/kicad-3d-models-in-gltf/main/Capacitor_SMD.gltf/C_0402_1005Metric.glb',
    'Package_TO_SOT_SMD:SOT-23-5': 'https://raw.githubusercontent.com/lewis-s-clark/kicad-3d-models-in-gltf/main/Package_TO_SOT_SMD.gltf/SOT-23-5.glb',
    'Capacitor_SMD:C_0603_1608Metric': 'https://raw.githubusercontent.com/lewis-s-clark/kicad-3d-models-in-gltf/main/Capacitor_SMD.gltf/C_0603_1608Metric.glb',
    'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical': 'http://localhost:5173/Singularity-Agent-Factory/assets/PinHeader_1x07_P2.54mm_Vertical.glb',
    'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering': 'https://raw.githubusercontent.com/lewis-s-clark/kicad-3d-models-in-gltf/main/Crystal.gltf/Crystal_SMD_3225-4Pin_3.2x2.5mm.glb',
    // Pogo pin is custom, will fallback to placeholder
};

const footprintToSvgMap: Record<string, string> = {
    'Package_QFP:LQFP-32_5x5mm_P0.5mm': 'http://localhost:5173/Singularity-Agent-Factory/assets/LQFP-32_5x5mm_P0.5mm.svg',
    'Capacitor_SMD:C_0402_1005Metric': 'assets/test_footprints/C_0402_1005Metric.svg',
    'Package_TO_SOT_SMD:SOT-23-5': 'assets/test_footprints/SOT-23-5.svg',
    'Capacitor_SMD:C_0603_1608Metric': 'assets/test_footprints/C_0603_1608Metric.svg',
    'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical': 'http://localhost:5173/Singularity-Agent-Factory/assets/PinHeader_1x07_P2.54mm_Vertical.svg',
    'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering': 'assets/test_footprints/Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering.svg',
    'freeeeg8-alpha:pogo_pin_d5x10mm_smd_bottom': 'assets/test_footprints/pogo_pin_d5x10mm_smd_bottom.svg',
};

const getFootprintDimensions = (footprint: string): { width: number; height: number; courtyardWidth: number; courtyardHeight: number; } => {
    // Courtyard is typically ~0.25mm to 0.5mm larger than the component body on each side.
    if (footprint.includes('pogo_pin')) return { width: 5, height: 5, courtyardWidth: 5.5, courtyardHeight: 5.5 };
    if (footprint.includes('LQFP-32_5x5mm')) return { width: 7, height: 7, courtyardWidth: 7.5, courtyardHeight: 7.5 }; // Includes leads
    if (footprint.includes('C_0402')) return { width: 1.0, height: 0.5, courtyardWidth: 1.2, courtyardHeight: 0.7 };
    if (footprint.includes('SOT-23-5')) return { width: 2.9, height: 1.6, courtyardWidth: 3.2, courtyardHeight: 1.9 };
    if (footprint.includes('C_0603')) return { width: 1.6, height: 0.8, courtyardWidth: 1.8, courtyardHeight: 1.0 };
    if (footprint.includes('Oscillator') && footprint.includes('3.2x2.5mm')) return { width: 3.2, height: 2.5, courtyardWidth: 3.5, courtyardHeight: 2.8 };
    if (footprint.includes('PinHeader_1x07')) return { width: 2.54 * 7, height: 2.54, courtyardWidth: (2.54*7) + 0.5, courtyardHeight: 2.54 + 0.5 };
    return { width: 2, height: 2, courtyardWidth: 2.5, courtyardHeight: 2.5 };
};

const getPinPositions = (ref: string, footprint: string): { name: string, x: number, y: number }[] => {
    const dims = getFootprintDimensions(footprint);
    const w2 = dims.width / 2;
    const h2 = dims.height / 2;

    if (ref.startsWith('J') && footprint.includes('pogo_pin')) return [{ name: '1', x: 0, y: 0 }];
    if (ref.startsWith('C') || ref.startsWith('R')) return [{ name: '1', x: -w2, y: 0 }, { name: '2', x: w2, y: 0 }];
    if (ref === 'X1') return [{ name: '1', x: w2, y: h2 }, { name: '2', x: -w2, y: h2 }, { name: '3', x: -w2, y: -h2 }, { name: '4', x: w2, y: -h2 }];
    
    if (ref === 'U1') { // 32-pin TQFP
        const pins = [];
        const pitch = (5.0 / 9.0); // Pitch for a 5x5mm package
        const s2 = 2.5; // half size
        // Pins 1-8 (left)
        for (let i = 0; i < 8; i++) pins.push({ name: String(8-i), x: -s2, y: (s2 - pitch/2) - i * pitch });
        // Pins 9-16 (bottom)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 9), x: (-s2 + pitch/2) + i * pitch, y: -s2 });
        // Pins 17-24 (right)
        for (let i = 0; i < 8; i++) pins.push({ name: String(24-i), x: s2, y: (-s2 + pitch/2) + i * pitch });
        // Pins 25-32 (top)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 25), x: (s2 - pitch/2) - i * pitch, y: s2 });
        return pins;
    }

    if (ref.startsWith('U2') || ref.startsWith('U3')) { // SOT-23-5
        return [
            { name: '1', x: -0.95, y: -0.95 }, { name: '2', x: 0, y: -0.95 }, { name: '3', x: 0.95, y: -0.95 },
            { name: '4', x: 0.95, y: 0.95 }, { name: '5', x: -0.95, y: 0.95 }
        ];
    }
    
    if (ref.startsWith('J_XIAO')) { // 1x7 Header
        const pins = [];
        for (let i = 0; i < 7; i++) {
            pins.push({ name: String(i + 1), x: 0, y: (3 - i) * 2.54 });
        }
        return pins;
    }
    return [];
}


const buildGraph = (): KnowledgeGraph => {
    const pogoPinsRefs = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10"];
    
    // --- Create Nodes without explicit positions ---
    const nodes = COMPONENTS.map(comp => {
        const dims = getFootprintDimensions(comp.footprint);
        return {
            id: comp.ref,
            label: comp.ref,
            width: dims.width,
            height: dims.height,
            courtyardDimensions: { width: dims.courtyardWidth, height: dims.courtyardHeight },
            footprint: comp.footprint,
            side: pogoPinsRefs.includes(comp.ref) ? 'bottom' : 'top',
            pins: getPinPositions(comp.ref, comp.footprint),
            svgPath: footprintToSvgMap[comp.footprint] || null,
            glbPath: footprintToGlbMap[comp.footprint] || null,
            assetTransforms: (comp as any).assetTransforms, // Keep the transforms
            model3d_props: null,
            // x, y, rotation will be determined by the simulation
        };
    });

    // --- Create Edges ---
    const edges = [];
    for (const netName in NETS) {
        const pins = Array.from(new Set(NETS[netName])); // Remove duplicates
        if (pins.length > 1) {
            for (let i = 0; i < pins.length; i++) {
                for (let j = i + 1; j < pins.length; j++) {
                    edges.push({ source: pins[i], target: pins[j], label: netName });
                }
            }
        }
    }
    
    const BOARD_DIAMETER = 30;

    return {
        nodes,
        edges,
        board_outline: {
            x: -BOARD_DIAMETER / 2,
            y: -BOARD_DIAMETER / 2,
            width: BOARD_DIAMETER,
            height: BOARD_DIAMETER,
            shape: 'circle',
        },
    };
};

export const TEST_LAYOUT_DATA: KnowledgeGraph = buildGraph();
