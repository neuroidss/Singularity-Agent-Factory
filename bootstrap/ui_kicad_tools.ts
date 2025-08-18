
// bootstrap/kicad_tools.ts

import type { ToolCreatorPayload } from '../types';
import { KICAD_CLI_MAIN_SCRIPT } from './kicad_cli_script';
import { KICAD_CLI_SCHEMATIC_COMMANDS_SCRIPT } from './kicad_cli_schematic_commands';
import { KICAD_CLI_LAYOUT_COMMANDS_SCRIPT } from './kicad_cli_layout_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';

const KICAD_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Add Absolute Position Constraint',
        description: 'Fixes an electronic component to an absolute X, Y coordinate on the PCB. Essential for connectors, mounting holes, or parts with fixed mechanical constraints in the final device assembly.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To lock critical components to a specific physical location on the board, ensuring mechanical alignment with an enclosure or other hardware, which is a key step in designing a manufacturable product.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentReference', type: 'string', description: 'The reference designator of the component to fix (e.g., "U1").', required: true },
            { name: 'x', type: 'number', description: 'The X coordinate in millimeters.', required: true },
            { name: 'y', type: 'number', description: 'The Y coordinate in millimeters.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_absolute_position_constraint'
    },
    {
        name: 'Add Proximity Constraint',
        description: 'Adds a design rule that specific electronic components must be placed close to each other on the PCB. Critical for high-speed signals or decoupling capacitors.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To enforce critical placement for components that have a close electrical relationship, improving signal integrity, reducing noise, and ensuring the performance of the final electronic device.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'groupsJSON', type: 'string', description: 'A JSON string of an array of arrays, where each inner array is a group of component references that should be close. E.g., \'[["U1", "C1"], ["U1", "C2"]]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_proximity_constraint'
    },
    {
        name: 'Add Alignment Constraint',
        description: 'Adds a design rule to align a group of electronic components along a specified axis (vertical or horizontal) on the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To create clean, organized, and manufacturable PCB layouts by aligning components like headers, LEDs, or resistor arrays, which improves routing and assembly efficiency.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'axis', type: 'string', description: 'The axis for alignment: "vertical" or "horizontal".', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to align. E.g., \'["J1", "J2", "J3"]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_alignment_constraint'
    },
     {
        name: 'Add Symmetry Constraint',
        description: 'Adds a design rule that components in specified pairs should be placed symmetrically across a central axis on the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To ensure balanced electrical and thermal layouts for sensitive circuits, such as analog amplifiers or differential pairs, which is critical for the performance and reliability of the electronic device.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'axis', type: 'string', description: 'The axis of symmetry: "vertical" or "horizontal".', required: true },
            { name: 'pairsJSON', type: 'string', description: 'A JSON string of an array of pairs. Each pair is an array of two component references. E.g., \'[["C1", "C2"], ["R1", "R2"]]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_symmetry_constraint'
    },
    {
        name: 'Add Circular Constraint',
        description: 'Adds a design rule to arrange a set of electronic components in a circular pattern around a center point on the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To create specialized PCB layouts for circular devices, such as LED rings, rotary encoders, or circular sensor arrays, enabling unique hardware form factors.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to arrange in a circle.', required: true },
            { name: 'radius', type: 'number', description: 'The radius of the circle in millimeters.', required: true },
            { name: 'centerX', type: 'number', description: 'The X coordinate of the circle\'s center in millimeters.', required: true },
            { name: 'centerY', type: 'number', description: 'The Y coordinate of the circle\'s center in millimeters.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_circular_constraint'
    },
     {
        name: 'Add Layer Constraint',
        description: 'Adds a design rule to force a set of components to be placed on a specific layer of the PCB (top or bottom).',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To control the physical placement of components on either side of the PCB, optimizing for space, thermal management, or assembly requirements during manufacturing.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'layer', type: 'string', description: 'The target layer: "top" or "bottom".', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to place on the specified layer.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_layer_constraint'
    },
    {
        name: 'Add Fixed Property Constraint',
        description: 'Fixes a specific property of a component, like its rotation or side, preventing it from being changed by the simulation. Use this for components with required orientations.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To give the agent precise control over individual component properties that are non-negotiable, such as the orientation of a polarized capacitor or a specific connector.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentReference', type: 'string', description: 'The reference designator of the component (e.g., "U1").', required: true },
            { name: 'propertiesJSON', type: 'string', description: 'A JSON string of an object with properties to fix. E.g., \'{"rotation": 90}\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_fixed_property_constraint'
    },
    {
        name: 'Add Symmetrical Pair Constraint',
        description: 'Constrains two components to be symmetrical about an axis with a specific separation distance between them. It automatically handles their relative rotation to face each other.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To correctly model and place pairs of components like DIP packages or board-edge connectors (e.g., XIAO) that have a fixed, mirrored physical relationship.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'pairJSON', type: 'string', description: 'A JSON string of an array with two component references. E.g., \'["J_XIAO_1", "J_XIAO_2"]\'.', required: true },
            { name: 'axis', type: 'string', description: 'The axis of symmetry: "vertical" or "horizontal".', required: true },
            { name: 'separation', type: 'number', description: 'The required distance between the two components in millimeters.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_symmetrical_pair_constraint'
    },
    {
        name: 'Define KiCad Component',
        description: 'Defines a single electronic component by its schematic reference, value, and physical footprint. This must be called for every component before creating the netlist for the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To define the fundamental building blocks of an electronic circuit, creating a complete Bill of Materials (BOM) and providing the necessary data to translate the logical schematic into a physical PCB layout.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project, used to group all related files.', required: true },
            { name: 'componentReference', type: 'string', description: 'The unique reference designator for the component on the schematic (e.g., U1, R1, C1).', required: true },
            { name: 'componentDescription', type: 'string', description: `A human-readable description of the component's function (e.g., "MCU", "10k Resistor").`, required: true },
            { name: 'componentValue', type: 'string', description: `The value of the component (e.g., "ESP32-S3-WROOM-1", "10k"). For components from a library, use the format 'LibraryName:PartName'.`, required: true },
            { name: 'footprintIdentifier', type: 'string', description: `The KiCad footprint identifier for the component's physical package (e.g., "Resistor_SMD:R_0805_2012Metric").`, required: true },
            { name: 'numberOfPins', type: 'number', description: 'The total number of pins for this component. Used for creating generic parts. Set to 0 if this is a pre-defined library part specified in componentValue.', required: true },
            { name: 'side', type: 'string', description: "The initial side of the board for the component ('top' or 'bottom'). Defaults to 'top'.", required: false },
        ],
        implementationCode: 'python scripts/kicad_cli.py define_component'
    },
    {
        name: 'Define KiCad Net',
        description: 'Defines a single electrical connection (a net) by its name and the component pins it connects. This must be called for every net in the schematic design.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To translate a logical connection from an electronic schematic into a physical requirement for the PCB layout, defining the electrical conductivity paths between components.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'netName', type: 'string', description: "The name of the net (e.g., 'GND', 'VCC', 'DATA0').", required: true },
            { name: 'pins', type: 'array', description: 'An array of component pin strings to connect to this net (e.g., ["U1-1", "R1-2"]).', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py define_net'
    },
    {
        name: 'Generate KiCad Netlist',
        description: 'Generates the final KiCad netlist file from all previously defined components and nets. This is the bridge between the schematic and the PCB layout stages.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To consolidate all defined components and nets into a single, machine-readable netlist file that serves as the blueprint for the physical PCB layout and routing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py generate_netlist'
    },
    {
        name: 'Create Initial PCB',
        description: 'Creates a blank .kicad_pcb file and imports the generated netlist, placing all component footprints at the origin, ready for arrangement.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To create the physical board file and load all the component footprints into it, officially starting the physical design phase of the hardware project.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'python scripts/kicad_cli.py create_initial_pcb'
    },
    {
        name: 'Create Board Outline',
        description: 'Defines the physical shape and size of the PCB on the Edge.Cuts layer. Can be rectangular, circular, or auto-sized based on component placement.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To define the physical dimensions and shape of the final printed circuit board, a critical step for mechanical fitting and manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'shape', type: 'string', description: "The shape of the board outline. Can be 'rectangle' or 'circle'. Defaults to 'rectangle'.", required: false },
            { name: 'boardWidthMillimeters', type: 'number', description: "For 'rectangle' shape, the desired width in mm. Omit or set to 0 for auto-sizing.", required: false },
            { name: 'boardHeightMillimeters', type: 'number', description: "For 'rectangle' shape, the desired height in mm. Omit or set to 0 for auto-sizing.", required: false },
            { name: 'diameterMillimeters', type: 'number', description: "For 'circle' shape, the desired diameter in mm. If omitted, it will auto-size to fit components.", required: false },
        ],
        implementationCode: 'python scripts/kicad_cli.py create_board_outline'
    },
    {
        name: 'Arrange Components',
        description: "Extracts component and net data from the PCB file and sends it to the client for interactive or autonomous layout. This step organizes the physical placement of components.",
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To bridge the gap between the abstract electronic schematic and the physical PCB reality by generating an initial component placement, which is the foundational step for routing and manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'waitForUserInput', type: 'boolean', description: "Set to 'true' to pause the workflow for interactive manual layout on the client. Set to 'false' to perform an autonomous layout on the client and continue the workflow automatically.", required: true },
            { name: 'layoutStrategy', type: 'string', description: "The layout engine to use: 'agent' for rule-based, 'physics' for Rapier.js simulation. Defaults to 'agent'.", required: false },
        ],
        implementationCode: 'python scripts/kicad_cli.py arrange_components'
    },
    {
        name: 'Update KiCad Component Positions',
        description: 'Updates the positions of components on the .kicad_pcb file after arrangement and automatically calculates a new board outline to tightly fit the placed components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To commit the refined component layout from the arrangement stage back to the KiCad board file and create the final, optimized board outline for manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y, rotation, side} coordinates. Example: '{"U1": {"x": 10, "y": 15, "rotation": 90, "side": "top"}, "R1": {"x": 25, "y": 15, "rotation": 0, "side": "bottom"}}'.`, required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py update_component_positions'
    },
    {
        name: 'Autoroute PCB',
        description: 'Automatically routes the copper traces between components on the PCB based on the netlist. It exports to a DSN file, runs an external autorouter, and imports the results.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To automatically create the copper traces that form the electrical connections between components, transforming the placed board into a functional electronic circuit.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py autoroute_pcb'
    },
    {
        name: 'Export Fabrication Files',
        description: 'Generates all necessary manufacturing outputs (Gerbers, drill files, 3D model) and packages them into a zip file, ready for a PCB fabrication house.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To produce the final, complete manufacturing dataset required by a factory to produce the physical electronic device, marking the successful culmination of the hardware design process.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'python scripts/kicad_cli.py export_fabrication_files'
    },
    {
        name: 'Update Workflow Checklist',
        description: "Communicates the agent's plan for a specific workflow stage to the UI, which renders a detailed checklist. Used to track progress within complex steps like defining dozens of components.",
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: "To provide granular, real-time progress updates of the PCB design process to the user by showing the agent's detailed plan and tracking its completion.",
        parameters: [
            { name: 'workflowStepName', type: 'string', description: 'The name of the workflow step this checklist applies to (e.g., "Define Components").', required: true },
            { name: 'checklistItems', type: 'array', description: 'An array of strings representing the sub-tasks for this step (e.g., ["U1", "C1", "R1"]).', required: true },
        ],
        implementationCode: `
            // This is a special client-side tool. Its logic is handled inside useAppRuntime
            // to directly update the state in useKicadManager.
            // It requires no further implementation here as it's a state management trigger.
            return { success: true, message: \`UI checklist updated for step: \${args.workflowStepName}\` };
        `
    }
];

const KICAD_CLI_COMMANDS_SCRIPT = KICAD_CLI_SCHEMATIC_COMMANDS_SCRIPT + KICAD_CLI_LAYOUT_COMMANDS_SCRIPT;

const KICAD_DESIGN_PROMPT_TEXT = `I need a PCB design for a FreeEEG8-alpha inspired mezzanine board.

Here is the plan:

1.  **Component Definition:**
    *   ADC 'U1': 'ADS131M08', footprint: 'Package_QFP:LQFP-32_5x5mm_P0.5mm', 32 pins.
    *   AVDD LDO 'U2': 'LP5907QMFX-3.3Q1', footprint: 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   DVDD LDO 'U3': 'LP5907QMFX-3.3Q1', footprint: 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   Oscillator 'X1': '8.192MHz', footprint: 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering', 4 pins.
    *   Capacitors: 'C1' (220nF), 'C2' (100nF), 'C3' & 'C4' (1uF), all footprint: 'Capacitor_SMD:C_0402_1005Metric', 2 pins each.
    *   LDO Caps: 'C5'-'C8' (2.2uF), footprint: 'Capacitor_SMD:C_0603_1608Metric', 2 pins each.
    *   XIAO Headers 'J_XIAO_1', 'J_XIAO_2', footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', 7 pins each.
    *   Pogo Pins 'J1'-'J10', footprint: 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', 1 pin each, side: bottom.

2.  **Net Definition:**
    *   A net named 'GND' connecting pins: ["U1-13", "U1-25", "U1-28", "J10-1", "C1-1", "C2-1", "C3-2", "C4-2", "U2-2", "C5-2", "C6-1", "C7-1", "C8-2", "J_XIAO_2-6", "X1-2"]
    *   A net named 'AVDD' connecting pins: ["U1-15", "C3-1", "U2-5", "C5-1"]
    *   A net named 'DVDD' connecting pins: ["U1-26", "C4-1", "U3-5", "C7-2", "X1-4"]
    *   A net named '5V' connecting pins: ["J_XIAO_2-7", "C6-2", "C8-1", "U2-1", "U3-1", "U2-3", "U3-3"]
    *   A net named 'CAP' connecting pins: ["C1-2", "U1-24"]
    *   A net named 'REFIN' connecting pins: ["C2-2", "U1-14"]
    *   A net named 'SYNC/RESET' connecting pins: ["U1-16", "J_XIAO_1-1"]
    *   A net named 'DRDY' connecting pins: ["U1-18", "J_XIAO_1-2"]
    *   A net named 'CS' connecting pins: ["U1-17", "J_XIAO_1-3"]
    *   A net named 'DIN' connecting pins: ["U1-21", "J_XIAO_2-4"]
    *   A net named 'SCLK' connecting pins: ["U1-19", "J_XIAO_2-2"]
    *   A net named 'DOUT' connecting pins: ["U1-20", "J_XIAO_2-3"]
    *   A net named 'XTAL1/CLKIN' connecting pins: ["U1-23", "X1-1"]
    *   A net named 'AIN0P' connecting pins: ["J1-1", "U1-29"]
    *   A net named 'AIN1P' connecting pins: ["J2-1", "U1-32"]
    *   A net named 'AIN2P' connecting pins: ["J3-1", "U1-1"]
    *   A net named 'AIN3P' connecting pins: ["J4-1", "U1-4"]
    *   A net named 'AIN4P' connecting pins: ["J5-1", "U1-5"]
    *   A net named 'AIN5P' connecting pins: ["J6-1", "U1-8"]
    *   A net named 'AIN6P' connecting pins: ["J7-1", "U1-9"]
    *   A net named 'AIN7P' connecting pins: ["J8-1", "U1-12"]
    *   A net named 'AINREF' connecting pins: ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"]

3.  **Layout Rules:**
    *   The pogo pins (J1 to J10) should be on the 'bottom' layer, arranged in a circle with a radius of 12.5mm.
    *   All other than pogo pins components should be on the 'top' layer.
    *   The core components 'U1' and 'X1' must be aligned to the central vertical axis.
    *   The design must be symmetrical. The following pairs should be mirrored across the vertical axis: [J_XIAO_1, J_XIAO_2], [U2, U3], [C5, C7], [C6, C8], [C1, C2], [C3, C4].
    *   To ensure good power integrity, the decoupling capacitors must be kept close to the ADC. Define proximity groups for [U1, C1], [U1, C2], [U1, C3], and [U1, C4].
    *   Create proximity rules to place decoupling capacitors C1-C4 near ADC U1, C5-C6 near LDO U2, and C7-C8 near LDO U3.

4.  **Board Generation:**
    *   Generate netlist, create initial PCB, create a circular 35mm diameter outline.

5.  Arrange the components using the 'agent' arrangement strategy, which respects the defined layout rules, and wait for user input for final adjustments.
6.  Autoroute the PCB.
7.  Export the final fabrication files.

    `;

const KICAD_UI_PANEL_TOOL: ToolCreatorPayload = {
    name: 'KiCad Design Automation Panel',
    description: 'The main UI for the KiCad workflow, allowing users to input a request and monitor the agent swarm as it executes the design process.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly, all-in-one interface for the complex hardware generation workflow, managed by an AI swarm.',
    parameters: [
        { name: 'onStartTask', type: 'object', description: 'Function to start the LLM agent task.', required: true },
        { name: 'onStartDemo', type: 'object', description: 'Function to start the local simulation.', required: true },
        { name: 'onStopDemo', type: 'object', description: 'Function to stop and reset the workflow state.', required: true },
        { name: 'kicadLog', type: 'array', description: 'Log messages from the KiCad workflow.', required: true },
        { name: 'isGenerating', type: 'boolean', description: 'Flag indicating if the swarm/simulation is running.', required: true },
        { name: 'workflowSteps', type: 'array', description: 'List of workflow steps and their status.', required: true },
        { name: 'currentArtifact', type: 'object', description: 'The currently displayed artifact (e.g., a schematic or board SVG).', required: false },
        { name: 'demoWorkflow', type: 'array', description: 'The array of tool calls for the demo simulation.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        // Asset Generation Props
        { name: 'generateSvg', type: 'boolean', description: 'Whether to generate SVG footprints during the demo.', required: true },
        { name: 'setGenerateSvg', type: 'object', description: 'Function to toggle SVG generation.', required: true },
        { name: 'generateGlb', type: 'boolean', description: 'Whether to generate 3D GLB models during the demo.', required: true },
        { name: 'setGenerateGlb', type: 'object', description: 'Function to toggle GLB generation.', required: true },
        // Interactive Demo Props
        { name: 'executionState', type: 'string', description: 'The current execution state of the demo.', required: true },
        { name: 'currentStepIndex', type: 'number', description: 'The index of the current step in the demo.', required: true },
        { name: 'demoStepStatuses', type: 'array', description: 'The status of each step in the demo.', required: true },
        { name: 'onPlayPause', type: 'object', description: 'Handler to play/pause the demo.', required: true },
        { name: 'onStepForward', type: 'object', description: 'Handler to step forward.', required: true },
        { name: 'onStepBackward', type: 'object', description: 'Handler to step backward.', required: true },
        { name: 'onRunFromStep', type: 'object', description: 'Handler to run from a specific step.', required: true },
        // Layout View Props
        { name: 'currentLayoutData', type: 'object', description: 'Graph data for the interactive layout tool.', required: false },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
        { name: 'onCommitLayout', type: 'object', description: 'Callback function to commit the final layout.', required: true },
    ],
    implementationCode: `
    const [prompt, setPrompt] = React.useState(\`${KICAD_DESIGN_PROMPT_TEXT.replace(/`/g, '\\`')}\`);
    const [files, setFiles] = React.useState([]);
    const [urls, setUrls] = React.useState(['']);
    const [useSearch, setUseSearch] = React.useState(false);
    
    const scrollContainerRef = React.useRef(null);
    
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [kicadLog]);

    const handleFileChange = (e) => {
        setFiles(prev => [...prev, ...Array.from(e.target.files)]);
        e.target.value = '';
    };
    const removeFile = (fileToRemove) => setFiles(prev => prev.filter(f => f !== fileToRemove));

    const handleUrlChange = (index, value) => {
        const newUrls = [...urls]; newUrls[index] = value;
        if (index === urls.length - 1 && value) newUrls.push('');
        setUrls(newUrls);
    };
    const removeUrl = (index) => setUrls(prev => urls.length > 1 ? prev.filter((_, i) => i !== index) : ['']);

    const handleStartLLM = async () => {
        if (isGenerating) return;
        const filePayloads = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result.toString().split(',')[1] });
            reader.onerror = err => reject(err);
            reader.readAsDataURL(file);
        })));
        onStartTask({ prompt, files: filePayloads, urls: urls.filter(u => u.trim()), useSearch });
    };
    
    const currentStepIndexProgress = workflowSteps.findIndex(step => step.status === 'in-progress');
    const overallProgress = (workflowSteps.filter(s => s.status === 'completed').length / workflowSteps.length) * 100;
    
    const isDemoActive = executionState !== 'idle';
    
    const renderPromptForm = () => (
        <div className="space-y-2 overflow-y-auto pr-2">
            <label htmlFor="kicad-prompt-input" className="block text-sm font-medium text-gray-300">Design Prompt & Configuration</label>
            <textarea id="kicad-prompt-input" name="kicad-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the PCB you want to create..." className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 resize-y" rows="6" />
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reference Files & URLs</label>
                <div className="p-2 border-2 border-gray-600 border-dashed rounded-lg bg-gray-900/50">
                    <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp" />
                    <button onClick={() => document.getElementById('file-upload').click()} className="text-sm text-sky-400 hover:underline w-full text-center p-2">Attach Files...</button>
                    {files.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{files.map((f, i) => <div key={i} className="flex items-center gap-1 bg-gray-700 text-xs px-1.5 py-0.5 rounded-full"><span>{f.name}</span><button onClick={() => removeFile(f)}><XCircleIcon className="w-3 h-3 text-red-400"/></button></div>)}</div>}
                    {urls.map((url, index) => <div key={index} className="flex items-center gap-2 mt-1"><LinkIcon className="w-4 h-4 text-gray-500"/><input id={'url-input-' + index} name={'url-input-' + index} type="url" value={url} onChange={e => handleUrlChange(index, e.target.value)} placeholder="https://example.com/datasheet.pdf" className="w-full bg-gray-800 border-gray-600 rounded p-1 text-sm"/>{urls.length > 1 && <button onClick={() => removeUrl(index)}><XCircleIcon className="w-4 h-4 text-red-400"/></button>}</div>)}
                </div>
            </div>
            <div className="flex items-center gap-2 pt-1"><input type="checkbox" id="use-search" checked={useSearch} onChange={e => setUseSearch(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600"/><label htmlFor="use-search" className="text-sm text-gray-300">Enable Web Search for LLM Agent</label></div>
        </div>
    );
    
    const renderExecutionView = (executionProps) => (
        <div className="flex-grow flex flex-col min-h-0">
           {renderWorkflowTracker()}
           <h4 className="font-semibold text-gray-300 text-sm mt-3 mb-1">Execution Log</h4>
           <div ref={scrollContainerRef} className="flex-grow bg-black/20 rounded p-2 min-h-[50px] overflow-y-auto">
               {kicadLog.length > 0 ? kicadLog.map((log, i) => <div key={i} className={\`py-0.5 text-xs border-b border-slate-800 \${log.includes('ERROR') ? 'text-red-400' : 'text-slate-300'} break-words whitespace-pre-wrap\`}>{log}</div>) : <p className="text-slate-500 text-sm">Waiting for logs...</p>}
           </div>
           {executionProps.currentArtifact && <div className="mt-2 p-2 bg-black/20 rounded"><h4 className="font-semibold text-sm text-gray-300">{executionProps.currentArtifact.title}</h4><div className="mt-1 bg-gray-700 p-2 rounded-lg"><object type="image/svg+xml" data={executionProps.currentArtifact.svgPath || executionProps.currentArtifact.path} className="w-full h-auto" /></div></div>}
        </div>
    );
    
    const renderWorkflowTracker = () => {
        const activeStep = workflowSteps[currentStepIndexProgress];
        const completedSubtasks = activeStep?.subtasks.filter(st => st.status === 'completed').length || 0;
        const totalSubtasks = activeStep?.subtasks.length || 0;
        const subProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

        return (
        <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-sky-300">Overall Progress</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5"><div className="bg-sky-500 h-2.5 rounded-full transition-all duration-500" style={{width: \`\${overallProgress}%\`}}></div></div>
            <div className="space-y-1.5 pl-1">
                {workflowSteps.map((step, index) => {
                    let statusIcon = '⚪'; let textColor = 'text-gray-500';
                    if (step.status === 'in-progress') { statusIcon = '⏳'; textColor = 'text-yellow-300 animate-pulse'; }
                    if (step.status === 'completed') { statusIcon = '✅'; textColor = 'text-green-400'; }

                    return (
                        <div key={index}>
                            <div className={\`flex items-center gap-2 text-sm \${textColor}\`}><span>{statusIcon}</span><span>{step.name}</span></div>
                            {step.status === 'in-progress' && totalSubtasks > 0 && (
                                <div className="ml-5 mt-1 pl-2 border-l-2 border-yellow-500/50">
                                    <div className="text-xs text-yellow-200 mb-1">{completedSubtasks} / {totalSubtasks} items completed</div>
                                    <div className="w-full bg-gray-600 rounded-full h-1.5 mb-2"><div className="bg-yellow-400 h-1.5 rounded-full transition-all" style={{width: \`\${subProgress}%\`}}></div></div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )};
    
    const renderContent = () => {
        if (currentLayoutData) {
            const layoutProps = {
                graph: currentLayoutData,
                layoutStrategy: currentLayoutData.layoutStrategy || 'agent',
                mode: 'pcb',
                isLayoutInteractive: isLayoutInteractive,
                onCommit: onCommitLayout,
                getTool: getTool,
            };
            return (
                <div className="flex-grow flex flex-col min-h-0">
                   {renderWorkflowTracker()}
                   <div className="flex-grow mt-2 relative min-h-[400px]"> 
                       <UIToolRunner tool={getTool('Interactive PCB Layout Tool')} props={layoutProps} />
                   </div>
                </div>
            );
        }
        if (isDemoActive) {
            const demoProps = {
                workflow: demoWorkflow,
                executionState: executionState,
                currentStepIndex: currentStepIndex,
                demoStepStatuses: demoStepStatuses,
                onPlayPause: onPlayPause,
                onStop: onStopDemo,
                onStepForward: onStepForward,
                onStepBackward: onStepBackward,
                onRunFromStep: onRunFromStep,
            };
            return <UIToolRunner tool={getTool('Interactive Demo Workflow Controller')} props={demoProps} />;
        }
        if (isGenerating) return renderExecutionView({ currentArtifact });
        return renderPromptForm();
    };

    return (
        <div className="bg-gray-800/80 border-2 border-sky-500/60 rounded-xl p-4 shadow-lg flex flex-col h-full">
            <h3 className="text-lg font-bold text-sky-300 mb-3 text-center">KiCad EDA Panel</h3>
            <div className="flex-grow flex flex-col min-h-0">
                {renderContent()}
            </div>
             { !currentLayoutData &&
                <div className="mt-4 pt-4 border-t border-sky-700/50 space-y-2">
                    <div className="flex items-center justify-center space-x-4 mb-2">
                        <div className="flex items-center">
                            <input type="checkbox" id="generate-svg" checked={generateSvg} onChange={e => setGenerateSvg(e.target.checked)} disabled={isGenerating} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600" />
                            <label htmlFor="generate-svg" className="ml-2 text-sm text-gray-300">Generate SVGs</label>
                        </div>
                         <div className="flex items-center">
                            <input type="checkbox" id="generate-glb" checked={generateGlb} onChange={e => setGenerateGlb(e.target.checked)} disabled={isGenerating} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600" />
                            <label htmlFor="generate-glb" className="ml-2 text-sm text-gray-300">Generate 3D Models</label>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={onStartDemo} disabled={isGenerating} className="w-full bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                           Run Simulation
                        </button>
                        <button onClick={handleStartLLM} disabled={isGenerating} className="w-full bg-indigo-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                           Run LLM Agent
                        </button>
                    </div>
                    {isDemoActive &&
                        <button onClick={onStopDemo} className="w-full bg-red-800/80 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-red-700/80 text-sm">
                            Stop Simulation
                        </button>
                    }
                </div>
            }
        </div>
    );
`};

const KICAD_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install KiCad Engineering Suite',
    description: 'Installs the complete KiCad suite. This one-time action creates all required client-side tools for PCB design simulation. This MUST be called before any other KiCad tool.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To fully bootstrap the agent's hardware engineering capabilities by installing all necessary tool definitions for the client-side simulation.",
    parameters: [],
    implementationCode: `
        // --- Step 1: Write the Python scripts to the server ---
        const scriptsToWrite = [
            { name: 'kicad_cli.py', content: ${JSON.stringify(KICAD_CLI_MAIN_SCRIPT)} },
            { name: 'kicad_cli_commands.py', content: ${JSON.stringify(KICAD_CLI_COMMANDS_SCRIPT)} },
            { name: 'kicad_dsn_utils.py', content: ${JSON.stringify(KICAD_DSN_UTILS_SCRIPT)} },
            { name: 'kicad_ses_utils.py', content: ${JSON.stringify(KICAD_SES_UTILS_SCRIPT)} },
        ];
        
        console.log(\`[INFO] Writing \${scriptsToWrite.length} KiCad Python scripts to the server...\`);
        if (runtime.isServerConnected()) {
            for (const script of scriptsToWrite) {
                try {
                    await runtime.tools.run('Server File Writer', { filePath: script.name, content: script.content });
                } catch (e) {
                    // If writing fails, we can't proceed with creating server tools.
                    throw new Error(\`Failed to write script '\${script.name}' to server: \${e.message}\`);
                }
            }
            console.log('[INFO] KiCad Python scripts written successfully.');
        } else {
             console.log('[INFO] Server not connected. Skipping Python script creation. KiCad tools will be simulated.');
        }

        // --- Step 2: Create the tool definitions ---
        const toolPayloads = [
            ...${JSON.stringify(KICAD_TOOL_DEFINITIONS)},
            ${JSON.stringify(KICAD_UI_PANEL_TOOL)}
        ];

        console.log(\`[INFO] Creating \${toolPayloads.length} KiCad tools...\`);
        for (const payload of toolPayloads) {
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                console.warn(\`[WARN] Tool '\${payload.name}' might already exist. Skipping. Error: \${e.message}\`);
            }
        }
        
        if (runtime.isServerConnected()) {
            try {
                const { count } = await runtime.forceRefreshServerTools();
                console.log(\`[INFO] Client state synchronized with server. \${count} server tools loaded.\`);
            } catch (e) {
                console.error('[ERROR] Failed to force-refresh server tools after installation:', e);
            }
        }
        
        return { success: true, message: 'KiCad Engineering Suite and all associated tools installed successfully.' };
    `
};

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    KICAD_INSTALLER_TOOL,
];