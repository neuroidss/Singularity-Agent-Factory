


import type { ToolCreatorPayload } from '../types';
import React from 'react';
import { KICAD_CLI_MAIN_SCRIPT } from './kicad_cli_script';
import { KICAD_CLI_COMMANDS_SCRIPT } from './kicad_cli_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';
import { PaperClipIcon, LinkIcon, XCircleIcon } from '../components/icons';

const KICAD_SERVER_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Define KiCad Placement Constraint',
        description: 'Defines a placement constraint between one or more components, such as a fixed relative position or a fixed orientation. This is critical for components that must fit together, like connectors for a mezzanine board.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: "To enforce specific geometric relationships between components during layout, ensuring mechanical compatibility.",
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'type', type: 'string', description: "The type of constraint. Supported types: 'relative_position', 'fixed_orientation', 'fixed_group'.", required: true },
            { name: 'components', type: 'array', description: "An array of component definitions. For 'fixed_group', this is a list of objects with ref, offsets, and angle. For others, it's a list of ref strings.", required: true },
            { name: 'anchor', type: 'string', description: "For 'fixed_group', the reference designator of the anchor component.", required: false },
            { name: 'offsetX_mm', type: 'number', description: "For 'relative_position', the X offset in millimeters of the second component relative to the first.", required: false },
            { name: 'offsetY_mm', type: 'number', description: "For 'relative_position', the Y offset in millimeters of the second component relative to the first.", required: false },
            { name: 'angle_deg', type: 'number', description: "For 'fixed_orientation', the absolute rotation angle in degrees. 0 is default, 90 is component rotated counter-clockwise.", required: false },
        ],
        implementationCode: 'python scripts/kicad_cli.py define_placement_constraint'
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
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y, rotation} coordinates. Example: '{"U1": {"x": 10, "y": 15, "rotation": 90}, "R1": {"x": 25, "y": 15, "rotation": 0}}'.`, required: true },
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
];

const KICAD_INTERNAL_CLIENT_TOOLS: ToolCreatorPayload[] = [
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
    description: 'Installs the complete KiCad suite. This one-time action writes Python scripts to the backend AND creates all required server-side and internal client-side tools for PCB design. This MUST be called before any other KiCad tool.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To fully bootstrap the agent's hardware engineering capabilities by installing all necessary server-side scripts and tool definitions in a single, atomic operation.",
    parameters: [],
    implementationCode: `
        const serverToolPayloads = ${JSON.stringify(KICAD_SERVER_TOOL_DEFINITIONS)};
        const clientToolPayloads = ${JSON.stringify(KICAD_INTERNAL_CLIENT_TOOLS)};

        const cliMainContent = ${JSON.stringify(KICAD_CLI_MAIN_SCRIPT)};
        const cliCommandsContent = ${JSON.stringify(KICAD_CLI_COMMANDS_SCRIPT)};
        const dsnUtilsContent = ${JSON.stringify(KICAD_DSN_UTILS_SCRIPT)};
        const sesUtilsContent = ${JSON.stringify(KICAD_SES_UTILS_SCRIPT)};

        // Step 1: Write all Python scripts to the server
        await runtime.tools.run('Server File Writer', { filePath: 'kicad_dsn_utils.py', content: dsnUtilsContent });
        await runtime.tools.run('Server File Writer', { filePath: 'kicad_ses_utils.py', content: sesUtilsContent });
        await runtime.tools.run('Server File Writer', { filePath: 'kicad_cli_commands.py', content: cliCommandsContent });
        await runtime.tools.run('Server File Writer', { filePath: 'kicad_cli.py', content: cliMainContent });
        console.log('[INFO] KiCad Python scripts written to server.');

        // Step 2: Create all the server-side tools
        console.log(\`[INFO] Creating \${serverToolPayloads.length} KiCad server tools...\`);
        for (const payload of serverToolPayloads) {
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                console.warn(\`[WARN] Server tool '\${payload.name}' might already exist. Skipping. Error: \${e.message}\`);
            }
        }
        
        // Step 3: Create all internal client-side tools
        console.log(\`[INFO] Creating \${clientToolPayloads.length} internal KiCad client tools...\`);
        for (const payload of clientToolPayloads) {
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                 console.warn(\`[WARN] Client tool '\${payload.name}' might already exist. Skipping. Error: \${e.message}\`);
            }
        }
        
        // Step 4: Refresh the server tools list in the client to update the UI immediately
        await runtime.fetchServerTools();

        return { success: true, message: 'KiCad Engineering Suite and all associated tools installed successfully.' };
    `
};

const KICAD_UI_PANEL_TOOL: ToolCreatorPayload = {
    name: 'KiCad Design Automation Panel',
    description: 'The main UI for the KiCad workflow, allowing users to input a request and monitor the agent swarm as it executes the design process.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly, all-in-one interface for the complex hardware generation workflow, managed by an AI swarm.',
    parameters: [
        { name: 'onStartTask', type: 'object', description: 'Function to call to start the KiCad generation task with the swarm.', required: true },
        { name: 'kicadLog', type: 'array', description: 'An array of strings representing the log messages from the KiCad workflow.', required: true },
        { name: 'isGenerating', type: 'boolean', description: 'A boolean flag indicating if the swarm is currently running or paused for layout.', required: true },
        { name: 'currentArtifact', type: 'object', description: 'An object representing the latest visual artifact generated by a workflow step (e.g., a PNG or SVG of the board).', required: false },
        { name: 'serverUrl', type: 'string', description: 'The base URL of the backend server, used for fetching artifact images.', required: true },
        { name: 'workflowSteps', type: 'array', description: 'The structured list of workflow steps with their status and sub-tasks.', required: true },
        { name: 'currentLayoutData', type: 'object', description: 'The graph data for the interactive layout. If this is present, the main view has switched to the layout tool.', required: false },
    ],
    implementationCode: `
    const [prompt, setPrompt] = React.useState(\`I need a PCB design for a mezzanine board.

Here is the plan:

1.  Define the components:
    *   An ADC component with reference 'U1'. Its description is '8-Channel, 24-Bit, 32-kSPS, Delta-Sigma ADC'. Its value is 'ADS131M08' and its footprint identifier is 'Package_QFP:LQFP-32_5x5mm_P0.5mm'. It has 32 pins.
    *   Two header components with references 'J1' and 'J2'. Their description is 'XIAO Header', value is 'XIAO Header', footprint is 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', and they have 7 pins each.

2.  Define the placement constraints to ensure the headers match the XIAO footprint:
    *   First, fix J1's orientation to 0 degrees.
    *   Then, define J2's position relative to J1 with an offset of (X=0mm, Y=17.78mm).

3.  Define all the electrical nets by calling the 'Define KiCad Net' tool for each one. The nets are:
    *   A net named 'GND' connecting pins: ["U1-13", "U1-25", "U1-27", "U1-28", "J2-1"]
    *   A net named 'AVDD' connecting pins: ["U1-15", "J1-1"]
    *   A net named 'DVDD' connecting pins: ["U1-26", "J1-2"]
    *   A net named 'REFIN' connecting pins: ["U1-14", "J1-3"]
    *   A net named 'SCLK' connecting pins: ["U1-19", "J1-4"]
    *   A net named 'DOUT' connecting pins: ["U1-20", "J1-5"]
    *   A net named 'DIN' connecting pins: ["U1-21", "J1-6"]
    *   A net named 'CS' connecting pins: ["U1-17", "J1-7"]
    *   A net named 'DRDY' connecting pins: ["U1-18", "J2-2"]
    *   A net named 'SYNC_RESET' connecting pins: ["U1-16", "J2-3"]
    *   A net named 'XTAL1' connecting pins: ["U1-23", "J2-4"]
    *   A net named 'AIN0P' connecting pins: ["U1-29"]
    *   A net named 'AIN1P' connecting pins: ["U1-32"]
    *   A net named 'AIN2P' connecting pins: ["U1-1"]
    *   A net named 'AIN3P' connecting pins: ["U1-4"]
    *   A net named 'AIN4P' connecting pins: ["U1-5"]
    *   A net named 'AIN5P' connecting pins: ["U1-8"]
    *   A net named 'AIN6P' connecting pins: ["U1-9"]
    *   A net named 'AIN7P' connecting pins: ["U1-12"]

4.  Generate the netlist from the defined components and nets.
5.  Create the initial PCB from the netlist.
6.  Arrange the components using the 'force-directed' arrangement strategy, waiting for user input.
7.  Autoroute the PCB.
8.  Export the final fabrication files.\`);
    const [files, setFiles] = React.useState([]);
    const [urls, setUrls] = React.useState(['']);
    const [useSearch, setUseSearch] = React.useState(false);
    const [elapsedTime, setElapsedTime] = React.useState(0);
    
    const scrollContainerRef = React.useRef(null);
    
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [kicadLog]);

    React.useEffect(() => {
        let timer;
        if (isGenerating) {
            setElapsedTime(0);
            timer = setInterval(() => setElapsedTime(t => t + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [isGenerating]);

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

    const handleStart = async () => {
        if (isGenerating) return;
        const filePayloads = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result.toString().split(',')[1] });
            reader.onerror = err => reject(err);
            reader.readAsDataURL(file);
        })));
        onStartTask({ prompt, files: filePayloads, urls: urls.filter(u => u.trim()), useSearch });
    };
    
    const timeFormatted = new Date(elapsedTime * 1000).toISOString().substr(14, 5);
    
    const currentStepIndex = workflowSteps.findIndex(step => step.status === 'in-progress');
    const overallProgress = (workflowSteps.filter(s => s.status === 'completed').length / workflowSteps.length) * 100;
    
    // --- RENDER FUNCTIONS ---

    const renderPromptForm = () => (
        <div className="space-y-2 overflow-y-auto pr-2">
            <label className="block text-sm font-medium text-gray-300">Design Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the PCB you want to create..." className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 resize-y" rows="3" />
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Reference Files & URLs</label>
                <div className="p-2 border-2 border-gray-600 border-dashed rounded-lg bg-gray-900/50">
                    <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp" />
                    <button onClick={() => document.getElementById('file-upload').click()} className="text-sm text-sky-400 hover:underline w-full text-center p-2">Attach Files...</button>
                    {files.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{files.map((f, i) => <div key={i} className="flex items-center gap-1 bg-gray-700 text-xs px-1.5 py-0.5 rounded-full"><span>{f.name}</span><button onClick={() => removeFile(f)}><XCircleIcon className="w-3 h-3 text-red-400"/></button></div>)}</div>}
                    {urls.map((url, index) => <div key={index} className="flex items-center gap-2 mt-1"><LinkIcon className="w-4 h-4 text-gray-500"/><input type="url" value={url} onChange={e => handleUrlChange(index, e.target.value)} placeholder="https://example.com/datasheet.pdf" className="w-full bg-gray-800 border-gray-600 rounded p-1 text-sm"/>{urls.length > 1 && <button onClick={() => removeUrl(index)}><XCircleIcon className="w-4 h-4 text-red-400"/></button>}</div>)}
                </div>
            </div>
            <div className="flex items-center gap-2 pt-1"><input type="checkbox" id="use-search" checked={useSearch} onChange={e => setUseSearch(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600"/><label htmlFor="use-search" className="text-sm text-gray-300">Enable Web Search</label></div>
        </div>
    );
    
    const renderExecutionView = () => (
        <div className="flex-grow flex flex-col min-h-0">
           {renderWorkflowTracker()}
           <h4 className="font-semibold text-gray-300 text-sm mt-3 mb-1">Execution Log</h4>
           <div ref={scrollContainerRef} className="flex-grow bg-black/20 rounded p-2 min-h-[50px] overflow-y-auto">
               {kicadLog.length > 0 ? kicadLog.map((log, i) => <div key={i} className={\`py-0.5 text-xs border-b border-slate-800 \${log.includes('ERROR') ? 'text-red-400' : 'text-slate-300'} break-words whitespace-pre-wrap\`}>{log}</div>) : <p className="text-slate-500 text-sm">Waiting for logs...</p>}
           </div>
           {currentArtifact && <div className="mt-2 p-2 bg-black/20 rounded"><h4 className="font-semibold text-sm text-gray-300">{currentArtifact.title}</h4><div className="mt-1 bg-gray-700 p-2 rounded-lg"><object type="image/svg+xml" data={serverUrl + '/' + (currentArtifact.svgPath || currentArtifact.path)} className="w-full h-auto" /></div></div>}
        </div>
    );

    const renderLayoutPlaceholder = () => (
        <div className="flex-grow flex flex-col min-h-0 items-center justify-center text-center">
            {renderWorkflowTracker()}
            <div className="flex-grow w-full flex flex-col items-center justify-center bg-black/20 rounded p-4 mt-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-300"></div>
                <p className="text-yellow-300 mt-4 font-semibold">Awaiting Manual Layout</p>
                <p className="text-gray-400 text-sm mt-1">The main view has switched to an interactive 3D layout tool.</p>
                <p className="text-gray-400 text-sm">Please arrange the components and click "Commit Layout" to continue.</p>
            </div>
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
                                    <div className="max-h-24 overflow-y-auto text-xs space-y-0.5 pr-2">
                                        {activeStep.subtasks.map(st => (
                                            <div key={st.name} className={\`flex items-center gap-1.5 \${st.status === 'completed' ? 'text-green-500' : 'text-gray-400'}\`}>
                                               <span>{st.status === 'completed' ? '✅' : '⚪'}</span>
                                               <span className="truncate">{st.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )};

    return (
        <div className="bg-gray-800/80 border-2 border-sky-500/60 rounded-xl p-4 shadow-lg flex flex-col h-full">
            <h3 className="text-lg font-bold text-sky-300 mb-3 text-center">KiCad Design Automation</h3>
            
            <div className="flex-grow flex flex-col min-h-0">
                { !isGenerating ? renderPromptForm() : currentLayoutData ? renderLayoutPlaceholder() : renderExecutionView() }
            </div>
            
             { !currentLayoutData &&
                <div className="mt-3">
                    <button onClick={handleStart} disabled={isGenerating} className="w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-wait">
                       {isGenerating ? 'Generating PCB...' : 'Generate PCB from Prompt'}
                    </button>
                </div>
            }
        </div>
    );
`};

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    KICAD_INSTALLER_TOOL,
    KICAD_UI_PANEL_TOOL,
    // The server tool definitions are now dynamically created by the installer.
];
