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
  ["J9",["AINREF_POGOPIN"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["J10",["GND_POGOPIN"],"freeeeg8-alpha:pogo_pin_d5x10mm_smd"],
  ["U1",["AIN2P","AINREF","AINREF","AIN3P","AIN4P","AINREF","AINREF","AIN5P","AIN6P","AINREF","AINREF","AIN7P","GND","REFIN","AVDD","SYNC/RESET_ADC","CS","DRDY","SCLK","DOUT","DIN","XTAL2","XTAL1/CLKIN","CAP","GND","DVDD","ADC_NC","GND","AIN0P","AINREF","AINREF","AIN1P"],"Package_QFP:LQFP-32_5x5mm_P0.5mm"],
  ["C1",["GND","CAP"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C2",["GND","REFIN"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C3",["AVDD","GND"],"Capacitor_SMD:C_0402_1005Metric"],
  ["C4",["DVDD","GND"],"Capacitor_SMD:C_0402_1005Metric"],
  ["U2",["5V","GND","5V","AVDD_NC","AVDD"],"Package_TO_SOT_SMD:SOT-23-5"],
  ["C5",["AVDD","GND"],"Capacitor_SMD:C_0603_1608Metric"],
  ["C6",["GND","5V"],"Capacitor_SMD:C_0603_1608Metric"],
  ["U3",["5V","GND","5V","DVDD_NC","DVDD"],"Package_TO_SOT_SMD:SOT-23-5"],
  ["C7",["GND","DVDD"],"Capacitor_SMD:C_0603_1608Metric"],
  ["C8",["5V","GND"],"Capacitor_SMD:C_0603_1608Metric"],
  ["U4",["SYNC/RESET_XIAO","DRDY","CS","XIAO_NC1","XIAO_NC2","XIAO_NC3","XIAO_NC4","XIAO_NC5","SCLK","DOUT","DIN","XIAO_NC6","GND","5V","SWCLK","SWDIO","GND","RESET","NFC1","NFC2","BAT-","BAT+"],"freeeeg8-alpha:XIAO-nRF52840-Sense-14P-2.54-21X17.8MM"],
  ["J11",["BAT+","BAT-","GND","SWCLK","SWDIO","RESET","NFC1","NFC2"],"freeeeg8-alpha:Molex_PicoBlade_53398-0871_1x08-1MP_P1.25mm_Vertical_DNP"],
  ["J12",["REFIN","SYNC/RESET_ADC","AINREF","XTAL1/CLKIN","GND","5V"],"freeeeg8-alpha:Molex_PicoBlade_53398-0671_1x06-1MP_P1.25mm_Vertical_DNP"],
  ["J13",["5V","GND","XTAL1/CLKIN","AINREF","SYNC/RESET_ADC","REFIN"],"freeeeg8-alpha:Molex_PicoBlade_53398-0671_1x06-1MP_P1.25mm_Vertical_DNP"],
  ["R1",["DVDD","DVDD_XTAL"],"Resistor_SMD:R_0402_1005Metric"],
  ["R2",["SYNC/RESET_XIAO","SYNC/RESET_ADC"],"Resistor_SMD:R_0402_1005Metric"],
  ["R3",["GND","GND_POGOPIN"],"Resistor_SMD:R_0402_1005Metric"],
  ["R4",["AINREF","AINREF_POGOPIN"],"Resistor_SMD:R_0402_1005Metric"],
  ["X1",["XTAL_NC","GND","XTAL1/CLKIN","DVDD_XTAL"],"freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering"],
  ["GL1",[],"freeeeg8-alpha:FreeEEG8-alpha-title_5mm_SilkScreen"],
  ["GL2",[],"freeeeg8-alpha:NeuroIDSS-url_5mm_SilkScreen"]
];

const getFootprintDimensions = (footprint: string): { width: number; height: number } => {
    if (footprint.includes('pogo_pin')) return { width: 5, height: 5 };
    if (footprint.includes('LQFP-32_5x5mm')) return { width: 7, height: 7 }; // Add margin
    if (footprint.includes('C_0402')) return { width: 1.0, height: 0.5 };
    if (footprint.includes('SOT-23-5')) return { width: 2.9, height: 1.6 };
    if (footprint.includes('C_0603')) return { width: 1.6, height: 0.8 };
    if (footprint.includes('R_0402')) return { width: 1.0, height: 0.5 };
    if (footprint.includes('Oscillator') && footprint.includes('3.2x2.5mm')) return { width: 3.2, height: 2.5 };
    if (footprint.includes('PinHeader_1x07')) return { width: 2.54 * 7, height: 2.54 };
    if (footprint.includes('Molex') && footprint.includes('1x08')) return { width: 11, height: 4 };
    if (footprint.includes('Molex') && footprint.includes('1x06')) return { width: 8.5, height: 4 };
    return { width: 2, height: 2 }; // Default
};

const buildGraph = (): KnowledgeGraph => {
    const nodes = [];
    const netToPins: Record<string, string[]> = {};

    // 1. Add all components EXCEPT U4
    for (const [ref, , footprint] of freeEEG8Schematic) {
        if (ref === 'U4' || ref.startsWith('GL')) continue; // Skip XIAO and graphic labels
        const dims = getFootprintDimensions(footprint);
        nodes.push({
            id: ref,
            label: ref,
            width: dims.width,
            height: dims.height,
            pins: [], // Pin positions are not needed for this test data structure, physics fallback will handle it
            pin_count: 0,
            x: 0, y: 0, rotation: 0,
            svgPath: null, glbPath: null, model3d_props: null,
        });
    }

    // 2. Add Mezzanine Connectors for XIAO
    const xiaoHeaderDims = getFootprintDimensions('PinHeader_1x07');
    nodes.push({
        id: "J_XIAO_1", label: "XIAO_LEFT", width: xiaoHeaderDims.width, height: xiaoHeaderDims.height,
        pins: Array.from({ length: 7 }, (_, i) => ({ name: (i + 1).toString(), x: -7.62 + i * 2.54, y: 0 })),
        pin_count: 7, x: 0, y: 0, rotation: 0, svgPath: null, glbPath: null, model3d_props: null,
    });
    nodes.push({
        id: "J_XIAO_2", label: "XIAO_RIGHT", width: xiaoHeaderDims.width, height: xiaoHeaderDims.height,
        pins: Array.from({ length: 7 }, (_, i) => ({ name: (i + 1).toString(), x: -7.62 + i * 2.54, y: 0 })),
        pin_count: 7, x: 0, y: 0, rotation: 0, svgPath: null, glbPath: null, model3d_props: null,
    });

    // 3. Populate netToPins map and handle U4 rerouting
    const u4Data = freeEEG8Schematic.find(c => c[0] === 'U4');
    const u4Nets = u4Data ? u4Data[1] : [];

    for (const [ref, netNames] of freeEEG8Schematic) {
        if (ref === 'U4' || ref.startsWith('GL')) continue;
        netNames.forEach((netName, i) => {
            if (!netToPins[netName]) netToPins[netName] = [];
            netToPins[netName].push(`${ref}-${i + 1}`);
        });
    }

    // Reroute U4's first 14 pins to the new headers
    u4Nets.slice(0, 7).forEach((netName, i) => {
        if (!netToPins[netName]) netToPins[netName] = [];
        netToPins[netName].push(`J_XIAO_1-${i + 1}`);
    });
    u4Nets.slice(7, 14).forEach((netName, i) => {
        if (!netToPins[netName]) netToPins[netName] = [];
        netToPins[netName].push(`J_XIAO_2-${i + 1}`);
    });


    // 4. Create edges from the populated netToPins map
    const edges = [];
    for (const netName in netToPins) {
        const pins = netToPins[netName];
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
            width: 35, // Circular board with 35mm diameter
            height: 35,
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
