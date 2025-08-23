
// bootstrap/kicad_tools.ts

import type { ToolCreatorPayload } from '../types';
import { KICAD_SERVICE_SCRIPT } from './kicad_service';
import { KICAD_SERVICE_COMMANDS_SCRIPT } from './kicad_service_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';

const KICAD_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    // --- Service Management ---
    {
        name: 'Start KiCad Service',
        description: 'Starts the long-running Python service for KiCad automation. This MUST be called before any other KiCad command to ensure high performance by avoiding repeated library loading.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To initialize the high-performance KiCad automation engine, which is a prerequisite for all subsequent hardware design tasks.",
        parameters: [],
        implementationCode: '# This is a special server-side command handled by the Node.js backend to spawn the Python service.'
    },
    {
        name: 'Stop KiCad Service',
        description: 'Stops the long-running Python service for KiCad automation, freeing up system resources.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To cleanly shut down the KiCad automation engine when it's no longer needed.",
        parameters: [],
        implementationCode: '# This is a special server-side command handled by the Node.js backend to terminate the Python service.'
    },
    // --- Tool Definitions using proxy ---
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
            { name: 'side', type: 'string', description: "The initial side of the board for the component ('top' or 'bottom'). Defaults to 'top'.", required: false },
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
        description: 'Updates the positions of components on the .kicad_pcb file after arrangement and automatically calculates a new board outline to tightly fit the placed components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To commit the refined component layout from the arrangement stage back to the KiCad board file and create the final, optimized board outline for manufacturing.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y, rotation, side} coordinates. Example: '{"U1": {"x": 10, "y": 15, "rotation": 90, "side": "top"}, "R1": {"x": 25, "y": 15, "rotation": 0, "side": "bottom"}}'.`, required: true },
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

const OVERALL_PROGRESS_TOOL: ToolCreatorPayload = {
    name: 'Overall Progress',
    description: 'A UI panel that displays the agent\'s progress through the KiCad workflow and shows a detailed log of events.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the user with a clear, real-time view of the agent\'s progress and actions during the PCB design process.',
    parameters: [
        { name: 'workflowSteps', type: 'array', description: 'List of workflow steps and their status.', required: true },
        { name: 'kicadLog', type: 'array', description: 'Log messages from the KiCad workflow.', required: true },
    ],
    implementationCode: `
        const logScrollRef = React.useRef(null);
    
        React.useEffect(() => {
            if (logScrollRef.current) {
                logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
            }
        }, [kicadLog]);

        const currentStepIndexProgress = workflowSteps.findIndex(step => step.status === 'in-progress');
        const activeStep = workflowSteps[currentStepIndexProgress];
        
        return (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-3 flex flex-col h-full text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Overall Progress</h3>
                
                <div className="flex-shrink-0 space-y-1 pl-1 max-h-48 overflow-y-auto pr-1 mb-2">
                    {workflowSteps.map((step, index) => {
                        let statusIcon = '⚪'; let textColor = 'text-gray-500'; let iconColor = '';
                        if (step.status === 'in-progress') { statusIcon = '●'; textColor = 'text-yellow-300'; iconColor = 'text-yellow-400'; }
                        if (step.status === 'completed') { statusIcon = '●'; textColor = 'text-green-400'; iconColor = 'text-green-500'; }

                        return (
                            <div key={index} className={\`flex items-center gap-2 text-sm \${textColor}\`}>
                                <span className={iconColor}>{statusIcon}</span>
                                <span>{step.name}</span>
                            </div>
                        )
                    })}
                </div>

                <div ref={logScrollRef} className="flex-grow bg-black/30 rounded p-2 overflow-y-auto min-h-0">
                   {kicadLog.length > 0 ? kicadLog.map((log, i) => <div key={i} className={\`py-0.5 text-xs border-b border-slate-800/50 \${log.includes('ERROR') ? 'text-red-400' : 'text-slate-300'} break-words whitespace-pre-wrap font-mono\`}>{log}</div>) : <p className="text-slate-500 text-sm">Waiting for logs...</p>}
               </div>
            </div>
        );
    `
};

const KICAD_DESIGN_PANEL_TOOL: ToolCreatorPayload = {
    name: 'KiCad Design Automation Panel',
    description: 'The main UI for the KiCad workflow, orchestrating all sub-panels for layout, heuristics, and progress monitoring.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly, all-in-one interface for the complex hardware generation workflow, managed by an AI swarm.',
    parameters: [
        { name: 'onStartScript', type: 'object', description: 'Function to start the local simulation.', required: true },
        { name: 'kicadLog', type: 'array', description: 'Log messages from the KiCad workflow.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Flag indicating if the LLM agent is running.', required: true },
        { name: 'scriptExecutionState', type: 'string', description: 'The current state of the script execution engine.', required: true },
        { name: 'isLayoutPending', type: 'boolean', description: 'Flag indicating if the layout is paused for user interaction.', required: true },
        { name: 'workflowSteps', type: 'array', description: 'List of workflow steps and their status.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        { name: 'generateSvg', type: 'boolean', description: 'Whether to generate SVG footprints during the script run.', required: true },
        { name: 'setGenerateSvg', type: 'object', description: 'Function to toggle SVG generation.', required: true },
        { name: 'generateGlb', type: 'boolean', description: 'Whether to generate 3D GLB models during the script run.', required: true },
        { name: 'setGenerateGlb', type: 'object', description: 'Function to toggle GLB generation.', required: true },
        { name: 'workflowScripts', type: 'array', description: 'An array of available saved scripts.', required: true },
        { name: 'currentLayoutData', type: 'object', description: 'Graph data for the interactive layout tool.', required: true },
        { name: 'layoutHeuristics', type: 'object', description: 'Current heuristics for the layout simulation.', required: false },
        { name: 'setLayoutHeuristics', type: 'object', description: 'Function to update the layout heuristics.', required: false },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
        { name: 'onCommitLayout', type: 'object', description: 'Callback function to commit the final layout.', required: true },
        { name: 'onUpdateLayout', type: 'object', description: 'Callback function to update the layout data (e.g., rules).', required: true },
        { name: 'isServerConnected', type: 'boolean', description: 'Flag indicating if the server is connected.', required: true },
        { name: 'visibility', type: 'object', description: 'An object with boolean flags for different layers.', required: true },
    ],
    implementationCode: `
        const [selectedScript, setSelectedScript] = React.useState(workflowScripts.length > 0 ? workflowScripts[0].workflow : []);
        const [selectedInspectorId, setSelectedInspectorId] = React.useState(null);

        const handleScriptSelect = (e) => {
            const scriptName = e.target.value;
            const script = workflowScripts.find(s => s.name === scriptName);
            if (script) {
                setSelectedScript(script.workflow);
            }
        };

        const handleRunScript = () => {
            if (selectedScript.length > 0) {
                const selectedScriptName = workflowScripts.find(s => s.workflow === selectedScript)?.name || 'Untitled Script';
                onStartScript(selectedScript, selectedScriptName);
            }
        };

        const isGenerating = isSwarmRunning || scriptExecutionState !== 'idle' || isLayoutPending;

        let statusText = 'Idle';
        if (isSwarmRunning) statusText = 'LLM Task Running...';
        else if (scriptExecutionState !== 'idle') statusText = 'Script Running...';
        else if (isLayoutPending) statusText = 'Layout Pending Commit...';

        const layoutProps = {
            graph: currentLayoutData,
            layoutStrategy: currentLayoutData?.layoutStrategy || 'agent',
            mode: 'pcb',
            isLayoutInteractive: isLayoutInteractive,
            onCommit: onCommitLayout,
            onUpdateLayout: onUpdateLayout,
            getTool: getTool,
            heuristics: layoutHeuristics,
            isServerConnected: isServerConnected,
            visibility: visibility,
        };
        
        const rulesProps = {
            rules: currentLayoutData?.rules || [],
            onUpdateRules: (newRules) => onUpdateLayout(prev => ({ ...prev, rules: newRules })),
        };
        
        const heuristicsProps = {
            params: layoutHeuristics,
            setParams: setLayoutHeuristics,
            selectedAgent: null, // This can be expanded later
            updateAgent: () => {},
        };
        
        const progressProps = {
            workflowSteps: workflowSteps,
            kicadLog: kicadLog,
        };

        const selectedNode = React.useMemo(() => {
            if (!selectedInspectorId || !currentLayoutData?.nodes) return null;
            return currentLayoutData.nodes.find(n => n.id === selectedInspectorId);
        }, [selectedInspectorId, currentLayoutData?.nodes]);

        const inspectorProps = {
            graph: currentLayoutData,
            debugInfo: {},
            selectedId: selectedInspectorId,
            selectedNode: selectedNode,
            onSelect: setSelectedInspectorId,
            onHover: () => {},
        };

        return (
            <div className="h-full w-full flex flex-col gap-2">
                <div className="flex-shrink-0 flex items-center justify-center gap-6 p-1 bg-gray-900/40 rounded-md">
                    <div className="flex items-center">
                        <input type="checkbox" id="generate-svg" checked={generateSvg} onChange={e => setGenerateSvg(e.target.checked)} disabled={isGenerating} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-500 focus:ring-indigo-600" />
                        <label htmlFor="generate-svg" className="ml-2 text-sm text-gray-300">Generate SVGs</label>
                    </div>
                    <div className="flex items-center">
                        <input type="checkbox" id="generate-glb" checked={generateGlb} onChange={e => setGenerateGlb(e.target.checked)} disabled={isGenerating} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-500 focus:ring-indigo-600" />
                        <label htmlFor="generate-glb" className="ml-2 text-sm text-gray-300">Generate 3D Models</label>
                    </div>
                </div>

                <div className="flex-grow grid grid-cols-1 lg:grid-cols-10 gap-4 min-h-0">
                    <div className="lg:col-span-3 h-full flex flex-col gap-4 min-h-0">
                        <div className="flex-1 min-h-0">
                            <UIToolRunner tool={getTool('Layout Rules')} props={rulesProps} />
                        </div>
                        <div className="flex-1 min-h-0">
                           <UIToolRunner tool={getTool('Layout Heuristics')} props={heuristicsProps} />
                        </div>
                    </div>
                    
                    <div className="lg:col-span-4 h-full flex flex-col gap-4 min-h-0">
                       <div className="max-h-[35%] flex flex-col min-h-0">
                           <UIToolRunner tool={getTool('Inspector')} props={inspectorProps} />
                       </div>
                       <div className="flex-grow min-h-0">
                           <UIToolRunner tool={getTool('Interactive PCB Layout Tool')} props={layoutProps} />
                       </div>
                        <div className="flex-shrink-0 mt-2 bg-gray-900/50 border border-gray-700 rounded-xl p-3 space-y-3">
                            <h4 className="text-base font-bold text-cyan-300">Run Saved Script</h4>
                            <div className="flex gap-2 items-center">
                                <select
                                    onChange={handleScriptSelect}
                                    defaultValue={workflowScripts.length > 0 ? workflowScripts[0].name : ''}
                                    className="flex-grow bg-gray-800 border border-gray-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-cyan-500"
                                    disabled={isGenerating}
                                    aria-label="Select a saved script"
                                >
                                    {(workflowScripts || []).map(script => <option key={script.name} value={script.name}>{script.name}</option>)}
                                </select>
                                <button 
                                    onClick={handleRunScript}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-4 rounded-lg shadow-lg transition-colors disabled:bg-cyan-900/50 disabled:cursor-not-allowed disabled:text-gray-400"
                                >
                                    Run Script
                                </button>
                            </div>
                            {isGenerating && (
                                <div className="text-center text-yellow-300 text-sm flex items-center justify-center gap-2 pt-2">
                                    <svg className="animate-spin h-4 w-4 text-yellow-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Agent Busy: {statusText}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-3 h-full flex flex-col gap-4 min-h-0">
                        <div className="flex-grow min-h-0">
                            <UIToolRunner tool={getTool('Overall Progress')} props={progressProps} />
                        </div>
                    </div>
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
        
        console.log(\`[INFO] Writing \${scriptsToWrite.length} KiCad Python service scripts to the server...\`);
        if (runtime.isServerConnected()) {
            for (const script of scriptsToWrite) {
                try {
                    await runtime.tools.run('Server File Writer', { filePath: script.name, content: script.content });
                } catch (e) {
                    throw new Error(\`Failed to write script '\${script.name}' to server: \${e.message}\`);
                }
            }
            console.log('[INFO] KiCad Python service scripts written successfully.');
        } else {
             console.log('[INFO] Server not connected. Skipping Python script creation. KiCad tools will be simulated.');
        }

        // --- Step 2: Create the tool definitions ---
        const toolPayloads = [
            ...${JSON.stringify(KICAD_TOOL_DEFINITIONS)},
            ${JSON.stringify(KICAD_DESIGN_PANEL_TOOL)},
            ${JSON.stringify(OVERALL_PROGRESS_TOOL)}
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
