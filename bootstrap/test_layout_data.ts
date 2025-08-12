
import type { KnowledgeGraph, KicadSchematic } from '../types';

// This data is derived from the FreeEEG8-alpha project.
// The U4 XIAO module has been replaced by two 7-pin headers (J_XIAO_1, J_XIAO_2)
// to create a mezzanine board configuration.

const freeEEG8Schematic: KicadSchematic = [
  ["J1",["AIN0P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J2",["AIN1P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J3",["AIN2P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J4",["AIN3P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J5",["AIN4P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J6",["AIN5P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J7",["AIN6P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J8",["AIN7P"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J9",["AINREF"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J10",["GND"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  // Corrected U1 pinout based on user-provided JSON
  ["U1",["AIN2P","AINREF","AINREF","AIN3P","AIN4P","AINREF","AINREF","AIN5P","AIN6P","AINREF","AINREF","AIN7P","GND","REFIN","AVDD","SYNC/RESET","CS","DRDY","SCLK","DOUT","DIN","XTAL2","XTAL1/CLKIN","CAP","GND","DVDD","ADC_NC","GND","AIN0P","AINREF","AINREF","AIN1P"],"Package_QFP:LQFP-32_5x5mm_P0.5mm"],
  ["C1",["GND","CAP"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C2",["GND","REFIN"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C3",["AVDD","GND"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C4",["DVDD","GND"],"Capacitor_SMD:C_0402_1005Metric"],
  ["U2",["IN","GND","EN","NC","AVDD"],"Package_TO_SOT_SMD:SOT-23-5"],
  ["C5",["AVDD","GND"],"Capacitor_SMD:C_0603_1608Metric"],
  ["C6",["GND","5V"],"Capacitor_SMD:C_0603_1608Metric"],
  ["U3",["IN","GND","EN","NC","DVDD"],"Package_TO_SOT_SMD:SOT-23-5"],
  ["C7",["GND","DVDD"],"Capacitor_SMD:C_0603_1608Metric"],
  ["C8",["5V","GND"],"Capacitor_SMD:C_0603_1608Metric"],
  ["U4",["SYNC/RESET","DRDY","CS","XIAO_NC1","XIAO_NC2","XIAO_NC3","XIAO_NC4","XIAO_NC5","SCLK","DOUT","DIN","XIAO_NC6","GND","5V","SWCLK","SWDIO","GND","RESET","NFC1","NFC2","BAT-","BAT+"],"freeeeg8-alpha:XIAO-nRF52840-Sense-14P-2.54-21X17.8MM"],
  ["X1",["OUT","GND","IN","DVDD"],"freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering"],
];

const getFootprintDimensions = (footprint: string): { width: number; height: number } => {
    if (footprint.includes('pogo_pin')) return { width: 5, height: 5 };
    if (footprint.includes('LQFP-32_5x5mm')) return { width: 7, height: 7 };
    if (footprint.includes('C_0402')) return { width: 1.0, height: 0.5 };
    if (footprint.includes('SOT-23-5')) return { width: 2.9, height: 1.6 };
    if (footprint.includes('C_0603')) return { width: 1.6, height: 0.8 };
    if (footprint.includes('R_0402')) return { width: 1.0, height: 0.5 };
    if (footprint.includes('Oscillator') && footprint.includes('3.2x2.5mm')) return { width: 3.2, height: 2.5 };
    if (footprint.includes('PinHeader_1x07')) return { width: 2.54 * 7, height: 2.54 };
    return { width: 2, height: 2 };
};

const getPinPositions = (ref: string, footprint: string): { name: string, x: number, y: number }[] => {
    const dims = getFootprintDimensions(footprint);
    const w2 = dims.width / 2;
    const h2 = dims.height / 2;

    if (ref.startsWith('J') && footprint.includes('pogo_pin')) return [{ name: '1', x: 0, y: 0 }];
    if (ref.startsWith('C') || ref.startsWith('R')) return [{ name: '1', x: -w2, y: 0 }, { name: '2', x: w2, y: 0 }];
    if (ref === 'X1') return [{ name: '1', x: -w2, y: h2 }, { name: '2', x: -w2, y: -h2 }, { name: '3', x: w2, y: -h2 }, { name: '4', x: w2, y: h2 }];
    
    if (ref === 'U1') { // 32-pin TQFP
        const pins = [];
        const pitch = 0.8; // Effective pitch for a 7x7 package
        const side_len = 7 * pitch;
        const s2 = side_len / 2;
        // Pins 1-8 (left)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 1), x: -s2, y: s2 - i * pitch });
        // Pins 9-16 (bottom)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 9), x: -s2 + i * pitch, y: -s2 });
        // Pins 17-24 (right)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 17), x: s2, y: -s2 + i * pitch });
        // Pins 25-32 (top)
        for (let i = 0; i < 8; i++) pins.push({ name: String(i + 25), x: s2 - i * pitch, y: s2 });
        return pins;
    }

    if (ref.startsWith('U2') || ref.startsWith('U3')) { // SOT-23-5
        return [
            { name: '1', x: -1.2, y: 0.65 }, { name: '2', x: -1.2, y: 0 }, { name: '3', x: -1.2, y: -0.65 },
            { name: '4', x: 1.2, y: -0.65 }, { name: '5', x: 1.2, y: 0.65 }
        ];
    }
    
    if (ref.startsWith('J_XIAO')) { // 1x7 Header
        const pins = [];
        for (let i = 0; i < 7; i++) {
            pins.push({ name: String(i + 1), x: (i - 3) * 2.54, y: 0 });
        }
        return pins;
    }
    return [];
}


const buildGraph = (): KnowledgeGraph => {
    const nodes = [];
    const netToPins: Record<string, string[]> = {};
    const unwantedComponents = ['U4'];
    const pogoPins = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10"];


    // 1. Add all required components
    for (const [ref, , footprint] of freeEEG8Schematic) {
        if (unwantedComponents.includes(ref)) continue;
        const dims = getFootprintDimensions(footprint);
        nodes.push({
            id: ref, label: ref, width: dims.width, height: dims.height,
            footprint: footprint, side: pogoPins.includes(ref) ? 'bottom' : 'top',
            pins: getPinPositions(ref, footprint),
            x: 0, y: 0, rotation: 0, svgPath: null, glbPath: null, model3d_props: null,
        });
    }

    // 2. Add Mezzanine Connectors for XIAO
    const xiaoHeaderFootprint = 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical';
    const xiaoHeaderDims = getFootprintDimensions(xiaoHeaderFootprint);
    nodes.push({
        id: "J_XIAO_1", label: "XIAO_LEFT", width: xiaoHeaderDims.width, height: xiaoHeaderDims.height,
        footprint: xiaoHeaderFootprint, side: 'top',
        pins: getPinPositions("J_XIAO_1", xiaoHeaderFootprint),
        x: 0, y: 0, rotation: 0, svgPath: null, glbPath: null, model3d_props: null,
    });
    nodes.push({
        id: "J_XIAO_2", label: "XIAO_RIGHT", width: xiaoHeaderDims.width, height: xiaoHeaderDims.height,
        footprint: xiaoHeaderFootprint, side: 'top',
        pins: getPinPositions("J_XIAO_2", xiaoHeaderFootprint),
        x: 0, y: 0, rotation: 0, svgPath: null, glbPath: null, model3d_props: null,
    });

    // 3. Populate netToPins map and handle U4 rerouting
    const u4Data = freeEEG8Schematic.find(c => c[0] === 'U4');
    const u4PinToNetMap = u4Data ? u4Data[1] : [];
    
    // Map U4 pins to XIAO header pins
    const u4ToXiaoMapping = {
       "SYNC/RESET": "J_XIAO_1-1", "DRDY": "J_XIAO_1-2", "CS": "J_XIAO_1-3",
       "SCLK": "J_XIAO_1-5", "DOUT": "J_XIAO_1-6", "DIN": "J_XIAO_1-7",
       "GND": "J_XIAO_2-1", "5V": "J_XIAO_2-2"
    };

    for (const [ref, netNames, footprint] of freeEEG8Schematic) {
        if (ref === 'U4') continue; // Skip U4 itself
        
        const componentNode = nodes.find(n => n.id === ref);
        const pins = componentNode ? componentNode.pins : [];
        
        netNames.forEach((netName, i) => {
            if (!netToPins[netName]) netToPins[netName] = [];
            const pinName = pins[i] ? pins[i].name : String(i + 1);
            netToPins[netName].push(`${ref}-${pinName}`);
        });
    }
    
    for (const netName of u4PinToNetMap) {
        if (u4ToXiaoMapping[netName]) {
             if (!netToPins[netName]) netToPins[netName] = [];
             if (!netToPins[netName].includes(u4ToXiaoMapping[netName])) {
                netToPins[netName].push(u4ToXiaoMapping[netName]);
             }
        }
    }


    // 4. Create edges from the populated netToPins map
    const edges = [];
    for (const netName in netToPins) {
        const pins = Array.from(new Set(netToPins[netName])); // Remove duplicates
        if (pins.length > 1) {
            for (let i = 0; i < pins.length; i++) {
                for (let j = i + 1; j < pins.length; j++) {
                    edges.push({ source: pins[i], target: pins[j], label: netName });
                }
            }
        }
    }

    return {
        nodes,
        edges,
        board_outline: {
            x: 0,
            y: 0,
            width: 25, // Circular board with 25mm diameter
            height: 25,
            shape: 'circle',
        },
        constraints: [
            {
                type: "fixed_group",
                anchor: "J_XIAO_1",
                components: [
                    { "ref": "J_XIAO_1", "offsetX_mm": 0, "offsetY_mm": 0, "angle_deg": 0 },
                    { "ref": "J_XIAO_2", "offsetX_mm": 0, "offsetY_mm": 17.78, "angle_deg": 0 }
                ]
            }
        ],
    };
};

export const TEST_LAYOUT_DATA: KnowledgeGraph = buildGraph();
