// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
// Fix: Import `React` to make the namespace available for types like `React.MutableRefObject`.
import React, { useState, useCallback, useEffect, useRef } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { RobotState, EnvironmentObject, AIToolCall, EnrichedAIResponse, AgentPersonality, PlayerState, LLMTool, Party, WorldEvent, PilotMode, WorldCreature } from '../types';

const initialEnvironmentState: EnvironmentObject[] = [];
let gameLoopInterval: number | null = null;
let aiPilotInterval: number | null = null;

// Ensure Rapier is initialized only once using a global promise.
if (!(window as any).rapierInitializationPromise) {
    (window as any).rapierInitializationPromise = RAPIER.init().then(() => RAPIER);
}


export const useGameWorldManager = ({ logEvent, executeActionRef, processRequest }: { logEvent: (message: string) => void, executeActionRef: React.MutableRefObject<any>, processRequest: any }) => {
    const [robotStates, setRobotStates] = useState<RobotState[]>([]); // NPCs
    const [players, setPlayers] = useState<PlayerState[]>([]);
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>(initialEnvironmentState);
    const [agentPersonalities, setAgentPersonalities] = useState<AgentPersonality[]>([]);
    const [isLocalGameRunning, setIsLocalGameRunning] = useState(false);
    const [parties, setParties] = useState<Party[]>([]);
    const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
    const [worldCreatures, setWorldCreatures] = useState<WorldCreature[]>([]);
    const [pilotMode, setPilotMode] = useState<PilotMode>('MANUAL');
    const [aiPilotTarget, setAiPilotTarget] = useState<string>("Explore the world and gather valuable reagents.");
    
    // --- New Physics State ---
    const worldRef = useRef<RAPIER.World | null>(null);
    const entityBodyMapRef = useRef<Map<string, RAPIER.RigidBody>>(new Map());
    const agentAIState = useRef(new Map<string, { target: { x: number, z: number } }>());
    
    const [connectedServerInfo, setConnectedServerInfo] = useState<{ processId: string, port: number } | null>(null);
    const pollingIntervalRef = useRef<number | null>(null);

    const gameTickCountRef = useRef(0);
    
    const playersRef = useRef(players);
    useEffect(() => { playersRef.current = players; }, [players]);

    const connectedServerInfoRef = useRef(connectedServerInfo);
    useEffect(() => { connectedServerInfoRef.current = connectedServerInfo; }, [connectedServerInfo]);


    const getGameStateForRuntime = useCallback((agentId: string) => {
        const robot = robotStates.find(r => r.id === agentId);
        const defaultRobot: RobotState = { id: agentId, x: 0, y: 0, rotation: 0, hasResource: false, powerLevel: 100 };
        return { 
            robot: robot || defaultRobot, 
            players,
            robotStates,
            environment: environmentState, 
            personalities: agentPersonalities,
            worldCreatures,
            gameTick: gameTickCountRef.current,
        };
    }, [robotStates, players, environmentState, agentPersonalities, worldCreatures]);
    
    const stopGameLoop = useCallback(() => {
        if (gameLoopInterval) {
            clearInterval(gameLoopInterval);
            gameLoopInterval = null;
            setIsLocalGameRunning(false);
            logEvent('[SYSTEM] Local game loop stopped.');
        }
        if (aiPilotInterval) {
            clearInterval(aiPilotInterval);
            aiPilotInterval = null;
            logEvent('[SYSTEM] AI Familiar Pilot deactivated.');
        }
        if (worldRef.current) {
            worldRef.current.free();
            worldRef.current = null;
            entityBodyMapRef.current.clear();
        }
    }, [logEvent]);

    const getRandomTarget = useCallback(() => {
        const bounds = { minX: -40, maxX: 40, minY: -40, maxY: 40 };
        const randX = Math.random() * (bounds.maxX - bounds.minX) + bounds.minX;
        const randZ = Math.random() * (bounds.maxY - bounds.minY) + bounds.minY;
        return { x: randX, z: randZ };
    }, []);
    
    const handleManualControl = useCallback(async (toolName: string, args: any = {}) => {
        const { playerId, ...actionArgs } = args;
        if (!playerId) return logEvent(`[CONTROL] Manual command failed: Player ID missing.`);

        if (connectedServerInfoRef.current) { // Online MMO mode
            try {
                const response = await fetch(`http://localhost:${connectedServerInfoRef.current.port}/api/player/${playerId}/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toolName: toolName, arguments: actionArgs }),
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to send player action.');
                }
            } catch(e) {
                logEvent(`[ERROR] Failed to send action: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else { // Offline single-player mode with Rapier physics
            const body = entityBodyMapRef.current.get(playerId);
            if (!body) return logEvent(`[PHYSICS] Cannot control player ${playerId}: RigidBody not found.`);

            const currentRot = body.rotation();
            const eulerRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w), 'YXZ');
            const rotationY = eulerRot.y;

            const impulseStrength = 20.0;
            const torqueStrength = 5.0;

            if (toolName === 'Move Forward') {
                const impulse = { x: Math.sin(rotationY) * impulseStrength, y: 0, z: Math.cos(rotationY) * impulseStrength };
                body.applyImpulse(impulse, true);
            } else if (toolName === 'Move Backward') {
                const impulse = { x: -Math.sin(rotationY) * impulseStrength, y: 0, z: -Math.cos(rotationY) * impulseStrength };
                body.applyImpulse(impulse, true);
            } else if (toolName === 'Turn Left') {
                body.applyTorqueImpulse({ x: 0, y: torqueStrength, z: 0 }, true);
            } else if (toolName === 'Turn Right') {
                body.applyTorqueImpulse({ x: 0, y: -torqueStrength, z: 0 }, true);
            } else if (toolName === 'Aetheric Push') {
                const targetId = actionArgs.targetId;
                const targetBody = entityBodyMapRef.current.get(targetId);
                if (!targetBody) return logEvent(`[AETHERIC PUSH] Target ${targetId} not found.`);
                
                const playerPos = body.translation();
                const targetPos = targetBody.translation();
                const direction = { x: targetPos.x - playerPos.x, y: 0, z: targetPos.z - playerPos.z };
                const distance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
                
                if (distance > 0 && distance < 10) { // Max range of 10 units
                    const pushImpulse = {
                        x: (direction.x / distance) * 100.0,
                        y: 20.0, // Push upwards a bit
                        z: (direction.z / distance) * 100.0,
                    };
                    targetBody.applyImpulse(pushImpulse, true);
                    logEvent(`[ACTION] Unleashed an Aetheric Push on ${targetId}!`);
                } else {
                    logEvent(`[ACTION] Aetheric Push failed: ${targetId} is out of range.`);
                }
            }
        }
    }, [logEvent]);

    const runAIPilotTurn = useCallback(async () => {
        // AI Pilot logic remains the same, as it calls handleManualControl
    }, []);
    
    const startGameLoop = useCallback(() => {
        stopGameLoop(); 
        setIsLocalGameRunning(true);
        logEvent('[SYSTEM] Local physics-based game loop started.');
        
        gameLoopInterval = window.setInterval(() => {
            const world = worldRef.current;
            if (executeActionRef.current && world) {
                gameTickCountRef.current++;

                // --- PHYSICS-BASED NPC AI LOGIC ---
                const PATROLLER_SPEED = 5.0;
                const TARGET_RADIUS = 2.0;

                agentPersonalitiesRef.current.forEach(personality => {
                    if (personality.behaviorType === 'patroller') {
                        const body = entityBodyMapRef.current.get(personality.id);
                        if (!body || !body.isDynamic()) return;

                        let aiState = agentAIState.current.get(personality.id);
                        const currentPos = body.translation();
                        const distToTarget = aiState ? Math.hypot(aiState.target.x - currentPos.x, aiState.target.z - currentPos.z) : Infinity;

                        if (!aiState || distToTarget < TARGET_RADIUS) {
                            aiState = { target: getRandomTarget() };
                            agentAIState.current.set(personality.id, aiState);
                        }
                        
                        const targetPos = aiState.target;
                        const dx = targetPos.x - currentPos.x;
                        const dz = targetPos.z - currentPos.z;
                        const dist = Math.hypot(dx, dz);

                        if (dist > 0.1) {
                            const force = { x: (dx / dist) * PATROLLER_SPEED, y: 0, z: (dz / dist) * PATROLLER_SPEED };
                            body.addForce(force, true);

                            const currentVel = body.linvel();
                            if (Math.hypot(currentVel.x, currentVel.z) > 0.1) {
                                const targetAngle = Math.atan2(currentVel.x, currentVel.z);
                                const rot = body.rotation();
                                const currentAngle = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), 'YXZ').y;

                                let error = targetAngle - currentAngle;
                                while (error < -Math.PI) error += 2 * Math.PI;
                                while (error > Math.PI) error -= 2 * Math.PI;

                                const Kp_rot = 2.0; const Kd_rot = 0.5;
                                const angVel = body.angvel();
                                const torqueY = Kp_rot * error - Kd_rot * angVel.y;
                                body.addTorque({ x: 0, y: torqueY, z: 0 }, true);
                            }
                        }
                    }
                });

                world.step();

                // Read back physics state into React state
                const updatedPlayers = playersRef.current.map(p => {
                    const body = entityBodyMapRef.current.get(p.id);
                    if (!body) return p;
                    const pos = body.translation();
                    const bodyRot = body.rotation();
                    const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w), 'YXZ');
                    return { ...p, x: pos.x, y: pos.z, rotation: rot.y * 180 / Math.PI };
                });
                setPlayers(updatedPlayers);

                const updatedNpcs = Array.from(entityBodyMapRef.current.entries())
                    .map(([id, body]) => {
                         const existingNpc = robotStates.find(npc => npc.id === id);
                         if (!existingNpc) return null;
                         const pos = body.translation();
                         const bodyRot = body.rotation();
                         const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w), 'YXZ');
                         return { ...existingNpc, x: pos.x, y: pos.z, rotation: rot.y * 180 / Math.PI };
                    })
                    .filter(Boolean) as RobotState[];
                setRobotStates(updatedNpcs);
                
                executeActionRef.current({ name: 'Game Tick', arguments: {} }, 'local_game_engine', 'AETHERIUM_GAME');
            }
        }, 1000 / 60); // Run at 60 FPS for smooth physics
        
        aiPilotInterval = window.setInterval(runAIPilotTurn, 5000);
        logEvent('[SYSTEM] AI Familiar Pilot activated.');

    }, [logEvent, stopGameLoop, executeActionRef, runAIPilotTurn, robotStates, getRandomTarget]);
    
    const agentPersonalitiesRef = useRef(agentPersonalities);
    useEffect(() => { agentPersonalitiesRef.current = agentPersonalities; }, [agentPersonalities]);

    const initializeLocalWorld = useCallback(async (script: AIToolCall[], player: PlayerState) => {
        logEvent('[LOCAL] Initializing physics-based world...');
        stopGameLoop(); // Ensure everything is clean
        
        const RAPIER = await (window as any).rapierInitializationPromise;
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        worldRef.current = world;
        entityBodyMapRef.current.clear();
        agentAIState.current.clear();

        // Temporary state holders
        let tempPlayers: PlayerState[] = [];
        let tempNpcs: RobotState[] = [];
        let tempEnv: EnvironmentObject[] = [];
        let tempPerson: AgentPersonality[] = [];
        let tempCreatures: WorldCreature[] = [];

        // Run script to define entities, but don't set react state yet
        for (const step of script) {
            if (step.name === 'Define World Creature') {
                tempCreatures.push({ creatureId: step.arguments.creatureId, name: step.arguments.name, description: step.arguments.description, asset_glb: step.arguments.asset_glb });
            } else if (step.name === 'Define Robot Agent') {
                 const creatureId = step.arguments.id.split('_').slice(0, -1).join('_');
                 const creatureType = tempCreatures.find(c => c.creatureId === creatureId);
                 const asset = creatureType ? creatureType.asset_glb : step.arguments.asset_glb;
                 tempPerson.push({ id: step.arguments.id, startX: step.arguments.startX, startY: step.arguments.startY, behaviorType: step.arguments.behaviorType, targetId: step.arguments.targetId, asset_glb: asset });
                 tempNpcs.push({ id: step.arguments.id, x: step.arguments.startX, y: step.arguments.startY, rotation: 0, hasResource: false, powerLevel: 100 });
            } else if (step.name === 'Place Environment Object') {
                tempEnv.push({ id: step.arguments.objectId, type: step.arguments.type, x: step.arguments.x, y: step.arguments.y, asset_glb: step.arguments.asset_glb });
            }
        }
        
        // Now create Rapier bodies for all entities
        const groundColliderDesc = RAPIER.ColliderDesc.cuboid(50.0, 0.1, 50.0);
        world.createCollider(groundColliderDesc);

        [...tempNpcs, player].forEach(entity => {
            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(entity.x, 1, entity.y)
                .setLinearDamping(1.0)
                .setAngularDamping(1.0);
            const body = world.createRigidBody(bodyDesc);
            const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.5);
            world.createCollider(colliderDesc, body);
            entityBodyMapRef.current.set(entity.id, body);
        });

        tempEnv.forEach((obj, i) => {
            const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x, 1, obj.y);
            const body = world.createRigidBody(bodyDesc);
            const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 1.0, 0.5);
            world.createCollider(colliderDesc, body);
            entityBodyMapRef.current.set(obj.id || `env_${i}`, body);
        });
        
        // Now commit to React state
        setPlayers([player]);
        setRobotStates(tempNpcs);
        setAgentPersonalities(tempPerson);
        setEnvironmentState(tempEnv);
        setWorldCreatures(tempCreatures);
        setParties([]);
        setWorldEvents([]);

        startGameLoop();
        logEvent(`[SUCCESS] Physics-based session started for ${player.name}.`);
    }, [logEvent, startGameLoop, stopGameLoop, executeActionRef]);


    const disconnectFromShard = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        if (connectedServerInfo) {
            setConnectedServerInfo(null);
            logEvent('[SYSTEM] Disconnected from world shard.');
        }
    }, [logEvent, connectedServerInfo]);

    const connectToShard = useCallback(async (serverInfo: { processId: string, port: number }, playerState: PlayerState) => {
        logEvent(`[CLIENT] Connecting to ${serverInfo.processId}...`);
        
        let joinResponse: Response | null = null;
        let lastError: Error | null = null;
        const maxRetries = 5;
        const retryDelay = 500; // ms

        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                joinResponse = await fetch(`http://localhost:${serverInfo.port}/api/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerState }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (joinResponse.ok) { lastError = null; break; } 
                else { const errText = await joinResponse.text(); lastError = new Error(`Server responded with ${joinResponse.status}: ${errText}`); }
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                logEvent(`[CLIENT] Connection attempt ${i + 1} failed. Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        if (!joinResponse || !joinResponse.ok) {
            const finalError = lastError ? lastError.message : 'Failed to join server after multiple attempts.';
            throw new Error(finalError);
        }
        
        setConnectedServerInfo(serverInfo);
        
        const poll = async () => {
            try {
                const stateResponse = await fetch(`http://localhost:${serverInfo.port}/api/state`);
                if (stateResponse.ok) {
                    const state = await stateResponse.json();
                    setPlayers(state.players);
                    setRobotStates(state.npcs);
                    setEnvironmentState(state.environment);
                    setAgentPersonalities(state.agentPersonalities);
                    setParties(state.parties);
                    setWorldEvents(state.worldEvents);
                } else {
                    logEvent(`[WARN] Failed to poll state from ${serverInfo.processId}. Disconnecting.`);
                    disconnectFromShard();
                }
            } catch (e) {
                logEvent(`[ERROR] Lost connection to ${serverInfo.processId}. Disconnecting.`);
                disconnectFromShard();
            }
        };
        
        await poll(); // Initial poll
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = window.setInterval(poll, 1000);

        logEvent(`[CLIENT] Successfully joined ${serverInfo.processId} as ${playerState.name}.`);
    }, [logEvent, disconnectFromShard]);
    
    // FIX: Add a useEffect hook to synchronize the physics world with the game state.
    // When entities are removed from the game state (e.g., harvested), their corresponding
    // rigid bodies must also be removed from the Rapier simulation to prevent errors.
    useEffect(() => {
        const world = worldRef.current;
        if (!world || !isLocalGameRunning) return;

        const allCurrentEntityIds = new Set([
            ...robotStates.map(r => r.id),
            ...players.map(p => p.id),
        ]);

        // Remove bodies for entities that no longer exist in the state
        for (const [id, body] of entityBodyMapRef.current.entries()) {
            if (!allCurrentEntityIds.has(id)) {
                if (world.getRigidBody(body.handle)) {
                    world.removeRigidBody(body);
                }
                entityBodyMapRef.current.delete(id);
                logEvent(`[PHYSICS] Removed rigid body for despawned entity: ${id}`);
            }
        }

    }, [robotStates, players, isLocalGameRunning, logEvent]);


    const exitLocalWorld = useCallback(() => {
        stopGameLoop();
        disconnectFromShard();
        setPlayers([]);
        setRobotStates([]);
        setAgentPersonalities([]);
        setEnvironmentState([]);
        setParties([]);
        setWorldEvents([]);
        setWorldCreatures([]);
        logEvent('[SYSTEM] Session ended.');
    }, [stopGameLoop, disconnectFromShard, logEvent]);

    return {
        gameState: {
            robotStates,
            players,
            environmentState,
            agentPersonalities,
            isLocalGameRunning,
            connectedServerInfo,
            parties,
            worldEvents,
            worldCreatures,
            pilotMode,
            aiPilotTarget,
        },
        gameSetters: {
            setRobotStates,
            setPlayers,
            setEnvironmentState,
            setAgentPersonalities,
            setParties,
            setWorldEvents,
            setWorldCreatures,
            setPilotMode,
            setAiPilotTarget,
        },
        getGameStateForRuntime,
        handleManualControl,
        initializeLocalWorld,
        exitLocalWorld: exitLocalWorld,
        connectToShard,
        disconnectFromShard,
    };
};
