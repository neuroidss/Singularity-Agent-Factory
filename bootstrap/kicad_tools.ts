// bootstrap/kicad_tools.ts

import type { ToolCreatorPayload } from '../types';
import { KICAD_CLI_MAIN_SCRIPT } from './kicad_cli_script';
import { KICAD_CLI_COMMANDS_SCRIPT } from './kicad_cli_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';

const KICAD_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Add Absolute Position Constraint',
        description: 'Adds a rule to fix a component to an absolute X, Y coordinate on the PCB, typically used for connectors or fixed mechanical parts.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To lock critical components to a specific location on the board.",
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
        description: 'Adds a rule that certain components should be placed close to each other, e.g., a microcontroller and its decoupling capacitors.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To enforce critical placement for components that have a close electrical relationship, improving signal integrity and performance.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'groupsJSON', type: 'string', description: 'A JSON string of an array of arrays, where each inner array is a group of component references that should be close. E.g., \'[["U1", "C1"], ["U1", "C2"]]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_proximity_constraint'
    },
    {
        name: 'Add Alignment Constraint',
        description: 'Adds a rule to align a group of components along a specified axis (vertical or horizontal).',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To create clean, organized layouts by aligning components like headers or LED arrays.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'axis', type: 'string', description: 'The axis for alignment: "vertical" or "horizontal".', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to align. E.g., \'["J1", "J2", "J3"]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_alignment_constraint'
    },
     {
        name: 'Add Symmetry Constraint',
        description: 'Adds a rule that components in specified pairs should be placed symmetrically across a central axis.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To ensure balanced layouts, especially for analog or differential pair circuits.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'axis', type: 'string', description: 'The axis of symmetry: "vertical" or "horizontal".', required: true },
            { name: 'pairsJSON', type: 'string', description: 'A JSON string of an array of pairs. Each pair is an array of two component references. E.g., \'[["C1", "C2"], ["R1", "R2"]]\'.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_symmetry_constraint'
    },
    {
        name: 'Add Circular Constraint',
        description: 'Adds a rule to arrange a set of components in a circular pattern around a center point.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To create layouts for circular devices, such as LED rings or sensor arrays.",
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
        description: 'Adds a rule to force a set of components to be placed on a specific layer of the PCB.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To control which side of the board components are placed on.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'layer', type: 'string', description: 'The target layer: "top" or "bottom".', required: true },
            { name: 'componentsJSON', type: 'string', description: 'A JSON string of an array of component references to place on the specified layer.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py add_layer_constraint'
    },
    {
        name: 'Define KiCad Component',
        description: 'Defines a single electronic component by its reference, value, and footprint. This must be called for every component before creating a netlist.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To add a component to the project's bill of materials for later inclusion in the netlist.",
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
        description: 'Defines a single electrical net by its name and the component pins it connects. This must be called for every net in the design.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To add a single electrical connection to the project's netlist definition.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'netName', type: 'string', description: "The name of the net (e.g., 'GND', 'VCC', 'DATA0').", required: true },
            { name: 'pins', type: 'array', description: 'An array of component pin strings to connect to this net (e.g., ["U1-1", "R1-2"]).', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py define_net'
    },
    {
        name: 'Generate KiCad Netlist',
        description: 'Generates the final KiCad netlist file from all previously defined components and nets for a project. This should be called after all components and nets have been defined.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To consolidate all defined components and nets into a single, machine-readable netlist file for the PCB layout.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py generate_netlist'
    },
    {
        name: 'Create Initial PCB',
        description: 'Creates a blank .kicad_pcb file and imports the generated netlist, placing all footprints at the origin.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To create the physical board file and load all the component footprints into it.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'python scripts/kicad_cli.py create_initial_pcb'
    },
    {
        name: 'Create Board Outline',
        description: 'Defines the board shape and size on the Edge.Cuts layer. Can be rectangular or circular. If dimensions are omitted, it auto-sizes based on components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To define the physical dimensions and shape of the final printed circuit board.',
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
        description: "Prepares the PCB for interactive or autonomous layout on the client-side. This tool extracts component and net data and sends it to the client's force-directed graph UI.",
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To transition from schematic to physical layout by providing the client UI with all necessary data for an interactive or automated arrangement.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'waitForUserInput', type: 'boolean', description: "Set to 'true' to pause the workflow for interactive manual layout on the client. Set to 'false' to perform an autonomous layout on the client and continue the workflow automatically.", required: true },
            { name: 'layoutStrategy', type: 'string', description: "The layout engine to use: 'agent' for rule-based, 'physics' for Rapier.js simulation. Defaults to 'agent'.", required: false }
        ],
        implementationCode: 'python scripts/kicad_cli.py arrange_components'
    },
    {
        name: 'Update KiCad Component Positions',
        description: 'Updates the positions of components on the PCB after arrangement and automatically calculates and draws a new board outline to fit the placed components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To commit the refined component layout from the interactive UI back to the KiCad board file and create the final board outline.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y, rotation, side} coordinates. Example: '{"U1": {"x": 10, "y": 15, "rotation": 90, "side": "top"}, "R1": {"x": 25, "y": 15, "rotation": 0, "side": "bottom"}}'.`, required: true },
        ],
        implementationCode: 'python scripts/kicad_cli.py update_component_positions'
    },
    {
        name: 'Autoroute PCB',
        description: 'Exports the board to DSN format, runs the FreeRouting autorouter, and imports the resulting routes back into the .kicad_pcb file.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To automatically create the copper traces that connect the components according to the netlist.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'python scripts/kicad_cli.py autoroute_pcb'
    },
    {
        name: 'Export Fabrication Files',
        description: 'Generates all necessary manufacturing outputs (Gerbers, drill files, 3D renders) and packages them into a zip file.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To produce the final, complete set of files required by a manufacturer to produce the physical PCB.',
        parameters: [{ name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true }],
        implementationCode: 'python scripts/kicad_cli.py export_fabrication_files'
    },
    {
        name: 'Update Workflow Checklist',
        description: "A client-side tool for the AI agent to communicate its plan for a specific workflow stage to the UI. The UI then uses this list to render a detailed checklist and progress bar for that stage.",
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide granular, real-time progress updates to the user by showing the agent\'s plan and tracking its completion.',
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
        const toolPayloads = ${JSON.stringify(KICAD_TOOL_DEFINITIONS)};

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

export const KICAD_DESIGN_PROMPT_TEXT = `I need a PCB design for a FreeEEG8-alpha inspired mezzanine board.

Here is the plan:

1.  **Component Definition:**
    *   ADC 'U1': 'ADS131M08', 'Package_QFP:LQFP-32_5x5mm_P0.5mm', 32 pins.
    *   AVDD LDO 'U2': 'LP5907QMFX-3.3Q1', 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   DVDD LDO 'U3': 'LP5907QMFX-3.3Q1', 'Package_TO_SOT_SMD:SOT-23-5', 5 pins.
    *   Oscillator 'X1': '8.192MHz', 'freeeeg8-alpha:Oscillator_SMD_EuroQuartz_XO32-4Pin_3.2x2.5mm_HandSoldering', 4 pins.
    *   Capacitors: 'C1' (220nF), 'C2' (100nF), 'C3' & 'C4' (1uF), all 'Capacitor_SMD:C_0402_1005Metric'.
    *   LDO Caps: 'C5'-'C8' (2.2uF), 'Capacitor_SMD:C_0603_1608Metric'.
    *   XIAO Headers 'J_XIAO_1', 'J_XIAO_2': 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', 7 pins each.
    *   Pogo Pins 'J1'-'J10': 'freeeeg8-alpha:pogo_pin_d5x10mm_smd', 1 pin each.

2.  **Net Definition:**
    *   'AIN0P': ["J1-1", "U1-29"] through 'AIN7P': ["J8-1", "U1-12"].
    *   'AINREF': ["J9-1", "U1-2", "U1-3", "U1-6", "U1-7", "U1-10", "U1-11", "U1-30", "U1-31"].
    *   'GND': ["J10-1", "U1-13", "U1-25", "U1-28", "C1-1", "C2-1", "C3-2", "C4-2", "C5-2", "C6-2", "C7-2", "C8-2", "J_XIAO_2-1", "X1-2"].
    *   'CAP': ["C1-2", "U1-24"].
    *   'REFIN': ["C2-2", "U1-14"].
    *   'AVDD': ["U2-5", "U1-15", "C3-1", "C5-1"].
    *   'DVDD': ["U3-5", "U1-26", "X1-4", "C4-1", "C7-1"].
    *   '5V': ["C6-1", "C8-1", "J_XIAO_2-2"].
    *   XIAO connections: SYNC/RESET, CS, DRDY, SCLK, DOUT, DIN.
    *   'XTAL1/CLKIN': ["U1-23", "X1-1"].

3.  **Layout Rules:**
    *   Create proximity rules to place decoupling capacitors C1-C4 near ADC U1, C5-C6 near LDO U2, and C7-C8 near LDO U3.

4.  **Board Generation:**
    *   Generate netlist, create initial PCB, create a circular 35mm diameter outline, arrange components, autoroute, and export fabrication files.`;

const KICAD_UI_PANEL_TOOL: ToolCreatorPayload = {
    name: 'KiCad Design Automation Panel',
    description: 'The main UI for the KiCad workflow, allowing users to input a request and monitor the agent swarm as it executes the design process.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly, all-in-one interface for the complex hardware generation workflow, managed by an AI swarm.',
    parameters: [
        { name: 'onStartTask', type: 'object', description: 'Function to start the LLM agent task.', required: true },
        { name: 'onStartDemo', type: 'object', description: 'Function to start the local simulation.', required: true },
        { name: 'onResetDemo', type: 'object', description: 'Function to reset the workflow state.', required: true },
        { name: 'kicadLog', type: 'array', description: 'Log messages from the KiCad workflow.', required: true },
        { name: 'isGenerating', type: 'boolean', description: 'Flag indicating if the swarm/simulation is running.', required: true },
        { name: 'workflowSteps', type: 'array', description: 'List of workflow steps and their status.', required: true },
        { name: 'currentArtifact', type: 'object', description: 'The currently displayed artifact (e.g., a schematic or board SVG).', required: false },
        { name: 'demoWorkflow', type: 'array', description: 'The array of tool calls for the demo simulation.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        // New props for integrated layout view
        { name: 'currentLayoutData', type: 'object', description: 'Graph data for the interactive layout tool.', required: false },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
        { name: 'onCommitLayout', type: 'object', description: 'Callback function to commit the final layout.', required: true },
    ],
    implementationCode: `
    const [prompt, setPrompt] = React.useState(\`${KICAD_DESIGN_PROMPT_TEXT.replace(/`/g, '\\`')}\`);
    const [files, setFiles] = React.useState([]);
    const [urls, setUrls] = React.useState(['']);
    const [useSearch, setUseSearch] = React.useState(false);
    const [elapsedTime, setElapsedTime] = React.useState(0);
    const [isDemoRunning, setIsDemoRunning] = React.useState(false);
    
    const scrollContainerRef = React.useRef(null);
    
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [kicadLog]);

    React.useEffect(() => {
        let timer;
        if (isGenerating) {
            if (!isDemoRunning) setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(t => t + 1), 1000);
        } else {
             setElapsedTime(0); // Also reset when stopping
        }
        return () => clearInterval(timer);
    }, [isGenerating, isDemoRunning]);

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
        setIsDemoRunning(false); // Ensure demo mode is off
        const filePayloads = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result.toString().split(',')[1] });
            reader.onerror = err => reject(err);
            reader.readAsDataURL(file);
        })));
        onStartTask({ prompt, files: filePayloads, urls: urls.filter(u => u.trim()), useSearch });
    };

    const handleStartDemoClick = () => {
        if (isGenerating) return;
        setIsDemoRunning(true);
        setElapsedTime(0);
        onStartDemo();
    };

    const handleResetDemoClick = () => {
        setIsDemoRunning(false);
        setElapsedTime(0);
        onResetDemo();
    };
    
    const timeFormatted = new Date(elapsedTime * 1000).toISOString().substr(14, 5);
    const currentStepIndex = workflowSteps.findIndex(step => step.status === 'in-progress');
    const overallProgress = (workflowSteps.filter(s => s.status === 'completed').length / workflowSteps.length) * 100;
    
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
        const activeStep = workflowSteps[currentStepIndex];
        const completedSubtasks = activeStep?.subtasks.filter(st => st.status === 'completed').length || 0;
        const totalSubtasks = activeStep?.subtasks.length || 0;
        const subProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

        return (
        <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-sky-300">Overall Progress</span>
                <span className="font-mono text-gray-300">{timeFormatted}</span>
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
        if (isDemoRunning) {
            return <UIToolRunner tool={getTool('Demo Workflow Viewer')} props={{ workflow: demoWorkflow, kicadLog: kicadLog, elapsedTime: elapsedTime }} />;
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
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={handleStartDemoClick} disabled={isGenerating} className="w-full bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                           Run Local Simulation
                        </button>
                        <button onClick={handleStartLLM} disabled={isGenerating} className="w-full bg-indigo-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                           Run LLM Agent
                        </button>
                    </div>
                    <button onClick={handleResetDemoClick} disabled={isGenerating && !isDemoRunning} className="w-full bg-red-800/80 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-red-700/80 disabled:bg-gray-600/50 disabled:cursor-not-allowed text-sm">
                        Reset Workflow
                    </button>
                </div>
            }
        </div>
    );
`};

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    KICAD_INSTALLER_TOOL,
    KICAD_UI_PANEL_TOOL,
];