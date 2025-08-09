
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
            { name: 'type', type: 'string', description: "The type of constraint. Supported types: 'relative_position', 'fixed_orientation'.", required: true },
            { name: 'components', type: 'array', description: "An array of one or more component reference designators to which this constraint applies. For 'relative_position', the order is [anchor, child].", required: true },
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
        const [prompt, setPrompt] = React.useState('Design a circular 8-channel EEG-like ADC board using an ADS131M08. It should be a mezzanine for a generic Seeed Studio Xiao. Provide 2.54mm header pins for the Xiao connection. Use 10 pogo pins for the 8 inputs, 1 AINREF-, 1 GND, arranged in a circle. Add 3.3V LDOs for AVDD and DVDD.');
        const [files, setFiles] = React.useState([]);
        const [urls, setUrls] = React.useState(['']);
        const [useSearch, setUseSearch] = React.useState(true);

        const scrollContainerRef = React.useRef(null);

        React.useEffect(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
        }, [kicadLog]);

        const handleFileChange = (e) => {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
            e.target.value = ''; // Allow re-selecting the same file
        };

        const removeFile = (fileToRemove) => {
            setFiles(prev => prev.filter(f => f !== fileToRemove));
        };

        const handleUrlChange = (index, value) => {
            const newUrls = [...urls];
            newUrls[index] = value;
            if (index === urls.length - 1 && value) {
                newUrls.push('');
            }
            setUrls(newUrls);
        };

        const removeUrl = (index) => {
            if (urls.length > 1) {
                setUrls(prev => prev.filter((_, i) => i !== index));
            } else {
                setUrls(['']);
            }
        };

        const handleStart = async () => {
            if (isGenerating) return;
            kicadLog.push("Reading files for submission...");

            const filePayloads = [];
            for (const file of files) {
                try {
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.toString().split(',')[1]);
                        reader.onerror = err => reject(err);
                        reader.readAsDataURL(file);
                    });
                    filePayloads.push({ name: file.name, type: file.type, data: base64Data });
                } catch (error) {
                    kicadLog.push(\`ERROR: Failed to read file \${file.name}\`);
                    return;
                }
            }
            kicadLog.push("File reading complete.");
            
            onStartTask({
                prompt,
                files: filePayloads,
                urls: urls.filter(u => u.trim()),
                useSearch
            });
        };

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
                
                <div className="flex-grow flex flex-col min-h-0 space-y-3">
                    {/* Design Inputs Section */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">Design Prompt</label>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Describe the PCB you want to create..."
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 resize-y"
                            rows="3"
                            disabled={isGenerating}
                        />

                        {/* File Upload */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Reference Files (Images, PDFs)</label>
                            <div className="flex items-center justify-center w-full">
                                <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-900/50 hover:bg-gray-800/60">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <PaperClipIcon className="w-8 h-8 mb-2 text-gray-500" />
                                        <p className="mb-1 text-sm text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                        <p className="text-xs text-gray-500">Datasheets, schematics, sketches</p>
                                    </div>
                                    <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={isGenerating} />
                                </label>
                            </div>
                            {files.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {files.map((file, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-gray-700/80 text-white text-xs px-2 py-1 rounded-full">
                                            <span>{file.name}</span>
                                            <button onClick={() => removeFile(file)} className="text-red-400 hover:text-red-300"><XCircleIcon className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* URL Inputs */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Reference URLs</label>
                            {urls.map((url, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <LinkIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={e => handleUrlChange(index, e.target.value)}
                                        placeholder="https://example.com/datasheet.pdf"
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-sky-500"
                                        disabled={isGenerating}
                                    />
                                    {urls.length > 1 && <button onClick={() => removeUrl(index)} className="text-red-400 hover:text-red-300"><XCircleIcon className="w-5 h-5" /></button>}
                                </div>
                            ))}
                        </div>
                         
                        {/* Search Checkbox */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="use-search"
                                checked={useSearch}
                                onChange={e => setUseSearch(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                                disabled={isGenerating}
                            />
                            <label htmlFor="use-search" className="text-sm text-gray-300">Enable Web Search pre-analysis</label>
                        </div>
                    </div>

                    <h4 className="font-semibold text-gray-300 text-sm mb-1 pt-2">Execution Log</h4>
                    <div ref={scrollContainerRef} className="flex-grow bg-black/20 rounded p-2 min-h-[100px] overflow-y-auto">
                       {kicadLog.length > 0 ? kicadLog.map((log, i) => {
                            const color = log.includes('ERROR') ? 'text-red-400' : log.includes('Executing') || log.includes('Called') ? 'text-cyan-300' : log.includes('DEBUG') || log.includes('📚') ? 'text-yellow-300' : log.includes('🔎') || log.includes('✨') ? 'text-purple-300' : 'text-slate-300';
                            return <div key={i} className={\`py-0.5 text-xs border-b border-slate-800 \${color} break-words whitespace-pre-wrap\`}>{log}</div>
                        }) : <p className="text-slate-500 text-sm">Log is empty. Start a task to see agent output.</p>}
                    </div>

                    {currentArtifact && renderArtifact()}

                    <button onClick={handleStart} disabled={isGenerating} className="mt-3 w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600">
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
