// bootstrap/aetherium_tools.ts
import type { ToolCreatorPayload } from '../types';
import { AETHERIUM_INITIAL_WORLD_SETUP } from './demo_presets';

// This is the template for the Node.js server process that runs a single game world (shard).
const WORLD_SETUP_SCRIPT_STRING = JSON.stringify(AETHERIUM_INITIAL_WORLD_SETUP, null, 4);

const GAME_SERVER_TEMPLATE = `
import express from 'express';
import cors from 'cors';
import type { PlayerState, RobotState, AgentPersonality, EnvironmentObject, LLMTool, ServerInventoryItem, VaultItem, Party, WorldEvent, WorldCreature } from '../../types';

const PORT = process.env.PORT || 4001;
const SHARD_ID = process.env.SHARD_ID || 'unknown_shard';

const app = express();
app.use(cors());
app.use(express.json());

// --- Game State ---
let players = new Map<string, PlayerState>();
let npcStates = new Map<string, RobotState>();
let agentPersonalities = new Map<string, AgentPersonality>();
let environmentState: EnvironmentObject[] = [];
let parties = new Map<string, Party>();
let worldEvents: WorldEvent[] = [];
let worldCreatures = new Map<string, any>();
let gameTick = 0;

// --- Tool Runtime (Server-Side Implementation) ---
const executeServerTool = (toolName: string, args: any, context?: {playerId: string}): { success: boolean, message: string, data?: any } => {
    try {
        if (toolName === 'Game Tick') {
            const boardBounds = { minX: -40, maxX: 40, minY: -40, maxY: 40 };
            npcStates.forEach((npc, id) => {
                const personality = agentPersonalities.get(id);
                if (!personality || personality.behaviorType !== 'patroller') return;
        
                let { x, y, rotation } = npc;
                let nextX = x, nextY = y;
        
                if (rotation === 0) nextY += 1;
                if (rotation === 90) nextX += 1;
                if (rotation === 180) nextY -= 1;
                if (rotation === 270) nextX -= 1;
                
                let collision = false;
                if (nextX < boardBounds.minX || nextX > boardBounds.maxX || nextY < boardBounds.minY || nextY > boardBounds.maxY) {
                    collision = true;
                } else {
                    const allEntities = [...Array.from(npcStates.values()).filter(other => other.id !== id), ...Array.from(players.values()), ...environmentState];
                    for (const entity of allEntities) {
                        if (entity.x === nextX && entity.y === nextY) { collision = true; break; }
                    }
                }
        
                if (collision) {
                    const turnDirection = Math.random() > 0.5 ? 90 : -90;
                    npc.rotation = (rotation + turnDirection + 360) % 360;
                } else {
                    npc.x = nextX;
                    npc.y = nextY;
                }
            });

            // World Event Spawner & Manager
            const now = Date.now();
            const activeEvents = worldEvents.filter(e => e.expiresAt > now);
            const hadActiveEvents = worldEvents.length > 0;

            // Spawn new event
            if (gameTick > 0 && gameTick % 300 === 0 && activeEvents.length === 0) {
                const newEvent: WorldEvent = { 
                    id: 'anomaly_' + now, 
                    name: 'Nexus Anomaly', 
                    description: 'A powerful schematic-creature has manifested!', 
                    type: 'Nexus_Anomaly', 
                    x: Math.floor(Math.random() * 20 - 10), 
                    y: Math.floor(Math.random() * 20 - 10), 
                    expiresAt: now + 300000 
                };
                activeEvents.push(newEvent);
                
                environmentState.push({ id: newEvent.id, type: 'Nexus_Anomaly', x: newEvent.x, y: newEvent.y, asset_glb: 'assets/game/events/nexus_anomaly.glb' });
                
                const bossId = \`anomaly_boss_\${now}\`;
                const creatureType = worldCreatures.get('mind_weaver');
                const bossAsset = creatureType ? creatureType.asset_glb : 'assets/game/creatures/creature_schematic_mind_weaver_ads131m08.glb';

                const bossPersonality: AgentPersonality = {
                    id: bossId, startX: newEvent.x, startY: newEvent.y,
                    behaviorType: 'patroller', 
                    asset_glb: bossAsset
                };
                agentPersonalities.set(bossId, bossPersonality);
                
                const bossState: RobotState = {
                    id: bossId, x: newEvent.x, y: newEvent.y,
                    rotation: 0, hasResource: false, powerLevel: 500
                };
                npcStates.set(bossId, bossState);

                console.log(\`[\${SHARD_ID}] [EVENT] Spawned Nexus Anomaly at (\${newEvent.x}, \${newEvent.y})\`);
            }

            // Cleanup expired events
            if (hadActiveEvents && activeEvents.length < worldEvents.length) {
                const expiredEvents = worldEvents.filter(e => e.expiresAt <= now);
                expiredEvents.forEach(e => {
                    console.log(\`[\${SHARD_ID}] [EVENT] Nexus Anomaly at (\${e.x}, \${e.y}) expired.\`);
                    environmentState = environmentState.filter(obj => obj.id !== e.id);
                    const bossId = \`anomaly_boss_\${e.id.split('_')[1]}\`;
                    npcStates.delete(bossId);
                    agentPersonalities.delete(bossId);
                });
            }

            worldEvents = activeEvents;

            return { success: true, message: 'Game state advanced by one tick.' };

        } else if (toolName === 'Define World Creature') {
            worldCreatures.set(args.creatureId, { name: args.name, description: args.description, asset_glb: args.asset_glb });
            console.log(\`[\${SHARD_ID}] [LORE] Creature type defined: \${args.name}\`);
            return { success: true, message: \`Creature type '\${args.name}' defined.\` };

        } else if (toolName === 'Place Environment Object') {
            const { objectId, type, x, y, asset_glb } = args;
            environmentState = environmentState.filter(obj => obj.id !== objectId);
            environmentState.push({ id: objectId, type, x, y, asset_glb });
            return { success: true, message: \`Placed \${objectId} at (\${x}, \${y}).\` };

        } else if (toolName === 'Define Robot Agent') {
            const creatureId = args.id.split('_').slice(0, -1).join('_');
            const creatureType = worldCreatures.get(creatureId);
            const asset = creatureType ? creatureType.asset_glb : args.asset_glb;

            const personality: AgentPersonality = { id: args.id, startX: args.startX, startY: args.startY, behaviorType: args.behaviorType, targetId: args.targetId, asset_glb: asset };
            agentPersonalities.set(personality.id, personality);
            const newRobotState: RobotState = { id: args.id, x: args.startX, y: args.startY, rotation: Math.floor(Math.random() * 4) * 90, hasResource: false, powerLevel: 100 };
            npcStates.set(newRobotState.id, newRobotState);
            return { success: true, message: \`Agent '\${args.id}' defined and spawned.\` };
        } else if (toolName === 'Form Forgemaster Party') {
            if (!context || !context.playerId) return { success: false, message: 'Player context required.' };
            const leader = players.get(context.playerId);
            const target = players.get(args.targetPlayerId);
            if (!leader || !target) return { success: false, message: 'Player not found.' };

            if (leader.partyId) { // Leader is in a party, add target
                const party = parties.get(leader.partyId);
                if (party && party.leaderId === leader.id && !party.memberIds.includes(target.id)) {
                    party.memberIds.push(target.id);
                    target.partyId = party.id;
                    return { success: true, message: \`\${target.name} joined the party.\`, data: { party } };
                }
            } else { // Create a new party
                const partyId = 'party_' + Date.now();
                const newParty: Party = { id: partyId, leaderId: leader.id, memberIds: [leader.id, target.id] };
                parties.set(partyId, newParty);
                leader.partyId = partyId;
                target.partyId = partyId;
                return { success: true, message: 'Party created.', data: { party: newParty } };
            }
        } else if (toolName === 'Trade Reagents') {
            // Placeholder for trade logic
            return { success: true, message: 'Trade offer sent (simulation).' };
        } else if (toolName === 'Challenge to Aetheric Duel') {
            // Placeholder for duel logic
            return { success: true, message: 'Duel challenged issued (simulation).' };
        } else if (toolName === 'Interact With Entity') {
            if (!context || !context.playerId) return { success: false, message: 'Player context required.' };
            const player = players.get(context.playerId);
            const targetNpc = npcStates.get(args.targetId);
            if (!player || !targetNpc) return { success: false, message: 'Player or target not found.' };

            const dx = player.x - targetNpc.x; const dy = player.y - targetNpc.y;
            if (Math.sqrt(dx * dx + dy * dy) > 2.5) return { success: false, message: 'Target is too far away.' };

            let drop: ServerInventoryItem | null = null;
            if (args.targetId.startsWith('mind_weaver')) {
                drop = { id: 'essence_mind_crystal_' + Date.now(), name: 'Crystal of Immaculate Mind', type: 'CreatureEssence', description: 'Harvested from a Mind Weaver.', quantity: 1 };
            } else if (args.targetId.startsWith('heartbeat_beetle')) {
                drop = { id: 'essence_heartstone_' + Date.now(), name: 'Heartstone of the Regulator', type: 'CreatureEssence', description: 'Harvested from a Heartbeat Beetle.', quantity: 1 };
            }
            
            if (drop) {
                npcStates.delete(args.targetId);
                agentPersonalities.delete(args.targetId);
                
                const newInventory = player.inventory || [];
                const existingItemIndex = newInventory.findIndex(item => item.name === drop.name);
                if (existingItemIndex > -1) { newInventory[existingItemIndex].quantity += 1;
                } else { newInventory.push(drop); }
                player.inventory = newInventory;
                
                return { success: true, message: \`Harvested \${drop.name} from \${args.targetId}!\` };
            }
            return { success: false, message: 'Nothing to harvest.' };
        }
        
        return { success: true, message: \`Tool '\${toolName}' executed (no-op).\` };

    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(\`[\${SHARD_ID}] Error executing tool '\${toolName}': \${errorMsg}\`);
        return { success: false, message: errorMsg, data: null };
    }
};

// --- World Initialization ---
const WORLD_SETUP_SCRIPT = ${WORLD_SETUP_SCRIPT_STRING};
const initializeWorld = () => {
    console.log(\`[\${SHARD_ID}] Initializing world state from script...\`);
    for (const step of WORLD_SETUP_SCRIPT) {
        if (step.name === 'Task Complete') continue;
        executeServerTool(step.name, step.arguments);
    }
    console.log(\`[\${SHARD_ID}] World initialized with \${npcStates.size} NPCs and \${environmentState.length} objects.\`);
};
initializeWorld();

// --- Game Loop ---
setInterval(() => {
    gameTick++;
    executeServerTool('Game Tick', {});
}, 1000);

// --- API Endpoints ---
app.post('/api/join', (req, res) => {
    const { playerState } = req.body;
    if (!playerState || !playerState.id) return res.status(400).json({ error: 'Invalid player state: ID is missing.' });
    
    const serverPlayerState: PlayerState = { ...playerState, inventory: [] };
    playerState.vault.forEach((blueprint: VaultItem) => {
        if (blueprint.name === 'Phylactery of True Sight') {
            serverPlayerState.inventory?.push({ id: 'phylactery_amulet_1', name: 'Amulet of True Sight', type: 'Artifact', description: 'An amulet that hums with psionic power, granted for your knowledge of its forging.', quantity: 1 });
        }
    });

    players.set(playerState.id, serverPlayerState);
    console.log(\`[\${SHARD_ID}] Player '\${playerState.name}' joined. Vault interpreted, inventory granted.\`);
    res.json({ success: true, player: serverPlayerState });
});

app.post('/api/player/:id/action', (req, res) => {
    const player = players.get(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    
    const { toolName, arguments: args } = req.body;

    if (['Move Forward', 'Move Backward', 'Turn Left', 'Turn Right'].includes(toolName)) {
        let { x, y, rotation } = player;
        if (toolName === 'Move Forward') {
            if (rotation === 0) y += 1; if (rotation === 90) x += 1; if (rotation === 180) y -= 1; if (rotation === 270) x -= 1;
        } else if (toolName === 'Move Backward') {
            if (rotation === 0) y -= 1; if (rotation === 90) x -= 1; if (rotation === 180) y += 1; if (rotation === 270) x += 1;
        } else if (toolName === 'Turn Left') {
            rotation = (rotation - 90 + 360) % 360; // FIX: Left is CCW, should be +90 in a Y-down coord system, but sticking to this for consistency with client.
        } else if (toolName === 'Turn Right') {
            rotation = (rotation + 90 + 360) % 360; // FIX: Right is CW, should be -90.
        }
        const updatedPlayer = { ...player, x, y, rotation };
        players.set(req.params.id, updatedPlayer);
        res.json({ success: true, player: updatedPlayer });
    } else {
        const result = executeServerTool(toolName, args, { playerId: req.params.id });
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json({ error: result.message });
        }
    }
});

app.post('/api/player/:id/craft', (req, res) => {
    const player = players.get(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    const { recipeName } = req.body;

    if (recipeName === 'Phylactery of True Sight') {
        const required = [ { name: 'Crystal of Immaculate Mind', quantity: 1 }, { name: 'Heartstone of the Regulator', quantity: 2 } ];
        const inventoryMap = new Map((player.inventory || []).map(i => [i.name, i.quantity]));
        const hasAllReagents = required.every(req => (inventoryMap.get(req.name) || 0) >= req.quantity);
        if (!hasAllReagents) return res.status(400).json({ error: 'Missing required reagents.' });

        const newInventory = [...(player.inventory || [])];
        required.forEach(req => { const itemIndex = newInventory.findIndex(i => i.name === req.name); if (itemIndex > -1) { newInventory[itemIndex].quantity -= req.quantity; } });
        player.inventory = newInventory.filter(i => i.quantity > 0);

        const blueprint: Omit<VaultItem, 'id' | 'createdAt'> = { name: 'Phylactery of True Sight', type: 'KiCad Design', description: 'A real-world EEG mezzanine board design, forged in the Aetherium.', files: [ { path: 'phylactery.kicad_pcb', content: '... (kicad_pcb file content) ...' }, { path: 'phylactery.kicad_sch', content: '... (kicad_sch file content) ...' } ] };
        res.json({ success: true, message: 'Forge successful! Blueprint transmitted.', blueprint });
    } else {
        res.status(400).json({ error: 'Unknown recipe.' });
    }
});

app.get('/api/state', (req, res) => {
    res.json({
        players: Array.from(players.values()),
        npcs: Array.from(npcStates.values()),
        environment: environmentState,
        agentPersonalities: Array.from(agentPersonalities.values()),
        parties: Array.from(parties.values()),
        worldEvents: worldEvents,
    });
});

app.listen(PORT, () => console.log(\`[\${SHARD_ID}] Aetherium world shard listening on http://localhost:\${PORT}\`));
`;

const DEFINE_WORLD_CREATURE_TOOL: ToolCreatorPayload = {
    name: 'Define World Creature', description: 'Defines a creature type available in the Aetherium world, including its lore and visual asset.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To establish the bestiary of a world shard, defining the creatures players and agents can interact with.',
    parameters: [ { name: 'creatureId', type: 'string', description: 'A unique ID for the creature type.', required: true }, { name: 'name', type: 'string', description: 'The display name of the creature.', required: true }, { name: 'description', type: 'string', description: 'Lore-friendly description of the creature.', required: true }, { name: 'asset_glb', type: 'string', description: 'Path to the GLB model for the creature.', required: true }, ],
    implementationCode: `// This tool's logic is handled by the runtime to update game state.`
};

const PROCESS_TEXT_COMMAND_TOOL: ToolCreatorPayload = {
    name: 'Process Text Command',
    description: 'Interprets a natural language text command from the player and translates it into a specific, executable game tool call.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable a text-based RPG interface by converting player input into structured agent actions.',
    parameters: [
        { name: 'playerId', type: 'string', description: 'The ID of the player issuing the command.', required: true },
        { name: 'commandText', type: 'string', description: 'The natural language command from the player.', required: true },
        { name: 'gameState', type: 'object', description: 'The current state of the game world for context.', required: true },
    ],
    implementationCode: `
        const { playerId, commandText, gameState } = args;
        const availableActions = [
            { name: 'Move Forward', description: "Move one step in the current direction." },
            { name: 'Move Backward', description: "Move one step backward." },
            { name: 'Turn Left', description: "Turn 90 degrees left." },
            { name: 'Turn Right', description: "Turn 90 degrees right." },
            { name: 'Interact With Entity', description: "Interact with a nearby entity, e.g., to harvest it. Requires a 'targetId'." },
            { name: 'Aetheric Push', description: "Unleash a telekinetic blast on a target. Requires a 'targetId'." },
            { name: 'Describe Scenery', description: "Generate a detailed description of the current location and entities." }
        ];

        const systemPrompt = "You are a game engine parser. Your task is to convert a player's text command into a single, valid JSON tool call. Analyze the command and the provided game state to determine the correct action and any required arguments like 'targetId'. If the command is ambiguous or cannot be mapped to a tool, do not call any tool. Respond ONLY with the JSON tool call, nothing else.";
        
        const prompt = \`
Player Command: "\${commandText}"

Game State Context:
- Player ID: \${playerId}
- Nearby Entities: \${JSON.stringify(gameState.robotStates.map(r => ({ id: r.id, type: r.id.split('_')[0] })), null, 2)}

Available Actions:
\${JSON.stringify(availableActions, null, 2)}

Based on the command and context, what is the correct tool call JSON?
\`;

        const responseJson = await runtime.ai.generateText(prompt, systemPrompt);
        
        try {
            const jsonMatch = responseJson.match(/\\{[\\s\\S]*\\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.name && availableActions.some(a => a.name === parsed.name)) {
                    // It's a valid tool call, now execute it.
                    await runtime.tools.run(parsed.name, { ...parsed.arguments, playerId, gameState });
                    return { success: true, message: \`Command '\${commandText}' executed as '\${parsed.name}'.\` };
                }
            }
        } catch (e) {
             return { success: false, message: "I received an invalid instruction from the LLM." };
        }
        
        // If no valid tool call was generated
        return { success: false, message: "I don't understand that command." };
    `
};

const DESCRIBE_SCENERY_TOOL: ToolCreatorPayload = {
    name: 'Describe Scenery',
    description: 'Generates a rich, narrative description of the player\'s current location and surroundings based on the game state.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide the descriptive text for the text-based RPG mode.',
    parameters: [
        { name: 'gameState', type: 'object', description: 'The current state of the game world for context.', required: true },
        { name: 'playerId', type: 'string', description: 'The ID of the player.', required: true },
    ],
    implementationCode: `
        const { gameState, playerId } = args;
        const { players, robotStates, environmentState } = gameState;
        const player = players.find(p => p.id === playerId);
        if (!player) return { success: false, description: "Player not found." };

        const systemPrompt = "You are a master storyteller and world-builder, like a Dungeon Master. Your task is to weave a cohesive, atmospheric, and engaging narrative from a list of entities. Describe the scene from the player's perspective in 2-3 evocative sentences.";
        
        const prompt = \`
Describe the scene for player '\${player.name}'.

Player State:
- Position: (\${player.x.toFixed(1)}, \${player.y.toFixed(1)})
- Facing: \${player.rotation.toFixed(0)} degrees

Nearby Creatures:
\${robotStates.map(r => \`- A \${r.id.replace(/_\\d+$/, '')} at (\${r.x.toFixed(1)}, \${r.y.toFixed(1)})\`).join('\\n') || '- None'}

Environment Features:
\${environmentState.map(e => \`- A \${e.type} at (\${e.x.toFixed(1)}, \${e.y.toFixed(1)})\`).join('\\n') || '- Nothing of note'}

Narrate the scene:
\`;
        const description = await runtime.ai.generateText(prompt, systemPrompt);
        return { success: true, description };
    `
};


const GAME_LOGIC_TOOLS: ToolCreatorPayload[] = [
    { name: 'Game Tick', description: 'Advances the game world state by one discrete step. This causes all NPCs to perform actions based on their defined behaviors (e.g., patrolling). This is the heartbeat of the world.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To provide a fundamental mechanism for the passage of time and autonomous agent behavior within the game world, making the world feel alive.', parameters: [], implementationCode: `// This tool's logic is implemented directly in the core runtime (client and server) and is called by the game loop.` },
    DEFINE_WORLD_CREATURE_TOOL,
    PROCESS_TEXT_COMMAND_TOOL,
    DESCRIBE_SCENERY_TOOL,
    { name: 'Aetheric Push', description: 'Unleashes a short-range telekinetic blast to shove a target creature or object. A fundamental combat and interaction spell.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To provide a direct, physics-based interaction with the game world, allowing players to manipulate their environment and adversaries.', parameters: [ { name: 'playerId', type: 'string', description: 'The ID of the player casting the spell.', required: true }, { name: 'targetId', type: 'string', description: 'The ID of the creature or object to push.', required: true }, ], implementationCode: `// This tool is handled by the physics-based useGameWorldManager hook.` },
    { name: 'Interact With Entity', description: 'Allows a player to interact with a nearby creature or object, potentially harvesting resources or triggering an event.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To provide the core mechanism for player interaction with the game world, such as harvesting creatures for reagents.',
      parameters: [ { name: 'playerId', type: 'string', description: 'The ID of the player initiating the interaction.', required: true }, { name: 'targetId', type: 'string', description: 'The ID of the NPC or object to interact with.', required: true }, ],
      implementationCode: `// This tool is handled by the core runtime to modify game state.`
    },
    { name: 'Forge Artifact', description: "Crafts a new artifact by consuming in-game reagents on the server and receiving a permanent design blueprint for the client's Vault.", category: 'Functional', executionEnvironment: 'Client', purpose: "To handle the core crafting loop, transforming temporary server-side items into permanent client-side intellectual property.",
      parameters: [ { name: 'playerId', type: 'string', description: 'The ID of the player initiating the craft.', required: true }, { name: 'recipeName', type: 'string', description: 'The name of the artifact recipe to craft.', required: true }, { name: 'serverPort', type: 'number', description: 'The port of the game server where crafting occurs.', required: false }, ],
      implementationCode: ` const { playerId, recipeName, serverPort } = args; if (!serverPort) { /* Offline logic is handled in useAppRuntime */ return; } const response = await fetch(\`http://localhost:\${serverPort}/api/player/\${playerId}/craft\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipeName }), }); const result = await response.json(); if (!response.ok) { throw new Error(result.error || 'Crafting failed on the server.'); } return { success: true, message: result.message, blueprint: result.blueprint };`
    },
    { name: 'Form Forgemaster Party', description: 'Invites another player to join your party.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To enable cooperative gameplay.', parameters: [{ name: 'targetPlayerId', type: 'string', description: 'The ID of the player to invite.', required: true }], implementationCode: `// Client-side, this will send a request to the server via handleManualControl or a direct fetch.` },
    { name: 'Trade Reagents', description: 'Initiates a trade with another player.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To facilitate a player-driven economy.', parameters: [{ name: 'targetPlayerId', type: 'string', description: 'The ID of the player to trade with.', required: true }, { name: 'itemsToOffer', type: 'array', description: 'An array of items to offer.', required: true }], implementationCode: `// Client-side, sends a request to the server.` },
    { name: 'Challenge to Aetheric Duel', description: 'Challenges another player to a PvP duel.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To provide a competitive outlet and a way to test crafted artifacts.', parameters: [{ name: 'targetPlayerId', type: 'string', description: 'The ID of the player to challenge.', required: true }], implementationCode: `// Client-side, sends a request to the server.` },
    { name: 'Discover New Research', description: 'Simulates finding a new scientific paper, potentially unlocking new crafting recipes and quests.', category: 'Functional', executionEnvironment: 'Client', purpose: 'To provide a mechanism for continuous content discovery.', parameters: [], implementationCode: `return { success: true, message: 'You have discovered a new research paper: "The Effects of Quantum Entanglement on Cognitive Functions"!' };` },
];

const PLAYER_DASHBOARD_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Player Dashboard', description: "Displays the player's permanent Vault and temporary in-game inventory.", category: 'UI Component', executionEnvironment: 'Client', purpose: "To provide a clear view of both the player's permanent IP (Vault) and their temporary, world-specific items (Inventory).",
    parameters: [ { name: 'playerState', type: 'object', description: 'The full state object of the active player, including vault and server inventory.', required: true }, { name: 'connectedServerInfo', type: 'object', description: 'Info about the connected server, if any.', required: false }, ],
    implementationCode: ` if (!playerState) { return <div className="text-center text-gray-400">No active player.</div>; } const { name, vault, inventory } = playerState;
        const ItemList = ({ title, items, isVault = false }) => (
            <div> <h5 className="font-semibold text-gray-300 mb-1">{title} ({items?.length || 0})</h5> <div className="bg-gray-800/60 p-2 rounded space-y-1 max-h-32 overflow-y-auto">
                    {(items && items.length > 0) ? ( items.map(item => ( <div key={item.id} className="p-1 rounded" title={item.description}> <div className="flex justify-between items-center text-sm"> <span className={isVault ? "text-yellow-300" : "text-white"}>{item.name}</span> {item.quantity && <span className="font-mono text-cyan-300">x{item.quantity}</span>} </div> <p className="text-xs text-gray-400">{item.type}</p> </div> )) ) : ( <p className="text-xs text-gray-500 text-center italic py-2">Empty</p> )}
                </div> </div> );
        return ( <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 h-full flex flex-col gap-2"> <h4 className="text-lg font-bold text-green-400 text-center">{name}</h4> {connectedServerInfo && <p className="text-xs text-center text-gray-400">Connected to: {connectedServerInfo.processId}</p>}
                <div className="flex-grow flex flex-col gap-3 overflow-y-auto pr-1"> <ItemList title="Vault (Permanent)" items={vault} isVault={true} /> {inventory && <ItemList title="Inventory (Temporary)" items={inventory} />} </div> </div> ); `
};

const CODEX_AETHERIUM_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Codex Aetherium',
    description: "An in-game encyclopedia that displays the engineering and metaphysical lore of the player's current project.",
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: "To provide a discoverable, in-game view of the lore that the AI generates, bridging the gap between engineering and magic.",
    parameters: [
        { name: 'kicadProjectState', type: 'object', description: 'The current state of the KiCad project, containing components and nets.', required: false },
    ],
    implementationCode: `
        const [selectedItem, setSelectedItem] = React.useState(null);
        if (!kicadProjectState) {
            return <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full flex items-center justify-center"><p className="text-gray-400 text-center italic">No active project to inspect.</p></div>;
        }
        const { components = [], nets = [] } = kicadProjectState;
        const handleSelect = (type, item) => { setSelectedItem(prev => (prev && ((prev.item.name && prev.item.name === item.name) || (prev.item.ref && prev.item.ref === item.ref))) ? null : { type, item }); };

        const renderDetails = () => {
            if (!selectedItem) return <p className="text-sm text-gray-500 italic text-center">Select an item to view its lore.</p>;
            const { type, item } = selectedItem;
            return (
                <div className="space-y-3">
                    <h5 className="font-bold text-yellow-300">{item.name || item.ref}</h5>
                    {type === 'component' && (
                        <div className="text-xs space-y-2">
                           <p><span className="font-semibold text-gray-400">Footprint:</span> <span className="font-mono">{item.footprint}</span></p>
                           {item.metaphysicalProperties && Object.entries(item.metaphysicalProperties).map(([key, value]) => (
                             <div key={key}><p className="font-semibold text-purple-300">{key.replace(/_/g, ' ')}:</p><p className="text-gray-300 pl-2">{value}</p></div>
                           ))}
                        </div>
                    )}
                    {type === 'net' && (
                         <div className="text-xs space-y-2">
                           <p className="font-semibold text-purple-300">Ritual Weaving:</p>
                           <p className="text-gray-300 italic pl-2">{item.ritualDescription || "A standard connection."}</p>
                         </div>
                    )}
                </div>
            );
        };
        
        return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-2 h-full flex flex-col">
                <h4 className="text-lg font-bold text-purple-300 text-center mb-2 flex-shrink-0">Codex Aetherium</h4>
                <div className="grid grid-cols-2 gap-2 flex-grow min-h-0">
                    <div className="flex flex-col gap-2">
                        <h5 className="font-semibold text-gray-300 text-sm">Reagents</h5>
                        <div className="bg-black/20 p-1 rounded overflow-y-auto flex-grow space-y-1">
                            {components.map(c => <button key={c.ref} onClick={() => handleSelect('component', c)} className={"w-full text-left p-1 text-xs rounded " + (selectedItem?.item.ref === c.ref ? 'bg-indigo-600 text-white' : 'bg-gray-700/50 hover:bg-gray-600')}>{c.ref}</button>)}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <h5 className="font-semibold text-gray-300 text-sm">Weavings</h5>
                        <div className="bg-black/20 p-1 rounded overflow-y-auto flex-grow space-y-1">
                            {nets.map(n => <button key={n.name} onClick={() => handleSelect('net', n)} className={"w-full text-left p-1 text-xs rounded " + (selectedItem?.item.name === n.name ? 'bg-indigo-600 text-white' : 'bg-gray-700/50 hover:bg-gray-600')}>{n.name}</button>)}
                        </div>
                    </div>
                </div>
                <div className="flex-shrink-0 mt-2 p-2 border-t border-gray-700 bg-black/20 rounded">
                    {renderDetails()}
                </div>
            </div>
        );
    `
};

const AETHERIUM_2D_MAP_VIEW_PAYLOAD: ToolCreatorPayload = {
    name: 'Aetherium 2D Map View',
    description: 'Renders a top-down 2D map of all entities in the game world.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a strategic, top-down overview of the game state.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph object containing nodes (entities).', required: true },
    ],
    implementationCode: `
        const { nodes = [] } = graph || {};
        const bounds = { minX: -40, maxX: 40, minY: -40, maxY: 40, width: 80, height: 80 };

        return (
            <div className="w-full h-full bg-black/50 border border-gray-700 rounded-lg relative overflow-hidden">
                <h3 className="absolute top-2 left-3 text-sm font-bold text-green-300 bg-black/30 px-2 py-1 rounded">2D Map</h3>
                {nodes.map(node => {
                    const isPlayer = node.asset_glb === 'assets/player_avatar.glb';
                    const left = ((node.x - bounds.minX) / bounds.width) * 100;
                    const top = ((node.y - bounds.minY) / bounds.height) * 100;
                    return (
                        <div 
                            key={node.id} 
                            className={"absolute w-2.5 h-2.5 rounded-full border-2 " + (isPlayer ? 'bg-cyan-400 border-cyan-200' : 'bg-red-500 border-red-300')}
                            style={{ left: \`calc(\${left}% - 5px)\`, top: \`calc(\${top}% - 5px)\` }}
                            title={node.id}
                        />
                    );
                })}
            </div>
        );
    `
};

const AETHERIUM_CARD_VIEW_PAYLOAD: ToolCreatorPayload = {
    name: 'Aetherium Card View',
    description: 'Renders tactical cards for the player and nearby entities.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a clear, tactical summary of entities in the immediate vicinity.',
    parameters: [
        { name: 'gameState', type: 'object', description: 'The current state of the game world.', required: true },
        { name: 'playerState', type: 'object', description: 'The active player character state.', required: true },
    ],
    implementationCode: `
        const player = gameState.players.find(p => p.id === playerState.id);
        if (!player) return null;

        const nearbyNpcs = gameState.robotStates.filter(npc => Math.hypot(npc.x - player.x, npc.y - player.y) < 15);
        const entities = [player, ...nearbyNpcs];

        const Card = ({ entity }) => {
            const isPlayer = entity.id === player.id;
            return (
                <div className="bg-gray-800/70 border border-gray-600 rounded-lg p-2 text-sm">
                    <p className={"font-bold " + (isPlayer ? 'text-cyan-300' : 'text-red-400')}>{entity.name || entity.id}</p>
                    <p className="text-xs text-gray-400">HP: {entity.powerLevel || '100'}/100</p>
                    <p className="text-xs text-gray-400">Pos: ({entity.x.toFixed(0)}, {entity.y.toFixed(0)})</p>
                </div>
            );
        };
        
        return (
            <div className="w-full h-full bg-black/50 border border-gray-700 rounded-lg p-2 overflow-y-auto">
                <h3 className="text-sm font-bold text-green-300 mb-2 text-center">Tactical View</h3>
                <div className="grid grid-cols-2 gap-2">
                    {entities.map(e => <Card key={e.id} entity={e} />)}
                </div>
            </div>
        );
    `
};

const AETHERIUM_NARRATIVE_LOG_PAYLOAD: ToolCreatorPayload = {
    name: 'Aetherium Narrative Log',
    description: 'Displays a running text log of game events and AI-generated descriptions.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the narrative, text-based RPG experience.',
    parameters: [
        { name: 'gameState', type: 'object', description: 'The current state of the game world.', required: true },
        { name: 'playerState', type: 'object', description: 'The active player character state.', required: true },
        { name: 'executeTool', type: 'object', description: 'Function to execute a tool call.', required: true },
    ],
    implementationCode: `
        const [log, setLog] = React.useState(['You awaken in the Aetherium.']);
        const [command, setCommand] = React.useState('');
        const [isWorking, setIsWorking] = React.useState(false);
        const logRef = React.useRef(null);

        React.useEffect(() => {
            if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
            }
        }, [log]);

        const addLogEntry = (entry) => setLog(prev => [...prev.slice(-50), entry]);

        const handleDescribe = async () => {
            setIsWorking(true);
            try {
                const result = await executeTool('Describe Scenery', { gameState, playerId: playerState.id });
                if (result.description) addLogEntry(result.description);
            } catch(e) {
                addLogEntry('The aetheric connection fizzles... (' + e.message + ')');
            } finally {
                setIsWorking(false);
            }
        };

        const handleCommand = async (e) => {
            if (e.key !== 'Enter' || !command.trim()) return;
            setIsWorking(true);
            addLogEntry('> ' + command);
            try {
                const result = await executeTool('Process Text Command', { gameState, playerId: playerState.id, commandText: command });
                if (result.message) addLogEntry(result.message);
            } catch(e) {
                addLogEntry('Your command echoes into the void... (' + e.message + ')');
            } finally {
                setCommand('');
                setIsWorking(false);
            }
        };
        
        return (
            <div className="w-full h-full bg-black/50 border border-gray-700 rounded-lg p-2 flex flex-col">
                <h3 className="text-sm font-bold text-green-300 mb-2 text-center flex-shrink-0">Narrative Log</h3>
                <div ref={logRef} className="flex-grow overflow-y-auto mb-2 pr-1 space-y-2 text-sm text-gray-300">
                    {log.map((entry, i) => <p key={i} className={entry.startsWith('>') ? 'text-cyan-400 italic' : ''}>{entry}</p>)}
                </div>
                <div className="flex-shrink-0 flex flex-col gap-2">
                    <button onClick={handleDescribe} disabled={isWorking} className="w-full text-xs bg-gray-700 hover:bg-gray-600 p-1.5 rounded">Describe Scenery</button>
                    <input 
                        type="text"
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        onKeyDown={handleCommand}
                        placeholder={isWorking ? "Awaiting response..." : "Type a command..."}
                        disabled={isWorking}
                        className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm"
                    />
                </div>
            </div>
        );
    `
};


export const AETHERIUM_CLIENT_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Aetherium Game Client', description: 'The main user interface for the Aetherium game, handling character management, world connection, and in-game UI.', category: 'UI Component', executionEnvironment: 'Client', purpose: 'To provide the player with a view into the Aetherium world and controls for interacting with it.',
    parameters: [ { name: 'gameState', type: 'object', description: 'The current state of the game world.', required: true }, { name: 'playerState', type: 'object', description: 'The active player character state from client-side storage.', required: true }, { name: 'isServerConnected', type: 'boolean', description: 'Flag for backend server connection.', required: true }, { name: 'demoScripts', type: 'array', description: 'Array of available demo scripts.', required: true }, { name: 'logEvent', type: 'object', description: 'Function to log events.', required: true }, { name: 'onLoadPlayer', type: 'object', description: 'Callback to load or create a player character.', required: true }, { name: 'onStartLocalGame', type: 'object', description: 'Callback to start a local game.', required: true }, { name: 'onExitGame', type: 'object', description: 'Callback to exit any active game session.', required: true }, { name: 'onConnectToShard', type: 'object', description: 'Callback to connect to a remote world shard.', required: true }, { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true }, { name: 'handleManualControl', type: 'object', description: 'Function to send player actions.', required: true }, { name: 'setPilotMode', type: 'object', description: 'Function to set the AI pilot mode.', required: true }, { name: 'setAiPilotTarget', type: 'object', description: 'Function to set the AI pilot target.', required: true }, { name: 'kicadProjectState', type: 'object', description: 'The current state of the KiCad project for the Codex.', required: false }, { name: 'executeTool', type: 'object', description: 'Function to execute a tool call.', required: true } ],
    implementationCode: ` const [servers, setServers] = React.useState([]); const [playerNameInput, setPlayerNameInput] = React.useState('Forgemaster'); const [isLoading, setIsLoading] = React.useState(false);
        const refreshServerList = React.useCallback(async () => { if (!isServerConnected) return setServers([]); try { const result = await executeTool('List Managed Processes'); setServers(result.processes || []); } catch (e) { console.error("Failed to refresh server list:", e); setServers([]); } }, [isServerConnected, executeTool]);
        React.useEffect(() => { if (isServerConnected) refreshServerList(); const interval = setInterval(refreshServerList, 5000); return () => clearInterval(interval); }, [refreshServerList, isServerConnected]);
        const handleForgeWorld = async () => { const worldId = 'aetheria_' + Date.now(); setIsLoading(true); try { await executeTool('Start Node Process', { processId: worldId, scriptPath: 'aetherium_server.ts' }); await refreshServerList(); } catch (e) { logEvent('[ERROR] World forging failed: ' + e.message); } finally { setIsLoading(false); } };
        const handleJoinServer = async (server) => { setIsLoading(true); try { await onConnectToShard(server, playerState); } catch (e) { logEvent('[ERROR] Failed to join: ' + e.message); } finally { setIsLoading(false); } };
        const isPlaying = gameState.isLocalGameRunning || gameState.connectedServerInfo; const localPlayer = isPlaying ? gameState.players.find(p => p.id === playerState?.id) : null;
        
        if (isPlaying) {
            const combinedEntities = [...gameState.robotStates, ...gameState.players.map(p => ({ id: p.id, x: p.x, y: p.y, rotation: p.rotation, hasResource: false, powerLevel: 100 }))];
            const personalityMap = new Map(gameState.agentPersonalities.map(p => [p.id, p]));
            const gameGraph = {
               nodes: [
                   ...combinedEntities.map(r => {
                       const personality = personalityMap.get(r.id);
                        const isPlayer = gameState.players.some(p => p.id === r.id);
                       return { id: r.id, label: isPlayer ? r.id : r.id.split('_')[0], type: 'robot', width: 10, height: 10, x: r.x, y: r.y, rotation: r.rotation, asset_glb: isPlayer ? 'assets/player_avatar.glb' : (personality ? personality.asset_glb : 'assets/creature_placeholder.glb') };
                   }),
                   ...gameState.environmentState.map((e, i) => ({ id: e.id || \`env_\${e.type}_\${i}\`, label: e.type, type: e.type, width: 10, height: 10, x: e.x, y: e.y, rotation: 0, asset_glb: (e).asset_glb }))
               ],
               edges: [],
               board_outline: { x: -40, y: -40, width: 80, height: 80, shape: 'rectangle' }
            };

            const layoutProps = { graph: gameGraph, layoutStrategy: 'physics', mode: 'robotics', isLayoutInteractive: false, onCommit: () => {}, onUpdateLayout: () => {}, getTool, isServerConnected, visibility: { glb: true }, playerId: playerState?.id };
            const mapViewProps = { graph: gameGraph };
            const cardViewProps = { gameState, playerState };
            const narrativeLogProps = { gameState, playerState, executeTool };

            return (
                <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full w-full">
                    <div className="bg-gray-900/50 rounded-lg p-2"><UIToolRunner tool={getTool('Interactive Simulation View')} props={layoutProps} /></div>
                    <div className="bg-gray-900/50 rounded-lg p-2"><UIToolRunner tool={getTool('Aetherium 2D Map View')} props={mapViewProps} /></div>
                    <div className="bg-gray-900/50 rounded-lg p-2"><UIToolRunner tool={getTool('Aetherium Card View')} props={cardViewProps} /></div>
                    <div className="bg-gray-900/50 rounded-lg p-2"><UIToolRunner tool={getTool('Aetherium Narrative Log')} props={narrativeLogProps} /></div>
                </div>
            );
        }

        if (!playerState) {
             return ( <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full flex flex-col justify-center gap-4">
                    <h3 className="text-lg font-bold text-purple-300 text-center">Enter Aetherium</h3>
                    <input id="player-name" placeholder="Enter your name..." type="text" value={playerNameInput} onChange={e => setPlayerNameInput(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={() => onLoadPlayer(playerNameInput)} disabled={!playerNameInput.trim()} className="w-full bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700">Load Character</button>
                </div> );
        }
        return ( <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full flex flex-col gap-4">
                <UIToolRunner tool={getTool('Player Dashboard')} props={{ playerState }} />
                 <div className="flex-grow border border-gray-700 rounded-lg p-2 bg-black/20 overflow-y-auto space-y-2">
                    <p className="text-xs text-gray-400 text-center">Available World Shards</p>
                    {servers.map(s => <button key={s.processId} onClick={() => handleJoinServer(s)} disabled={isLoading} className="w-full text-left p-2 bg-gray-700/50 rounded hover:bg-indigo-600/50">{s.processId}</button>)}
                    {servers.length === 0 && <p className="text-sm text-gray-500 text-center italic py-4">No shards active.</p>}
                 </div>
                <div className="flex gap-2">
                    <button onClick={() => onStartLocalGame(demoScripts.find(s => s.name === 'Aetherium: Genesis Ritual').workflow, playerState)} className="flex-1 bg-purple-600 text-white font-semibold py-2 rounded-lg">Offline Session</button>
                    <button onClick={handleForgeWorld} disabled={isLoading || !isServerConnected} className="flex-1 bg-indigo-600 text-white font-semibold py-2 rounded-lg disabled:bg-gray-600">Forge World Shard</button>
                </div>
                 <button onClick={onExitGame} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg py-2 mt-2">Exit</button>
            </div> );`
};

const payloadsForInstaller = [ 
    PLAYER_DASHBOARD_TOOL_PAYLOAD, 
    CODEX_AETHERIUM_TOOL_PAYLOAD, 
    ...GAME_LOGIC_TOOLS, 
    PROCESS_TEXT_COMMAND_TOOL, 
    DESCRIBE_SCENERY_TOOL,
    AETHERIUM_2D_MAP_VIEW_PAYLOAD,
    AETHERIUM_CARD_VIEW_PAYLOAD,
    AETHERIUM_NARRATIVE_LOG_PAYLOAD,
];
const AETHERIUM_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Aetherium Game Suite', description: 'Installs the tools required to interact with and manage the Aetherium game world, including server management and the game client.', category: 'Automation', executionEnvironment: 'Client', purpose: "To bootstrap the agent's ability to operate within the Aetherium game world.", parameters: [],
    implementationCode: ` runtime.logEvent('[INFO] Installing Aetherium Game Suite...'); const serverTemplate = ${JSON.stringify(GAME_SERVER_TEMPLATE)};
        if (runtime.isServerConnected()) { try { await runtime.tools.run('Server File Writer', { filePath: 'aetherium_server.ts', content: serverTemplate, }); runtime.logEvent('[INFO] ✅ File \\'aetherium_server.ts\\' written successfully to \\'scripts\\' directory.'); } catch (e) { runtime.logEvent(\`[WARN] ❌ Failed to write aetherium_server.ts: \${e.message}\`); } }
        const allPayloadsToCreate = ${JSON.stringify(payloadsForInstaller)}; const allTools = runtime.tools.list(); const existingToolNames = new Set(allTools.map(t => t.name));
        for (const payload of allPayloadsToCreate) { if (existingToolNames.has(payload.name)) { runtime.logEvent(\`[INFO] Tool '\${payload.name}' already exists. Skipping.\`); continue; } try { await runtime.tools.run('Tool Creator', payload); } catch (e) { runtime.logEvent(\`[ERROR] ❌ Failed to create new tool '\${payload.name}'. Error: \${e.message}\`); } }
        if (runtime.isServerConnected()) { await runtime.forceRefreshServerTools(); runtime.logEvent(\`[SYSTEM] Server tool cache synchronized. Loaded \${runtime.tools.list().filter(t=>t.category==='Server').length} server tools.\`); }
        return { success: true, message: 'Aetherium Game Suite installed successfully.' };`
};

export const AETHERIUM_TOOLS: ToolCreatorPayload[] = [
    AETHERIUM_INSTALLER_TOOL,
];
