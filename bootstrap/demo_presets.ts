import type { AIToolCall } from '../types';

export const EXAMPLE_PROMPTS: { name: string; prompt: string }[] = [
    {
        name: 'EEG Phylactery Quest',
        prompt: `An archivist from the Great Library requires a 'Phylactery of True Sight' to awaken a dormant XIAO-series Golem Core. This Phylactery must be a stackable mezzanine board that grants the Core advanced neuro-sensing capabilities.

Here is the plan, transcribed from the ancient schematics:

1.  **Reagent Inscription (Component Definition):**
    *   The Phylactery's heart 'U1' is an 'ADS131M08' with footprint 'Package_QFP:LQFP-32_5x5mm_P0.5mm'.
    *   It requires twin LDO lifeblood sources, 'U2' & 'U3', of type 'LP5907QMFX-3.3Q1' with footprint 'Package_TO_SOT_SMD:SOT-23-5'.
    *   A time-crystal 'X1' of '8.192MHz' in a 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_RotB_HandSoldering' chassis.
    *   Various capacitor essences: 'C1' (220nF), 'C2' (100nF), 'C3' & 'C4' (1uF) in 'Capacitor_SMD:C_0402_1005Metric' forms. 'C5'-'C8' (2.2uF) in 'Capacitor_SMD:C_0603_1608Metric' forms.
    *   Two binding tablets for the Golem Core, 'J_XIAO_1' and 'J_XIAO_2', with footprint 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Right'.
    *   Ten 'bottom'-layer pogo-pin contact spines ('J1'-'J10') for neural interface, footprint 'freeeeg8-alpha:pogo_pin_d5x10mm_smd'. All other reagents are for the 'top' layer.

2.  **Matrix Weaving (Net Definition):**
    *   A 'GND' net must link: ["U1-13", "U1-25", "U1-28", "J10-1", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-1", "C7-1", "C8-2", "J_XIAO_2-6", "X1-2"].
    *   Weave all other nets as per the FreeEEG8-alpha schematic standard.

3.  **Placement Glyphs (Layout Rules):**
    *   Arrange the pogo pins ('J1'-'J10') in a circle of 10mm radius.
    *   The core 'U1' and time-crystal 'X1' must be aligned on the central vertical axis.
    *   The Phylactery must be symmetrical. Mirror these reagent pairs across the vertical axis: [J_XIAO_1, J_XIAO_2], [U2, U3], [C5, C7], [C6, C8].
    *   Ensure decoupling capacitors C1-C4 are near U1; C5-C6 near U2; C7-C8 near U3.

4.  **Board Manifestation:**
    *   Create a circular board outline of 26mm diameter.
    *   Arrange components using the 'agent' strategy and await user input for final adjustments.
    *   Autoroute the PCB and export fabrication files.
    `
    },
];

const EEG_MEZZANINE_WORKFLOW: AIToolCall[] = [
    // This workflow is based on verified datasheet pinouts.
    // NOTE: Service initialization ('Start Python Process') is now handled implicitly by the first KiCad proxy tool call on the server.
    
    // --- Phase 1: Schematic & Rule Definition (Populates the live simulation) ---
    { name: 'Define KiCad Component', arguments: { componentReference: 'U1', componentDescription: '8-Channel ADC', componentValue: 'ADS131M08', footprintIdentifier: 'Package_QFP:LQFP-32_5x5mm_P0.5mm', numberOfPins: 32, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":29,"net":"AIN0P"},{"pin":32,"net":"AIN1P"},{"pin":1,"net":"AIN2P"},{"pin":4,"net":"AIN3P"},{"pin":5,"net":"AIN4P"},{"pin":8,"net":"AIN5P"},{"pin":9,"net":"AIN6P"},{"pin":12,"net":"AIN7P"},{"pin":2,"net":"AINREF"},{"pin":3,"net":"AINREF"},{"pin":6,"net":"AINREF"},{"pin":7,"net":"AINREF"},{"pin":10,"net":"AINREF"},{"pin":11,"net":"AINREF"},{"pin":30,"net":"AINREF"},{"pin":31,"net":"AINREF"},{"pin":13,"net":"GND"},{"pin":25,"net":"GND"},{"pin":28,"net":"GND"},{"pin":24,"net":"CAP"},{"pin":14,"net":"REFIN"},{"pin":15,"net":"AVDD"},{"pin":26,"net":"DVDD"},{"pin":16,"net":"SYNC/RESET"},{"pin":17,"net":"CS"},{"pin":18,"net":"DRDY"},{"pin":19,"net":"SCLK"},{"pin":20,"net":"DOUT"},{"pin":21,"net":"DIN"},{"pin":23,"net":"XTAL1/CLKIN"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'U2', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":5,"net":"AVDD"},{"pin":1,"net":"5V"},{"pin":3,"net":"5V"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'U3', componentDescription: '3.3V LDO Voltage Regulator', componentValue: 'LP5907QMFX-3.3Q1', footprintIdentifier: 'Package_TO_SOT_SMD:SOT-23-5', numberOfPins: 5, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":5,"net":"DVDD"},{"pin":1,"net":"5V"},{"pin":3,"net":"5V"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'X1', componentDescription: '8.192MHz Oscillator', componentValue: '8.192MHz', footprintIdentifier: 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_RotB_HandSoldering', numberOfPins: 4, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":4,"net":"DVDD"},{"pin":3,"net":"XTAL1/CLKIN"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C1', componentDescription: '220nF Ceramic Capacitor', componentValue: '220nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":1,"net":"GND"},{"pin":2,"net":"CAP"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C2', componentDescription: '100nF Ceramic Capacitor', componentValue: '100nF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":1,"net":"GND"},{"pin":2,"net":"REFIN"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C3', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":1,"net":"AVDD"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C4', componentDescription: '1uF Ceramic Capacitor', componentValue: '1uF', footprintIdentifier: 'Capacitor_SMD:C_0402_1005Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":1,"net":"DVDD"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C5', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":1,"net":"AVDD"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C6', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":1,"net":"GND"},{"pin":2,"net":"5V"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C7', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":1,"net":"GND"},{"pin":2,"net":"DVDD"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'C8', componentDescription: '2.2uF Ceramic Capacitor', componentValue: '2.2uF', footprintIdentifier: 'Capacitor_SMD:C_0603_1608Metric', numberOfPins: 2, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":1,"net":"5V"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J1', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN0P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J2', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN1P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J3', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN2P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J4', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN3P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J5', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN4P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J6', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN5P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J7', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN6P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J8', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AIN7P"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J9', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"AINREF"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J10', componentDescription: 'Pogo Pin Electrode', componentValue: 'POGO', footprintIdentifier: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', numberOfPins: 1, side: 'bottom', exportSVG: true, pinConnections: `[{"pin":1,"net":"GND"}]` } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J_XIAO_1', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Right', numberOfPins: 7, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":1,"net":"SYNC/RESET"},{"pin":2,"net":"DRDY"},{"pin":3,"net":"CS"}]' } },
    { name: 'Define KiCad Component', arguments: { componentReference: 'J_XIAO_2', componentDescription: 'XIAO Header', componentValue: 'XIAO_HEADER', footprintIdentifier: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical_SMD_Pin1Left', numberOfPins: 7, side: 'top', exportSVG: true, exportGLB: true, pinConnections: '[{"pin":2,"net":"GND"},{"pin":1,"net":"5V"},{"pin":6,"net":"SCLK"},{"pin":5,"net":"DOUT"},{"pin":4,"net":"DIN"}]' } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN0P', pins: ["J1-1", "U1-29"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN1P', pins: ["J2-1", "U1-32"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN2P', pins: ["J3-1", "U1-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN3P', pins: ["J4-1", "U1-4"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN4P', pins: ["J5-1", "U1-5"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN5P', pins: ["J6-1", "U1-8"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN6P', pins: ["J7-1", "U1-9"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AIN7P', pins: ["J8-1", "U1-12"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AINREF', pins: ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'GND', pins: ["J10-1", "U1-13", "U1-25", "U1-28", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "U3-2", "C5-2", "C6-1", "C7-1", "C8-2", "J_XIAO_2-2", "X1-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'CAP', pins: ["C1-2", "U1-24"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'REFIN', pins: ["C2-2", "U1-14"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'AVDD', pins: ["U2-5", "U1-15", "C3-1", "C5-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DVDD', pins: ["U3-5", "U1-26", "X1-4", "C4-1", "C7-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: '5V', pins: ["C6-2", "C8-1", "J_XIAO_2-1", "U2-1", "U3-1", "U2-3", "U3-3"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'SYNC/RESET', pins: ["U1-16", "J_XIAO_1-1"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'CS', pins: ["U1-17", "J_XIAO_1-3"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DRDY', pins: ["U1-18", "J_XIAO_1-2"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'SCLK', pins: ["U1-19", "J_XIAO_2-6"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DOUT', pins: ["U1-20", "J_XIAO_2-5"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'DIN', pins: ["U1-21", "J_XIAO_2-4"] } },
    { name: 'Define KiCad Net', arguments: { netName: 'XTAL1/CLKIN', pins: ["U1-23", "X1-3"] } },
    { name: 'Set Simulation Heuristics', arguments: { boardPadding: 0.20, } },
    { name: 'Add Circular Constraint', arguments: { componentsJSON: '["J1","J2","J3","J4","J5","J6","J7","J8","J9","J10"]', radius: 12.5, centerX: 0, centerY: 0 } },
    { name: 'Add Layer Constraint', arguments: { layer: 'bottom', componentsJSON: '["J1","J2","J3","J4","J5","J6","J7","J8","J9","J10"]' } },
    { name: 'Add Symmetrical Pair Constraint', arguments: { pairJSON: '["J_XIAO_1", "J_XIAO_2"]', axis: 'vertical', separation: 2.54*7 } },
    { name: 'Add Proximity Constraint', arguments: { groupsJSON: '[["U1", "C1"], ["U1", "C2"], ["U1", "C3"], ["U1", "C4"], ["U2", "C5"], ["U2", "C6"], ["U3", "C7"], ["U3", "C8"]]' } },
    { name: 'Add Symmetry Constraint', arguments: { axis: 'vertical', pairsJSON: '[["U2", "U3"]]' } },
    
    // --- Phase 2: Create PCB and Arrange (This step now runs autonomously) ---
    { name: 'Generate KiCad Netlist', arguments: {} },
    { name: 'Create Initial PCB', arguments: {} },
    { name: 'Create Board Outline', arguments: { shape: 'circle', diameterMillimeters: 33 } },
    { name: 'Create Copper Pour', arguments: { layerName: 'In1.Cu', netName: 'GND' } },
    { name: 'Arrange Components', arguments: { waitForUserInput: true, layoutStrategy: 'agent' } },

    // --- Phase 3: Post-Layout Steps (These run after the simulation is committed) ---
    // 'Update KiCad Component Positions' is handled by the commit logic
    { name: 'Autoroute PCB', arguments: {} },
    { name: 'Export Fabrication Files', arguments: {} },
    { name: 'Task Complete', arguments: { reason: "Demo PCB design workflow finished." } },
];

// This script is now the single source of truth for both local and server world generation.
export const AETHERIUM_INITIAL_WORLD_SETUP: AIToolCall[] = [
    // Define the types of creatures that can exist
    { name: 'Define World Creature', arguments: { creatureId: 'mind_weaver', name: 'Mind Weaver', description: 'A crab-like schematic-creature that yields a Crystal of Immaculate Mind.', asset_glb: 'assets/game/creatures/creature_schematic_mind_weaver_ads131m08.glb' } },
    { name: 'Define World Creature', arguments: { creatureId: 'heartbeat_beetle', name: 'Heartbeat Beetle', description: 'A small beetle whose core pulses with stable energy.', asset_glb: 'assets/game/creatures/creature_schematic_heartbeat_beetle_lp5907.glb' } },
    { name: 'Define World Creature', arguments: { creatureId: 'time_crystal_cicada', name: 'Time-Crystal Cicada', description: 'A crystalline insect whose wings vibrate at a precise frequency, yielding a Flawless Crystal of Time.', asset_glb: 'assets/game/creatures/creature_schematic_time_cicada_ecs2520mv.glb' } },
    { name: 'Define World Creature', arguments: { creatureId: 'ley_capacitor_mite', name: 'Ley-Capacitor Mite', description: 'A tiny, swarming insect made of ceramic that stores ambient magical energy, yielding a Ley-Capacitor Spore.', asset_glb: 'assets/game/creatures/creature_schematic_capacitor_mite.glb' } },
    { name: 'Define World Creature', arguments: { creatureId: 'golden_contact_needler', name: 'Golden Contact Needler', description: 'An agile, needle-like creature that flits through the air, yielding a Golden Contact Spine.', asset_glb: 'assets/game/creatures/creature_schematic_pogo_needler.glb' } },
    { name: 'Define World Creature', arguments: { creatureId: 'logic_weaving_worm', name: 'Logic-Weaving Worm', description: 'A segmented worm with metallic legs that leaves a faint trail of light, yielding a Tablet of Logical Weaving.', asset_glb: 'assets/game/creatures/creature_schematic_header_worm.glb' } },
    
    // Place key environment objects
    { name: 'Place Environment Object', arguments: { objectId: 'central_forge', type: 'Alchemists_Forge', x: 0, y: 0, asset_glb: 'assets/game/stations/station_alchemists_forge.glb' } },

    // Spawn specific instances of creatures/NPCs in the world
    { name: 'Define Robot Agent', arguments: { id: 'mind_weaver_1', startX: 10, startY: 10, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'heartbeat_beetle_1', startX: -8, startY: -5, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'heartbeat_beetle_2', startX: -9, startY: -6, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'time_crystal_cicada_1', startX: 5, startY: -8, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'ley_capacitor_mite_1', startX: 10, startY: -5, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'ley_capacitor_mite_2', startX: 11, startY: -5, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'ley_capacitor_mite_3', startX: 10, startY: -4, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'ley_capacitor_mite_4', startX: 11, startY: -4, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'golden_contact_needler_1', startX: -10, startY: 10, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'golden_contact_needler_2', startX: -11, startY: 9, behaviorType: 'patroller' } },
    { name: 'Define Robot Agent', arguments: { id: 'logic_weaving_worm_1', startX: -2, startY: 9, behaviorType: 'patroller' } },
];


export const WORKFLOW_SCRIPTS: { name: string; workflow: AIToolCall[] }[] = [
    {
        name: 'Forge Phylactery of True Sight',
        workflow: EEG_MEZZANINE_WORKFLOW
    },
    {
        name: 'Aetherium: Genesis Ritual',
        workflow: AETHERIUM_INITIAL_WORLD_SETUP
    },
];
