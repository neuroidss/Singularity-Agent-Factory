
import type { ToolCreatorPayload } from '../types';
import React from 'react';
import { KICAD_CLI_MAIN_SCRIPT } from './kicad_cli_script';
import { KICAD_CLI_COMMANDS_SCRIPT } from './kicad_cli_commands';
import { KICAD_DSN_UTILS_SCRIPT } from './kicad_dsn_utils';
import { KICAD_SES_UTILS_SCRIPT } from './kicad_ses_utils';

const KICAD_SERVER_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
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
        description: 'Defines the board shape and size on the Edge.Cuts layer. If width/height are 0, it auto-sizes based on components.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To define the physical dimensions and shape of the final printed circuit board.',
        parameters: [
            { name: 'projectName', type: 'string', description: 'The unique name for this hardware project.', required: true },
            { name: 'boardWidthMillimeters', type: 'number', description: 'The desired width of the board in millimeters. Set to 0 for automatic sizing based on component area.', required: true },
            { name: 'boardHeightMillimeters', type: 'number', description: 'The desired height of the board in millimeters. Set to 0 for automatic sizing based on component area.', required: true },
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
            { name: 'componentPositionsJSON', type: 'string', description: `A JSON string of an object mapping component references to their new {x, y} coordinates in mm. Example: '{"U1": {"x": 10, "y": 15}, "R1": {"x": 25, "y": 15}}'.`, required: true },
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

const KICAD_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install KiCad Engineering Suite',
    description: 'Installs the complete KiCad suite. This one-time action writes Python scripts to the backend AND creates all required server-side tools for PCB design. This MUST be called before any other KiCad tool.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To fully bootstrap the agent's hardware engineering capabilities by installing all necessary server-side scripts and tool definitions in a single, atomic operation.",
    parameters: [],
    implementationCode: `
        const serverToolPayloads = ${JSON.stringify(KICAD_SERVER_TOOL_DEFINITIONS)};

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
                // The payload contains all necessary details (name, category, executionEnvironment, etc.)
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                // It's ok if it already exists, just log it and continue.
                console.warn(\`[WARN] Tool '\${payload.name}' might already exist. Skipping creation. Error: \${e.message}\`);
            }
        }
        
        // Step 3: Refresh the server tools list in the client to update the UI immediately
        await runtime.fetchServerTools();

        return { success: true, message: 'KiCad Engineering Suite and all server tools installed successfully. The swarm is now ready for PCB design tasks.' };
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
        { name: 'isGenerating', type: 'boolean', description: 'A boolean flag indicating if the swarm is currently running.', required: true },
        { name: 'currentArtifact', type: 'object', description: 'An object representing the latest visual artifact generated by a workflow step (e.g., a PNG or SVG of the board).', required: false },
        { name: 'serverUrl', type: 'string', description: 'The base URL of the backend server, used for fetching artifact images.', required: true }
    ],
    implementationCode: `
        const [prompt, setPrompt] = React.useState(\`I need a PCB design for a mezzanine board.

Here is the plan:

1.  Define the components:
    *   An ADC component with reference 'U1'. Its description is '8-Channel, 24-Bit, 32-kSPS, Delta-Sigma ADC'. Its value is 'ADS131M08' and its footprint identifier is 'Package_QFP:LQFP-32_5x5mm_P0.5mm'. It has 32 pins.
    *   Two header components with references 'J1' and 'J2'. Their description is 'XIAO Header', value is 'XIAO Header', footprint is 'Connector_PinHeader_2.54mm:PinHeader_1x07_P2.54mm_Vertical', and they have 7 pins each.
2.  Define all the electrical nets by calling the 'Define KiCad Net' tool for each one. The nets are:
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
3.  Generate the netlist from the defined components and nets.
4.  Create the initial PCB from the netlist.
5.  Arrange the components. Set 'waitForUserInput' to false to let the agent decide when the layout is ready and continue autonomously. After the components are placed, the board outline will be automatically calculated to fit them.
6.  Autoroute the PCB.
7.  Export the final fabrication files.\`);
        const scrollContainerRef = React.useRef(null);

        React.useEffect(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
        }, [kicadLog]);

        const renderArtifact = () => {
            if (!currentArtifact) return null;
            const fullUrl = serverUrl + '/' + (currentArtifact.svgPath || currentArtifact.path);
            const isSvg = !!currentArtifact.svgPath;
            return (
                <div className="mt-4 p-2 bg-black/20 rounded">
                    <h4 className="font-semibold text-sm text-gray-300">{currentArtifact.title}</h4>
                    <div className="mt-2 bg-gray-700 p-2 rounded-lg">
                       {isSvg ? <object type="image/svg+xml" data={fullUrl} className="w-full h-auto" /> : <img src={fullUrl} alt={currentArtifact.title} className="w-full h-auto rounded" />}
                    </div>
                </div>
            )
        };
        
        return (
            <div className="bg-gray-800/80 border-2 border-sky-500/60 rounded-xl p-4 shadow-lg flex flex-col h-full">
                <h3 className="text-lg font-bold text-sky-300 mb-3 text-center">KiCad Design Automation</h3>
                
                <div className="flex-grow flex flex-col min-h-0">
                    <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="Describe the PCB you want to create..."
                        className="flex-grow bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 resize-y mb-3"
                        rows="6"
                        disabled={isGenerating}
                    />
                    
                    <h4 className="font-semibold text-gray-300 text-sm mb-1">Execution Log</h4>
                    <div ref={scrollContainerRef} className="flex-grow bg-black/20 rounded p-2 min-h-[100px] overflow-y-auto">
                       {kicadLog.length > 0 ? kicadLog.map((log, i) => {
                            const color = log.includes('ERROR') ? 'text-red-400' : log.includes('Executing') || log.includes('Called') ? 'text-cyan-300' : log.includes('DEBUG') ? 'text-yellow-300' : 'text-slate-300';
                            return <div key={i} className={\`py-0.5 border-b border-slate-800 \${color} break-words\`}>{log}</div>
                        }) : <p className="text-slate-500 text-sm">Log is empty. Start a task to see agent output.</p>}
                    </div>

                    {currentArtifact && renderArtifact()}

                    <button onClick={() => onStartTask(prompt)} disabled={!prompt || isGenerating} className="mt-3 w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600">
                       {isGenerating ? 'Agent is Generating PCB...' : 'Generate PCB from Prompt'}
                    </button>
                </div>
            </div>
        );
    `
};

export const KICAD_TOOLS: ToolCreatorPayload[] = [
    KICAD_INSTALLER_TOOL,
    KICAD_UI_PANEL_TOOL,
    // The server tool definitions are now dynamically created by the installer.
];
