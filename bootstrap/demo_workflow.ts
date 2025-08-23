
import type { AIToolCall } from '../types';

export const WORKFLOW_SCRIPT: AIToolCall[] = [
    // --- Phase 1: Schematic & Rule Definition (Populates the live simulation) ---
    { name: 'Define KiCad Component', arguments: { componentReference: 'U1', componentDescription: '8-Channel ADC', componentValue: 'ADS131M08', footprintIdentifier: 'Package_QFP:LQFP-32_5x5mm_P0.5mm', numberOfPins: 32, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'U2', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'U3', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'X1', componentDescription: '8.192MHz Crystal', componentValue: '8.192MHz', footprintIdentifier: 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_RotB_HandSoldering', numberOfPins: 4, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C1', componentDescription: '220nF Ceramic Capacitor', componentValue: '220nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C2', componentDescription: '100nF Ceramic Capacitor', componentValue: '100nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C3', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C4', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C5', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C6', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C7', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C8', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top' } },
    ...Array.from({ length: 10 }, (_, i) => ({
        name: 'Define KiCad Component',
        arguments: { componentReference: `J${i + 1}`, componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom' }
    })),
    { name: 'Define KiCad Component', arguments: { componentReference: 'J_XIAO_1', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Right', numberOfPins: 7, side: 'top' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J_XIAO_2', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Right', numberOfPins: 7, side: 'top' } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN0P', pins: ["J1-1", "U1-29"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN1P', pins: ["J2-1", "U1-32"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN2P', pins: ["J3-1", "U1-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN3P', pins: ["J4-1", "U1-4"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN4P', pins: ["J5-1", "U1-5"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN5P', pins: ["J6-1", "U1-8"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN6P', pins: ["J7-1", "U1-9"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN7P', pins: ["J8-1", "U1-12"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AINREF', pins: ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'GND', pins: ["J10-1", "U1-13", "U1-25", "U1-28", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-1", "C7-1", "C8-2", "J_XIAO_2-6", "X1-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'CAP', pins: ["C1-2", "U1-24"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'REFIN', pins: ["C2-2", "U1-14"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AVDD', pins: ["U2-5", "U1-15", "C3-1", "C5-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DVDD', pins: ["U3-5", "U1-26", "X1-4", "C4-1", "C7-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: '5V', pins: ["C6-1", "C8-1", "J_XIAO_2-7", "U2-1", "U3-1", "U2-3", "U3-3"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'SYNC/RESET', pins: ["U1-16", "J_XIAO_1-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'CS', pins: ["U1-17", "J_XIAO_1-3"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DRDY', pins: ["U1-18", "J_XIAO_1-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'SCLK', pins: ["U1-19", "J_XIAO_2-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DOUT', pins: ["U1-20", "J_XIAO_2-3"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DIN', pins: ["U1-21", "J_XIAO_2-4"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'XTAL1/CLKIN', pins: ["U1-23", "X1-1"] } },
    { name: 'Set Simulation Heuristics', arguments: { componentSpacing: 200.0, netLengthWeight: 0.03, boardEdgeConstraint: 2.0, settlingSpeed: 0.99, repulsionRampUpTime: 600, proximityStrength: 1.0, symmetryStrength: 10.0, alignmentStrength: 10.0, circularStrength: 10.0, symmetricalPairStrength: 20.0, absolutePositionStrength: 10.0, fixedRotationStrength: 50.0, symmetryRotationStrength: 10.0, circularRotationStrength: 10.0, distributionStrength: 0.5 } },

    // --- Logical Layout Rules instead of absolute placement ---
    { name: 'Add Absolute Position Constraint', arguments: { componentReference: 'U1', x: 0, y: -6 } },
    { name: 'Add Fixed Property Constraint', arguments: { componentReference: 'U1', propertiesJSON: '{"rotation": -90}' } },
    { name: 'Add Absolute Position Constraint', arguments: { componentReference: 'X1', x: 0, y: 2 } },
    { name: 'Add Absolute Position Constraint', arguments: { componentReference: 'U2', y: 9 } },
    { name: 'Add Absolute Position Constraint', arguments: { componentReference: 'U3', y: 9 } },
    { name: 'Add Circular Constraint', arguments: { componentsJSON: '["J1","J2","J3","J4","J5","J6","J7","J8","J9","J10"]', radius: 10, centerX: 0, centerY: 0 } },
    { name: 'Add Layer Constraint', arguments: { layer: 'bottom', componentsJSON: '["J1","J2","J3","J4","J5","J6","J7","J8","J9","J10"]' } },
    { name: 'Add Symmetrical Pair Constraint', arguments: { pairJSON: '["J_XIAO_1", "J_XIAO_2"]', axis: 'vertical', separation: 2.54*7 } },
    { name: 'Add Fixed Property Constraint', arguments: { componentReference: 'J_XIAO_1', propertiesJSON: '{"rotation": 0}' } },
    { name: 'Add Fixed Property Constraint', arguments: { componentReference: 'J_XIAO_2', propertiesJSON: '{"rotation": 180}' } },
    { name: 'Add Proximity Constraint', arguments: { groupsJSON: '[["U1", "C1"], ["U1", "C2"], ["U1", "C3"], ["U1", "C4"]]' } },
    { name: 'Add Proximity Constraint', arguments: { groupsJSON: '[["U2", "C5"], ["U2", "C6"]]' } },
    { name: 'Add Proximity Constraint', arguments: { groupsJSON: '[["U3", "C7"], ["U3", "C8"]]' } },
    { name: 'Add Symmetry Constraint', arguments: { axis: 'vertical', pairsJSON: '[["J_XIAO_1", "J_XIAO_2"]]' } },
    { name: 'Add Symmetry Constraint', arguments: { axis: 'vertical', pairsJSON: '[["U2", "U3"]]' } },
//    { name: 'Add Symmetry Constraint', arguments: { axis: 'vertical', pairsJSON: '[["C5", "C7"], ["C6", "C8"], ["C1", "C3"], ["C2", "C4"]]' } },
    { name: 'Add Alignment Constraint', arguments: { axis: 'vertical', componentsJSON: '["U1", "X1"]' } },
    { name: 'Add Alignment Constraint', arguments: { axis: 'horizontal', componentsJSON: '["J_XIAO_1", "J_XIAO_2"]' } },
//    { name: 'Add Symmetry Constraint', arguments: { axis: 'horizontal', pairsJSON: '[["U1", "X1"]]' } },
    
    // --- Phase 2: Create PCB and Arrange (This step now runs autonomously) ---
    { name: 'Generate KiCad Netlist', arguments: {} },
    { name: 'Create Initial PCB', arguments: {} },
    { name: 'Create Board Outline', arguments: { shape: 'circle', diameterMillimeters: 26 } },
    { name: 'Create Copper Pour', arguments: { layerName: 'In1.Cu', netName: 'GND' } },
    { name: 'Arrange Components', arguments: { waitForUserInput: false, layoutStrategy: 'agent' } },

    // --- Phase 3: Post-Layout Steps (These run after the simulation is committed) ---
    // 'Update KiCad Component Positions' is handled by the commit logic
    { name: 'Autoroute PCB', arguments: {} },
    { name: 'Export Fabrication Files', arguments: {} },
    { name: 'Task Complete', arguments: { reason: "Demo PCB design workflow finished." } }
];
