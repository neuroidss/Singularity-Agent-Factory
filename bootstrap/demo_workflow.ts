import type { AIToolCall } from '../types';

const projectName = `demo_project_${Date.now()}`;

export const DEMO_WORKFLOW: AIToolCall[] = [
    // --- Phase 1: Schematic Definition ---
    // Part 1: Define ALL components first.
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'U1', componentDescription: '8-Channel ADC', componentValue: 'ADS131M08', footprintIdentifier: 'Package_QFP:LQFP-32_5x5mm_P0.5mm', numberOfPins: 32 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'U2', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'U3', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'X1', componentDescription: '8.192MHz Crystal', componentValue: '8.192MHz', footprintIdentifier: 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering', numberOfPins: 4 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C1', componentDescription: '220nF Ceramic Capacitor', componentValue: '220nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C2', componentDescription: '100nF Ceramic Capacitor', componentValue: '100nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C3', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C4', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C5', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C6', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C7', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'C8', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2 }
    },
    ...Array.from({ length: 10 }, (_, i) => ({
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: `J${i + 1}`, componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom' }
    })),
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'J_XIAO_1', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', numberOfPins: 7 }
    },
    {
        name: 'Define KiCad Component',
        arguments: { projectName, componentReference: 'J_XIAO_2', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', numberOfPins: 7 }
    },

    // Part 2: Define ALL nets now that components are defined.
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN0P', pins: ["J1-1", "U1-29"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN1P', pins: ["J2-1", "U1-32"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN2P', pins: ["J3-1", "U1-1"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN3P', pins: ["J4-1", "U1-4"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN4P', pins: ["J5-1", "U1-5"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN5P', pins: ["J6-1", "U1-8"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN6P', pins: ["J7-1", "U1-9"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AIN7P', pins: ["J8-1", "U1-12"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AINREF', pins: ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'GND', pins: ["J10-1", "U1-13", "U1-25", "U1-28", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-2", "U3-2", "C7-2", "C8-2", "J_XIAO_2-2", "X1-2"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'CAP', pins: ["C1-2", "U1-24"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'REFIN', pins: ["C2-2", "U1-14"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'AVDD', pins: ["U2-5", "U1-15", "C3-1", "C5-1"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'DVDD', pins: ["U3-5", "U1-26", "X1-4", "C4-1", "C7-1"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: '5V', pins: ["C6-1", "C8-1", "J_XIAO_2-1", "U2-1", "U3-1", "U2-3", "U3-3"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'SYNC/RESET', pins: ["U1-16", "J_XIAO_1-1"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'CS', pins: ["U1-17", "J_XIAO_1-3"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'DRDY', pins: ["U1-18", "J_XIAO_1-2"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'SCLK', pins: ["U1-19", "J_XIAO_2-6"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'DOUT', pins: ["U1-20", "J_XIAO_2-5"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'DIN', pins: ["U1-21", "J_XIAO_2-4"] } },
    { name: 'Define KiCad Net', arguments: { projectName, netName: 'XTAL1/CLKIN', pins: ["U1-23", "X1-1"] } },

    // Part 3: Define Layout Rules atomically
    { name: 'Add Absolute Position Constraint', arguments: { projectName, componentReference: 'U1', x: 0, y: 0 } },
    { name: 'Add Layer Constraint', arguments: { projectName, layer: 'bottom', componentsJSON: JSON.stringify(["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10"]) } },
    { name: 'Add Circular Constraint', arguments: { projectName, componentsJSON: JSON.stringify(["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10"]), radius: (30 / 2) * 0.85, centerX: 0, centerY: 0 } },
    { name: 'Add Alignment Constraint', arguments: { projectName, axis: 'vertical', componentsJSON: JSON.stringify(["X1", "J_XIAO_1", "J_XIAO_2"]) } },
    { name: 'Add Symmetry Constraint', arguments: { projectName, axis: 'vertical', pairsJSON: JSON.stringify([["U2", "U3"], ["C5", "C7"], ["C6", "C8"], ["C1", "C2"], ["C3", "C4"]]) } },
    { name: 'Add Proximity Constraint', arguments: { projectName, groupsJSON: JSON.stringify([ ["U1", "C1"], ["U1", "C2"], ["U1", "C3"], ["U1", "C4"], ["U1", "J_XIAO_1"], ["U1", "J_XIAO_2"], ["U2", "C5"], ["U2", "C6"], ["U3", "C7"], ["U3", "C8"] ]) } },

    // --- Phase 2: Board Setup ---
    { name: 'Generate KiCad Netlist', arguments: { projectName } },
    { name: 'Create Initial PCB', arguments: { projectName } },

    // --- Phase 3: Physical Layout ---
    { name: 'Create Board Outline', arguments: { projectName, shape: 'circle', diameterMillimeters: 35 } },
    { name: 'Arrange Components', arguments: { projectName, waitForUserInput: true, layoutStrategy: 'agent' } },
    // The workflow simulation pauses after 'Arrange Components'.
    // The following steps are for the UI to display and for the LLM agent to execute after layout is committed.
    { name: 'Autoroute PCB', arguments: { projectName } },
    { name: 'Export Fabrication Files', arguments: { projectName } },

    // --- Phase 4: Finalization ---
    { name: 'Task Complete', arguments: { reason: "Demo PCB design workflow finished." } }
];
