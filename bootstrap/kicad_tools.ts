// bootstrap/kicad_tools.ts

import type { ToolCreatorPayload } from '../types';
import { KICAD_SERVICE_SCRIPT } from './kicad_service';
import { KICAD_SERVICE_COMMANDS_SCRIPT } from './kicad_service_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';

const KICAD_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    // --- Service Management tools have been removed and replaced by generic MCP tools ---
    // --- Tool Definitions using proxy ---
    {
        name: 'Capture Screen Region',
        description: 'Captures a specified region of the primary screen and returns it as a base64 encoded JPEG image.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To provide a "virtual camera" for an agent to perceive the state of a GUI, game, or any other visual application running on the server.',
        parameters: [
            { name: 'x', type: 'number', description: 'The x-coordinate of the top-left corner of the capture region.', required: true },
            { name: 'y', type: 'number', description: 'The y-coordinate of the top-left corner of the capture region.', required: true },
            { name: 'width', type: 'number', description: 'The width of the capture region.', required: true },
            { name: 'height', type: 'number', description: 'The height of the capture region.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::capture_screen_region',
    },
    {
        name: 'Add Absolute Position Constraint',
        description: 'Fixes an electronic component to an absolute coordinate on the PCB along one or both axes. For example, you can lock a component to y=9, allowing its x-position to be determined by other forces like symmetry. Essential for connectors or parts with fixed mechanical constraints.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To lock critical components to a specific physical location on the board, ensuring mechanical alignment with an enclosure or other hardware, which is a key step in designing a manufacturable product.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentReference', type: 'string', description: 'The reference designator of the component to fix (e.g., "U1").', required: true },
            { name: 'x', type: 'number', description: 'Optional: The X coordinate in millimeters to lock the component to.', required: false },
            { name: 'y', type: 'number', description: 'Optional: The Y coordinate in millimeters to lock the component to.', required: false },
        ],
        implementationCode: 'kicad_service_proxy::add_absolute_position_constraint'
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
        implementationCode: 'kicad_service_proxy::add_proximity_constraint'
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
        implementationCode: 'kicad_service_proxy::add_alignment_constraint'
    },
     {
        name: 'Add Symmetry Constraint',
        description: 'Adds a design rule that components in specified pairs should be placed symmetrically across a central axis on the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To ensure balanced electrical and thermal layouts for sensitive circuits, such as an analog amplifiers or differential pairs, which is critical for the performance and reliability of the electronic device.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'axis', type: 'string', description: 'The axis of symmetry: "vertical" or "horizontal".', required: true },
            { name: 'pairsJSON', type: 'string', description: 'A JSON string of an array of pairs. Each pair is an array of two component references. E.g., \'[["C1", "C2"], ["R1", "R2"]]\'.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::add_symmetry_constraint'
    },
    {
        name: 'Add Circular Constraint',
        description: 'Adds a design rule to arrange a set of electronic components in a circular pattern around a center point on the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To create specialized PCB layouts for circular devices, such as an LED rings, rotary encoders, or circular sensor arrays, enabling unique hardware form factors.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to arrange in a circle.', required: true },
            { name: 'radius', type: 'number', description: 'The radius of the circle in millimeters.', required: true },
            { name: 'centerX', type: 'number', description: 'The X coordinate of the circle\'s center in millimeters.', required: true },
            { name: 'centerY', type: 'number', description: 'The Y coordinate of the circle\'s center in millimeters.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::add_circular_constraint'
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
        implementationCode: 'kicad_service_proxy::add_layer_constraint'
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
        implementationCode: 'kicad_service_proxy::add_fixed_property_constraint'
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
        implementationCode: 'kicad_service_proxy::add_symmetrical_pair_constraint'
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
            { name: 'pinConnections', type: 'string', description: "Optional: A JSON string of an array of objects mapping pin numbers to net names for validation. E.g., '[{\"pin\": 1, \"net\": \"VCC\"}, {\"pin\": 2, \"net\": \"GND\"}]'.", required: false },
            { name: 'side', type: 'string', description: "The initial side of the board for the component ('top' or 'bottom'). Defaults to 'top'.", required: false },
            { name: 'metaphysicalPropertiesJSON', type: 'string', description: "Optional: A JSON string describing the component's lore properties (e.g., '{\"Essence_Type\": \"Perception\", \"Aetheric_Affinity\": \"Psionic\"}').", required: false },
            { name: 'exportSVG', type: 'boolean', description: "Generate an SVG footprint of the component. (Used for demo visualization)", required: false },
            { name: 'exportGLB', type: 'boolean', description: "Generate a 3D GLB model of the component. (Used for demo visualization)", required: false }
        ],
        implementationCode: 'kicad_service_proxy::define_component'
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
            { name: 'ritualDescription', type: 'string', description: "Optional: A lore-friendly description of the magical act of creating this connection.", required: false },
        ],
        implementationCode: 'kicad_service_proxy::define_net'
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
        implementationCode: 'kicad_service_proxy::generate_netlist'
    },
    {
        name: 'Create Initial PCB',
        description: 'Creates a blank .kicad_pcb file and imports the generated netlist, placing all component footprints at the origin, ready for arrangement. Creates a 4-layer board by default.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To create the physical board file and load all the component footprints into it, officially starting the physical design phase of the hardware project.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'kicad_service_proxy::create_initial_pcb'
    },
    {
        name: 'Create Board Outline',
        description: 'Defines the physical shape and size of the PCB. Can be a fixed-size rectangle/circle, or a dynamic rectangle that auto-sizes to fit component placement.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To define the physical dimensions and shape of the final printed circuit board, a critical step for mechanical fitting and manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'shape', type: 'string', description: "The shape of the board outline. Can be 'rectangle' or 'circle'. Defaults to 'rectangle'.", required: false },
            { name: 'boardWidthMillimeters', type: 'number', description: "For 'rectangle' shape, the desired width in mm. Omit or set to 0 for dynamic auto-sizing based on component placement.", required: false },
            { name: 'boardHeightMillimeters', type: 'number', description: "For 'rectangle' shape, the desired height in mm. Omit or set to 0 for dynamic auto-sizing.", required: false },
            { name: 'diameterMillimeters', type: 'number', description: "For 'circle' shape, the desired diameter in mm. If omitted, it will auto-size to fit components.", required: false },
        ],
        implementationCode: 'kicad_service_proxy::create_board_outline'
    },
    {
        name: 'Create Copper Pour',
        description: 'Creates a copper pour (zone) connected to a specified net on a specified layer. The zone will fill the entire board outline.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To create large copper areas, typically for ground (GND) or power planes, which improves signal integrity, provides shielding, and simplifies routing for the autorouter.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'layerName', type: 'string', description: 'The name of the copper layer to create the pour on (e.g., "F.Cu", "In1.Cu", "B.Cu").', required: true },
            { name: 'netName', type: 'string', description: 'The name of the net to connect the pour to (e.g., "GND", "VCC").', required: true },
        ],
        implementationCode: 'kicad_service_proxy::create_copper_pour'
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
        implementationCode: 'kicad_service_proxy::arrange_components'
    },
    {
        name: 'Update KiCad Component Positions',
        description: 'Updates the positions of components on the .kicad_pcb file and automatically calculates a new board outline to tightly fit the placed components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To commit the refined component layout from the arrangement stage back to the KiCad board file and create the final, optimized board outline for manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y, rotation, side} coordinates. Example: '{"U1": {"x": 10, "y": 15, "rotation": 90, "side": "top"}, "R1": {"x": 25, "y": 15, "rotation": 0, "side": "bottom"}}'.`, required: true },
            { name: 'boardPadding', type: 'number', description: 'Optional margin in mm to add around components when auto-sizing the board outline.', required: false },
        ],
        implementationCode: 'kicad_service_proxy::update_component_positions'
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
        implementationCode: 'kicad_service_proxy::autoroute_pcb'
    },
    {
        name: 'Export Fabrication Files',
        description: 'Generates all necessary manufacturing outputs (Gerbers, drill files, 3D model) and packages them into a zip file, ready for a PCB fabrication house.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To produce the final, complete manufacturing dataset required by a factory to produce the physical electronic device, marking the successful culmination of the hardware design process.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'kicad_service_proxy::export_fabrication_files'
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

const WORKFLOW_STAGES_TOOL: ToolCreatorPayload = {
    name: 'Workflow Stages',
    description: 'A UI panel that displays the agent\'s progress through the KiCad workflow stages.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the user with a clear, high-level, interactive view of the agent\'s progress and actions during the PCB design process.',
    parameters: [
        { name: 'workflowSteps', type: 'array', description: 'List of workflow stages and their status.', required: true },
    ],
    implementationCode: `
        return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 text-white">
                <h3 className="text-lg font-bold text-indigo-300 mb-3">Project Workflow</h3>
                <div className="space-y-4">
                    {workflowSteps.map((step, index) => {
                        const isCompleted = step.status === 'completed';
                        const isInProgress = step.status === 'in-progress';
                        
                        let statusColor = 'border-gray-600';
                        if (isInProgress) statusColor = 'border-indigo-500';
                        if (isCompleted) statusColor = 'border-green-500';

                        return (
                            <div key={index} className={"p-3 rounded-lg bg-gray-900/50 border-l-4 " + statusColor}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-gray-400 text-sm">STAGE {index + 1}: {step.role}</p>
                                        <h4 className="font-bold text-white text-base">{step.name}</h4>
                                        <p className="text-xs text-gray-400">{step.description}</p>
                                    </div>
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700">
                                        {isCompleted && <span className="text-green-400 text-xl">✓</span>}
                                        {isInProgress && <div className="w-4 h-4 rounded-full bg-indigo-500 animate-pulse"></div>}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    `
};

const LEAD_ENGINEER_WORKBENCH_TOOL: ToolCreatorPayload = {
    name: 'Lead Engineer Workbench',
    description: 'The main UI for the KiCad workflow, orchestrating all sub-panels for layout, heuristics, and progress monitoring, following a human-in-the-loop Holacracy model.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly, all-in-one interface for the complex hardware generation workflow, managed by an AI swarm and directed by a human Lead Engineer.',
    parameters: [
        // Core State & Setters
        { name: 'userInput', type: 'string', description: 'Current value of the input.', required: true },
        { name: 'setUserInput', type: 'object', description: 'Function to update the input value.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Flag indicating if the agent is running.', required: true },
        { name: 'workflowSteps', type: 'array', description: 'List of workflow stages and their status.', required: true },
        { name: 'currentLayoutData', type: 'object', description: 'Graph data for the interactive layout tool.', required: true },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag for interactive layout mode.', required: true },
        { name: 'layoutHeuristics', type: 'object', description: 'Current heuristics for the layout simulation.', required: false },
        { name: 'visibility', type: 'object', description: 'Visibility flags for different layers.', required: true },
        { name: 'isServerConnected', type: 'boolean', description: 'Flag for server connection status.', required: true },
        { name: 'isAutonomousMode', type: 'boolean', description: 'Flag indicating if the agent is in autonomous mode.', required: true },
        { name: 'demoScripts', type: 'array', description: 'Array of available demo workflow scripts.', required: true },
        { name: 'currentUserTask', type: 'object', description: 'The current high-level task object for the agent.', required: true },
        
        // Callbacks & Handlers
        { name: 'onStartTask', type: 'object', description: 'Function to start the main design task.', required: true },
        { name: 'onCommitLayout', type: 'object', description: 'Callback to commit the final layout.', required: true },
        { name: 'onUpdateLayout', type: 'object', description: 'Callback to update layout data.', required: true },
        { name: 'setLayoutHeuristics', type: 'object', description: 'Function to update layout heuristics.', required: true },
        { name: 'setVisibility', type: 'object', description: 'Function to update layer visibility.', required: true },
        { name: 'setIsAutonomousMode', type: 'object', description: 'Function to set the autonomous mode.', required: true },
        
        // Agent Dependencies
        { name: 'startSwarmTask', type: 'object', description: 'Function to start an agent task.', required: true },
        { name: 'allTools', type: 'array', description: 'List of all available tools.', required: true },
        { name: 'getKicadSystemPrompt', type: 'object', description: 'Function to get the system prompt.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        
        // Scripted Workflow Props
        { name: 'scriptExecutionState', type: 'string', description: 'The current state of the script execution engine.', required: true },
        { name: 'currentScriptStepIndex', type: 'number', description: 'The index of the currently executing script step.', required: true },
        { name: 'stepStatuses', type: 'array', description: 'An array tracking the status of each script step.', required: true },
        { name: 'onPlayPause', type: 'object', description: 'Callback to play or pause script execution.', required: true },
        { name: 'onStop', type: 'object', description: 'Callback to stop script execution.', required: true },
        { name: 'onStepForward', type: 'object', description: 'Callback to execute the next step.', required: true },
        { name: 'onStepBackward', type: 'object', description: 'Callback to move the execution pointer back one step.', required: true },
        { name: 'onRunFromStep', type: 'object', description: 'Callback to start execution from a specific step.', required: true },
    ],
    implementationCode: `
        const [selectedInspectorId, setSelectedInspectorId] = React.useState(null);
        const [selectedScript, setSelectedScript] = React.useState('');
        
        const handleSubmit = () => {
            if (!userInput.trim()) return;
            onStartTask({ prompt: userInput, files: [], urls: [], useSearch: false, isAutonomous: isAutonomousMode }, startSwarmTask, allTools, getKicadSystemPrompt);
        };
        
        const handleRunScript = () => {
            if (!selectedScript) return;
            const scriptToRun = demoScripts.find(s => s.name === selectedScript);
            if (scriptToRun) {
                const projectName = \`proj_\${Date.now()}\`;
                const task = {
                    isScripted: true,
                    script: scriptToRun.workflow,
                    projectName: projectName
                };
                startSwarmTask({ task, systemPrompt: getKicadSystemPrompt(projectName), sequential: true, allTools });
            }
        };
        
        const isExecutingScript = scriptExecutionState !== 'idle' && currentUserTask?.isScripted;
        
        const layoutProps = { graph: currentLayoutData, layoutStrategy: currentLayoutData?.layoutStrategy || 'agent', mode: 'pcb', isLayoutInteractive: isLayoutInteractive, onCommit: onCommitLayout, onUpdateLayout: onUpdateLayout, getTool: getTool, heuristics: layoutHeuristics, isServerConnected: isServerConnected, visibility: visibility };
        const rulesProps = { rules: currentLayoutData?.rules || [], onUpdateRules: (newRules) => onUpdateLayout(prev => ({ ...prev, rules: newRules })) };
        const visibilityProps = { visibility, setVisibility };
        const selectedNode = React.useMemo(() => currentLayoutData?.nodes?.find(n => n.id === selectedInspectorId) || null, [selectedInspectorId, currentLayoutData?.nodes]);
        const inspectorProps = { graph: currentLayoutData, debugInfo: {}, selectedId: selectedInspectorId, selectedNode, onSelect: setSelectedInspectorId, onHover: () => {} };
        const workflowControllerProps = {
            workflow: currentUserTask?.script || [],
            executionState: scriptExecutionState,
            currentStepIndex: currentScriptStepIndex,
            stepStatuses: stepStatuses,
            onPlayPause, onStop, onStepForward, onStepBackward, onRunFromStep
        };

        return (
            <div className="h-full w-full grid grid-cols-12 gap-4">
                <div className="col-span-3 h-full flex flex-col gap-4">
                    {isExecutingScript ? (
                        <UIToolRunner tool={getTool('Interactive Workflow Controller')} props={workflowControllerProps} />
                    ) : (
                        <UIToolRunner tool={getTool('Workflow Stages')} props={{ workflowSteps }} />
                    )}
                </div>
                
                <div className="col-span-6 h-full flex flex-col gap-4">
                    {!isSwarmRunning && (
                         <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
                             <div>
                                <h3 className="text-lg font-bold text-indigo-300 mb-2">1. Process Tension: Design a new PCB</h3>
                                <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="e.g., An 8-channel EEG board based on the ADS131M08..." className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center"><input type="checkbox" id="autonomous-mode" checked={isAutonomousMode} onChange={(e) => setIsAutonomousMode(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-500" /><label htmlFor="autonomous-mode" className="ml-2 text-sm text-gray-300">Autonomous Mode</label></div>
                                    <button onClick={handleSubmit} disabled={!userInput.trim()} className="bg-indigo-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600">Start Task</button>
                                </div>
                            </div>
                            <div className="border-t border-gray-700 pt-3">
                                <h3 className="text-lg font-bold text-purple-300 mb-2">OR: Run a Demo Scenario</h3>
                                <div className="flex gap-2">
                                    <select value={selectedScript} onChange={e => setSelectedScript(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500"><option value="">Select a demo script...</option>{demoScripts.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
                                    <button onClick={handleRunScript} disabled={!selectedScript} className="bg-purple-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-purple-700 disabled:bg-gray-600">Run Script</button>
                                </div>
                            </div>
                         </div>
                    )}
                    <div className="flex-grow min-h-0">
                       <UIToolRunner tool={getTool('Interactive Simulation View')} props={layoutProps} />
                    </div>
                </div>

                <div className="col-span-3 h-full flex flex-col gap-4">
                    <div className="flex-1 min-h-0"><UIToolRunner tool={getTool('Inspector')} props={inspectorProps} /></div>
                    <div className="flex-1 min-h-0"><UIToolRunner tool={getTool('Layout Rules')} props={rulesProps} /></div>
                    <UIToolRunner tool={getTool('Visibility')} props={visibilityProps} />
                </div>
            </div>
        );
    `
};


const KICAD_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install KiCad Engineering Suite',
    description: 'Installs the complete KiCad suite. This one-time action creates all required client-side tools for PCB design simulation. This MUST be called before any other KiCad tool.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To fully bootstrap the agent's hardware engineering capabilities by installing all necessary tool definitions for the client-side simulation.",
    parameters: [],
    implementationCode: `
        // --- Step 1: Write the new Python service scripts to the server ---
        const scriptsToWrite = [
            { name: 'kicad_service.py', content: ${JSON.stringify(KICAD_SERVICE_SCRIPT)} },
            { name: 'kicad_service_commands.py', content: ${JSON.stringify(KICAD_SERVICE_COMMANDS_SCRIPT)} },
            { name: 'kicad_dsn_utils.py', content: ${JSON.stringify(KICAD_DSN_UTILS_SCRIPT)} },
            { name: 'kicad_ses_utils.py', content: ${JSON.stringify(KICAD_SES_UTILS_SCRIPT)} },
        ];
        
        runtime.logEvent(\`[INFO] Writing \${scriptsToWrite.length} KiCad Python service scripts to the server...\`);
        if (runtime.isServerConnected()) {
            for (const script of scriptsToWrite) {
                try {
                    await runtime.tools.run('Server File Writer', { filePath: script.name, content: script.content });
                } catch (e) {
                    runtime.logEvent(\`[WARN] Failed to write script '\${script.name}' to server: \${e.message}\`);
                }
            }
            runtime.logEvent('[INFO] KiCad Python service scripts written successfully.');
        } else {
             runtime.logEvent('[INFO] Server not connected. Skipping Python script creation. KiCad tools will be simulated.');
        }

        // --- Step 2: Create the tool definitions ---
        const toolPayloads = [
            ...${JSON.stringify(KICAD_TOOL_DEFINITIONS)},
            ${JSON.stringify(LEAD_ENGINEER_WORKBENCH_TOOL)},
            ${JSON.stringify(WORKFLOW_STAGES_TOOL)}
        ];

        runtime.logEvent(\`[INFO] Creating \${toolPayloads.length} KiCad tools...\`);
        const allTools = runtime.tools.list();
        const existingToolNames = new Set(allTools.map(t => t.name));

        for (const payload of toolPayloads) {
            if (existingToolNames.has(payload.name)) {
                runtime.logEvent(\`[INFO] Tool '\${payload.name}' already exists. Skipping installation.\`);
                continue;
            }
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to create new tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        if (runtime.isServerConnected()) {
            try {
                const { count } = await runtime.forceRefreshServerTools();
                runtime.logEvent(\`[INFO] Client state synchronized with server. \${count} server tools loaded.\`);
            } catch (e) {
                runtime.logEvent(\`[ERROR] Failed to force-refresh server tools after installation: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'KiCad Engineering Suite and all associated tools installed successfully.' };
    `
};

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    KICAD_INSTALLER_TOOL,
];