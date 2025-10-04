// bootstrap/virtual_film_set_tools.ts
import type { ToolCreatorPayload } from '../types';

const VIRTUAL_FILM_SET_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Define World Entity',
        description: 'Defines a single entity (actor, prop, camera) for the virtual film set simulation.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To populate the virtual film set with all necessary elements before running a scene simulation.',
        parameters: [
            { name: 'entityId', type: 'string', description: 'Unique ID for the entity (e.g., "actor_bob", "prop_cup").', required: true },
            { name: 'entityType', type: 'string', description: 'Type of entity: "actor", "prop", "camera", "light".', required: true },
            { name: 'asset_glb', type: 'string', description: 'Path to the GLB model for the entity\'s visual representation.', required: false },
            { name: 'initialX', type: 'number', description: 'Initial X coordinate.', required: false },
            { name: 'initialY', type: 'number', description: 'Initial Y coordinate (maps to Z in 3D space).', required: false },
        ],
        implementationCode: `
            // This is a client-side tool whose logic is handled inside useAppRuntime
            // to update the graph data for the Interactive Simulation View.
            return { success: true, message: \`Entity '\${args.entityId}' defined.\`, newNode: { id: args.entityId, label: args.entityId, type: args.entityType, x: args.initialX || 0, y: args.initialY || 0, asset_glb: args.asset_glb } };
        `
    },
    {
        name: 'Load and Parse Script',
        description: 'Parses raw script text into a structured JSON format containing scenes, characters, actions, and dialogue.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To convert a human-readable script into a machine-readable format that can drive the simulation.',
        parameters: [
            { name: 'scriptText', type: 'string', description: 'The full text of the script.', required: true },
        ],
        implementationCode: `
            const systemPrompt = "You are a script breakdown assistant. Analyze the script and convert it into a structured JSON object. The root object should have a 'scenes' key, which is an array. Each scene object should have 'scene_number', 'setting', 'characters', and an 'actions' array. Each action should have 'character', 'action_description', and 'dialogue'.";
            const resultText = await runtime.ai.generateText(args.scriptText, systemPrompt);
            try {
                const jsonMatch = resultText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) throw new Error('AI response did not contain valid JSON.');
                const parsedScript = JSON.parse(jsonMatch[0]);
                return { success: true, message: 'Script parsed successfully.', parsedScript };
            } catch (e) {
                runtime.logEvent('[ERROR] Failed to parse script from AI. Raw: ' + resultText);
                throw new Error('Failed to parse AI response as JSON: ' + e.message);
            }
        `
    },
     {
        name: 'Rewrite Script From Events',
        description: 'Takes an existing script and a list of new events (e.g., player actions) and rewrites the script to incorporate them.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To enable dynamic, interactive narratives by allowing agent or player actions to alter the course of the story.',
        parameters: [
            { name: 'originalScript', type: 'object', description: 'The original script as a structured JSON object.', required: true },
            { name: 'eventLog', type: 'array', description: 'An array of strings describing the new events that occurred.', required: true },
        ],
        implementationCode: `
            const systemPrompt = "You are a creative screenwriter. You will be given an original script and a list of new, unplanned events. Your task is to seamlessly rewrite the script to naturally incorporate these events. You must return the complete, new script in the same JSON format as the original.";
            const prompt = \`Original Script:\\n\${JSON.stringify(args.originalScript, null, 2)}\\n\\nNew Events to Incorporate:\\n- \${args.eventLog.join('\\n- ')}\\n\\nRewrite the script and provide the full new JSON object.\`;
            const resultText = await runtime.ai.generateText(prompt, systemPrompt);
            try {
                const jsonMatch = resultText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) throw new Error('AI response did not contain valid JSON.');
                const rewrittenScript = JSON.parse(jsonMatch[0]);
                return { success: true, message: 'Script rewritten based on new events.', rewrittenScript };
            } catch (e) {
                runtime.logEvent('[ERROR] Failed to parse rewritten script from AI. Raw: ' + resultText);
                throw new Error('Failed to parse AI response as JSON: ' + e.message);
            }
        `
    },
];

const VIRTUAL_FILM_SET_WORKBENCH_PAYLOAD: ToolCreatorPayload = {
    name: 'Virtual Film Set Workbench',
    description: 'The main UI for the Virtual Film Set, combining script editing, entity management, and a 3D simulation view.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a unified workspace for creating, simulating, and dynamically altering scripted narratives.',
    parameters: [
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        { name: 'executeTool', type: 'object', description: 'Function to execute a tool call.', required: true },
        { name: 'isServerConnected', type: 'boolean', description: 'Flag for server connection status.', required: true },
        { name: 'runtime', type: 'object', description: 'The agent runtime for AI calls.', required: true },
        { name: 'productionData', type: 'object', description: 'Shared state from the Producer Studio.', required: false },
        { name: 'setProductionData', type: 'object', description: 'Function to update shared production data.', required: true },
    ],
    implementationCode: `
        const [scriptText, setScriptText] = React.useState(\`SCENE START

INT. ALCHEMIST'S LAB - NIGHT

KAEL, a young scholar, pores over an ANCIENT MAP spread across a heavy oak table. Glowing potions bubble softly on shelves behind him.

ELARA, a robed sentinel, bursts into the room. Her breathing is heavy.

ELARA
(breathless)
It's gone! The Chrono-Shard has been stolen from the vault.

KAEL
(looking up, alarmed)
By whom?

ELARA
A figure cloaked in shadows. They fled towards the old observatory. Be careful, Kael. The shard warps time.

SCENE END

SCENE START

EXT. CITY ROOFTOPS - NIGHT

Kael, now equipped with a GRAPPLING HOOK, leaps across a wide gap between two rooftops, rain slicking the tiles.

A SHADOWY FIGURE is ahead, clutching the glowing CHRONO-SHARD.

KAEL
(shouting)
You can't control it! You'll tear the city apart!

The Shadowy Figure turns, revealing only darkness under its hood, and holds up the shard. Time seems to slow down around them.

SHADOWY FIGURE
(voice distorted)
Time is a cage. I will set us all free.

SCENE END\`);
        const [worldEntities, setWorldEntities] = React.useState([]);
        const [isLoading, setIsLoading] = React.useState(false);
        const [isPlaying, setIsPlaying] = React.useState(false);
        const [actionLog, setActionLog] = React.useState([]);
        const [musicPrompt, setMusicPrompt] = React.useState('tense cinematic underscore');
        const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
        
        const parsedScript = productionData?.parsedScript;

        const handleLoadAndParse = async () => {
            setIsLoading(true);
            try {
                const result = await executeTool('Load and Parse Script', { scriptText });
                setProductionData({ parsedScript: result.parsedScript }); // Store in shared state
                const newEntities = [];
                const characters = new Set();
                result.parsedScript.scenes.forEach(scene => { (scene.characters || []).forEach(char => characters.add(char.toUpperCase())); });
                let i = 0;
                characters.forEach(char => { newEntities.push({ id: \`actor_\${char}\`, label: char, type: 'actor', x: i * 5 - 5, y: 0, asset_glb: 'assets/player_avatar.glb' }); i++; });
                newEntities.push({ id: 'prop_table', label: 'Table', type: 'prop', x: 0, y: 0, asset_glb: 'assets/game/props/table.glb' });
                setWorldEntities(newEntities);
            } catch(e) { console.error('Script parsing failed:', e); }
            setIsLoading(false);
        };
        
        const handleLoadFromStudio = () => {
            if (!productionData || !productionData.parsedScript) {
                alert("No data from Producer Studio available.");
                return;
            }
            setScriptText(''); // Clear text area as we are loading from state
            const newEntities = [];
            const characters = new Set();
            productionData.parsedScript.scenes.forEach(scene => { (scene.characters || []).forEach(char => characters.add(char.toUpperCase())); });
            let i = 0;
            characters.forEach(char => {
                // The character models are images, not GLBs, so we still use a placeholder for the 3D sim.
                // The link is now logical rather than visual.
                newEntities.push({ id: \`actor_\${char}\`, label: char, type: 'actor', x: i * 5 - 5, y: 0, asset_glb: 'assets/player_avatar.glb' });
                i++;
            });
            const allProps = new Set();
            productionData.parsedScript.scenes.forEach(scene => { (scene.props || []).forEach(prop => allProps.add(prop.toUpperCase())); });
            allProps.forEach(prop => {
                newEntities.push({ id: \`prop_\${prop}\`, label: prop, type: 'prop', x: Math.random() * 10 - 5, y: Math.random() * 10 - 5, asset_glb: 'assets/game/props/table.glb' }); // placeholder prop
            });
            setWorldEntities(newEntities);
            setActionLog(prev => [...prev.slice(-10), 'Loaded entities from Producer Studio.']);
        };

        const handleRunScene = async () => {
            if (!parsedScript) { alert("Please load and parse a script first."); return; }
            setIsPlaying(true); setActionLog([]);
            const logAction = (msg) => setActionLog(prev => [...prev.slice(-10), msg]);
            for (const scene of parsedScript.scenes) {
                logAction(\`🎬 SCENE START: \${scene.setting}\`); await new Promise(r => setTimeout(r, 1000));
                for (const action of scene.actions) {
                    logAction(\`  -> Directing \${action.character}: "\${action.action_description || (action.dialogue ? '[Speaking]' : '[No action]')}"\`);
                    const actingCharId = \`actor_\${action.character.toUpperCase()}\`;
                    let targetPos = null;
                    if (action.action_description) {
                        const walksMatch = action.action_description.match(/walks to (\\\\w+)/i);
                        if (walksMatch && walksMatch[1]) {
                            const targetCharName = walksMatch[1].toUpperCase();
                            const targetEntity = worldEntities.find(e => e.id === \`actor_\${targetCharName}\`);
                            if (targetEntity) { targetPos = { x: targetEntity.x + (Math.random() > 0.5 ? 2 : -2), y: targetEntity.y }; }
                        }
                    }
                    setWorldEntities(ents => ents.map(e => (e.id === actingCharId) ? { ...e, x: targetPos ? targetPos.x : e.x + Math.random() * 2 - 1, y: targetPos ? targetPos.y : e.y + Math.random() * 2 - 1 } : e));
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            logAction("--- Playback Complete ---");
            setIsPlaying(false);
        };
        
        const handlePlayMusic = async () => { if(!musicPrompt.trim()) return; try { setIsMusicPlaying(true); await executeTool('Generate Background Music', { prompt: musicPrompt }); } catch(e) { setIsMusicPlaying(false); }};
        const handleStopMusic = async () => { try { await executeTool('Stop Background Music'); } finally { setIsMusicPlaying(false); }};
        
        const worldGraph = { nodes: worldEntities, edges: [], board_outline: { x: -20, y: -20, width: 40, height: 40, shape: 'rectangle' } };
        const simViewProps = { graph: worldGraph, mode: 'robotics', isServerConnected, getTool, visibility: { glb: true } };

        return (
            <div className="h-full w-full grid grid-cols-12 gap-4 text-white">
                <div className="col-span-4 h-full flex flex-col gap-4">
                    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex-grow flex flex-col min-h-0">
                        <h3 className="text-lg font-bold text-indigo-300 mb-2">Script Editor</h3>
                        <textarea value={scriptText} onChange={e => setScriptText(e.target.value)} placeholder="Enter script here or load from Producer Studio..." className="w-full flex-grow bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm font-mono resize-none" />
                         <div className="mt-2 flex gap-2">
                            <button onClick={handleLoadAndParse} disabled={isLoading} className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 font-semibold py-2 rounded-lg">
                                {isLoading ? 'Parsing...' : 'Load From Text'}
                            </button>
                            <button onClick={handleLoadFromStudio} disabled={!productionData} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 font-semibold py-2 rounded-lg">
                                Load From Studio
                            </button>
                        </div>
                    </div>
                     <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col">
                        <h3 className="text-lg font-bold text-indigo-300 mb-2">Director's Console</h3>
                        <button onClick={handleRunScene} disabled={isLoading || isPlaying || !parsedScript} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 font-semibold py-2 rounded-lg"> {isPlaying ? '▶️ Scene in Progress...' : '🎬 Run Scene'} </button>
                         <div className="mt-2 h-24 bg-black/30 p-2 rounded-md overflow-y-auto text-xs font-mono space-y-1"> {actionLog.map((log, i) => <p key={i}>{log}</p>)} </div>
                         <div className="mt-2 pt-2 border-t border-gray-700">
                             <h4 className="text-md font-bold text-purple-300 mb-1">Music Director</h4>
                             <input type="text" value={musicPrompt} onChange={e => setMusicPrompt(e.target.value)} placeholder="Music prompt..." className="w-full bg-gray-900 border-gray-600 rounded p-1.5 text-sm"/>
                             <div className="flex gap-2 mt-1">
                                <button onClick={handlePlayMusic} disabled={isMusicPlaying} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 font-semibold py-1.5 rounded-lg text-sm">Play Music</button>
                                <button onClick={handleStopMusic} disabled={!isMusicPlaying} className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 font-semibold py-1.5 rounded-lg text-sm">Stop Music</button>
                             </div>
                         </div>
                    </div>
                </div>
                <div className="col-span-8 h-full min-h-0">
                    <UIToolRunner tool={getTool('Interactive Simulation View')} props={simViewProps} />
                </div>
            </div>
        );
    `
};

const VIRTUAL_FILM_SET_INSTALLER: ToolCreatorPayload = {
    name: 'Install Virtual Film Set Suite',
    description: 'Installs all tools for the Virtual Film Set workspace.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's capabilities for virtual filmmaking and dynamic narrative simulation.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Virtual Film Set Suite...');
        const toolPayloads = [
            ...${JSON.stringify(VIRTUAL_FILM_SET_TOOL_DEFINITIONS)},
            ${JSON.stringify(VIRTUAL_FILM_SET_WORKBENCH_PAYLOAD)},
        ];
        
        const allTools = runtime.tools.list();
        const existingToolNames = new Set(allTools.map(t => t.name));

        for (const payload of toolPayloads) {
            if (existingToolNames.has(payload.name)) continue;
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to create tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'Virtual Film Set Suite installed.' };
    `
};

export const VIRTUAL_FILM_SET_TOOLS: ToolCreatorPayload[] = [
    VIRTUAL_FILM_SET_INSTALLER,
];
