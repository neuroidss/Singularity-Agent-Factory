



import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import * as aiService from '../services/aiService';
import { getMcpCache, setMcpCache } from '../services/cacheService';
import type {
    LLMTool, EnrichedAIResponse, NewToolPayload, AIToolCall,
    RobotState, EnvironmentObject, AIModel, APIConfig, ExecuteActionFunction,
    AgentPersonality, KnowledgeGraph
} from '../types';

type UseAppRuntimeProps = {
    allToolsRef: React.MutableRefObject<LLMTool[]>;
    logEvent: (message: string) => void;
    generateMachineReadableId: (name: string, existingTools: LLMTool[]) => string;
    apiConfig: APIConfig;
    selectedModel: AIModel;
    setApiCallCount: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    isServerConnected: boolean;
    setTools: React.Dispatch<React.SetStateAction<LLMTool[]>>;
    forceRefreshServerTools: () => Promise<{ success: boolean; count: number }>;
    // Kicad props
    setPcbArtifacts: (artifacts: any) => void;
    kicadLogEvent: (message: string) => void;
    setCurrentKicadArtifact: (artifact: any) => void;
    updateWorkflowChecklist: (stepName: string, items: string[]) => void;
    kicadSimulators: any;
    setLayoutHeuristics: React.Dispatch<React.SetStateAction<any>>;
    updateLayout: React.Dispatch<React.SetStateAction<KnowledgeGraph | null>>;
    // Robot props
    getRobotStateForRuntime: (agentId: string) => { robot: RobotState; environment: EnvironmentObject[], personalities: AgentPersonality[] };
    setRobotStates: React.Dispatch<React.SetStateAction<RobotState[]>>;
    setObservationHistory: React.Dispatch<React.SetStateAction<AIToolCall[]>>;
    setAgentPersonalities: React.Dispatch<React.SetStateAction<AgentPersonality[]>>;
    // Knowledge Graph props
    getKnowledgeGraphState: () => KnowledgeGraph | null;
    setKnowledgeGraphState: React.Dispatch<React.SetStateAction<KnowledgeGraph | null>>;
};

export const useAppRuntime = (props: UseAppRuntimeProps) => {
    const {
        allToolsRef, logEvent, generateMachineReadableId,
        apiConfig, selectedModel, setApiCallCount, isServerConnected, setTools,
        forceRefreshServerTools,
        // Kicad
        setPcbArtifacts, kicadLogEvent, setCurrentKicadArtifact,
        updateWorkflowChecklist, kicadSimulators,
        setLayoutHeuristics, updateLayout,
        // Robot
        getRobotStateForRuntime, setRobotStates, setObservationHistory, setAgentPersonalities,
        // Knowledge Graph
        getKnowledgeGraphState, setKnowledgeGraphState,
    } = props;
    
    const selectedModelRef = useRef(selectedModel);
    useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);

    const apiConfigRef = useRef(apiConfig);
    useEffect(() => { apiConfigRef.current = apiConfig; }, [apiConfig]);

    const isServerConnectedRef = useRef(isServerConnected);
    useEffect(() => { isServerConnectedRef.current = isServerConnected; }, [isServerConnected]);

    const executeActionRef = useRef<ExecuteActionFunction | null>(null);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', 'runtime', code);
        return await executor(params, runtime);
    }, []);

    const getRuntimeApiForAgent = useCallback((agentId: string) => ({
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                if (!executeActionRef.current) throw new Error("Runtime not initialized.");
                const toolToRun = allToolsRef.current.find(t => t.name === toolName);
                if (!toolToRun) throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                const finalArgs = toolToRun.parameters.some(p => p.name === 'agentId') ? { ...args, agentId } : args;
                const result = await executeActionRef.current({ name: toolName, arguments: finalArgs }, agentId);
                if (result.executionError) throw new Error(result.executionError);
                return result.executionResult;
            },
            add: (newToolPayload: NewToolPayload): LLMTool => {
                const allCurrentTools = allToolsRef.current;
                const existingTool = allCurrentTools.find(t => t.name === newToolPayload.name);

                if (existingTool && existingTool.category !== 'Server') {
                    const updatedTool = {
                        ...existingTool,
                        ...newToolPayload,
                        version: existingTool.version + 1,
                        updatedAt: new Date().toISOString(),
                    };
                    setTools(prevTools => prevTools.map(t => t.id === existingTool.id ? updatedTool : t));
                    logEvent(`[INFO] 🔄 Tool '${newToolPayload.name}' already existed and was updated to v${updatedTool.version}.`);
                    return updatedTool;
                }
                
                if (existingTool && existingTool.category === 'Server') {
                     throw new Error(`Cannot create client tool '${newToolPayload.name}' because a server tool with the same name already exists.`);
                }

                const newId = generateMachineReadableId(newToolPayload.name, allCurrentTools);
                const now = new Date().toISOString();
                const newTool: LLMTool = {
                    ...newToolPayload,
                    id: newId,
                    version: 1,
                    createdAt: now,
                    updatedAt: now,
                };
                setTools(prevTools => [...prevTools, newTool]);
                return newTool;
            },
            list: (): LLMTool[] => allToolsRef.current,
        },
        isServerConnected: () => isServerConnectedRef.current,
        forceRefreshServerTools,
        updatePcbArtifacts: setPcbArtifacts,
        // Robotics-specific runtime APIs
        getObservationHistory: () => {
            let history: AIToolCall[] = [];
            setObservationHistory(currentHistory => {
                history = currentHistory;
                return currentHistory;
            });
            return history;
        },
        clearObservationHistory: () => setObservationHistory([]),
        getRobotSimState: () => getRobotStateForRuntime(agentId),
    }), [runToolImplementation, logEvent, setTools, setPcbArtifacts, generateMachineReadableId, setObservationHistory, getRobotStateForRuntime, forceRefreshServerTools]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allToolsRef.current.find(t => t.name === toolCall.name);

        if (!toolToExecute) throw new Error(`AI returned unknown tool name for agent ${agentId}: ${toolCall.name}`);
        
        enrichedResult.tool = toolToExecute;
        const runtime = getRuntimeApiForAgent(agentId);

        // --- SPECIAL DEMO-MODE CLIENT TOOLS ---
        if (toolToExecute.name.startsWith('Demo: ')) {
            if (toolToExecute.name.startsWith('Demo: Add')) {
                 const ruleType = toolToExecute.name.replace('Demo: Add ', '');
                 const rule: any = { type: ruleType, ...toolCall.arguments, enabled: true };
                 
                 // The python script expects 'componentReference' but the simulation uses 'component'.
                 if(rule.componentReference) {
                    rule.component = rule.componentReference;
                    delete rule.componentReference;
                 }
                
                 // NOTE: The direct call to addLayoutRule is removed from here. The caller is responsible.
                 enrichedResult.executionResult = { success: true, message: `Rule '${rule.type}' added to simulation.`, rule: rule };
                 return enrichedResult;
            }
            if (toolToExecute.name === 'Demo: Set Simulation Heuristics') {
                setLayoutHeuristics(prev => ({ ...prev, ...toolCall.arguments }));
                enrichedResult.executionResult = { success: true, message: 'Simulation heuristics updated.' };
                return enrichedResult;
            }
        }
        
        // --- ROBOTICS PRIMITIVE ACTIONS ---
        if (toolToExecute.category === 'Functional' && (toolToExecute.name.startsWith('Move') || toolToExecute.name.startsWith('Turn'))) {
            try {
                const { robot, environment } = getRobotStateForRuntime(toolCall.arguments.agentId);
                let { x, y, rotation, powerLevel } = robot;
                let message = `Robot ${toolCall.arguments.agentId} is blocked. Cannot move further.`;
                let moved = false;
        
                if (toolToExecute.name === 'Move Forward') {
                    let nextX = x, nextY = y;
                    if (rotation === 0) nextY -= 1; // Up
                    else if (rotation === 90) nextX += 1; // Right
                    else if (rotation === 180) nextY += 1; // Down
                    else if (rotation === 270) nextX -= 1; // Left
        
                    if (!environment.some(e => e.x === nextX && e.y === nextY && (e.type === 'wall' || e.type === 'tree' || e.type === 'rough_terrain'))) {
                        x = nextX; y = nextY;
                        message = `Robot ${toolCall.arguments.agentId} moved forward to (${x}, ${y}).`;
                        moved = true;
                    }
                } else if (toolToExecute.name === 'Move Backward') {
                    let nextX = x, nextY = y;
                    if (rotation === 0) nextY += 1; // Down
                    else if (rotation === 90) nextX -= 1; // Left
                    else if (rotation === 180) nextY -= 1; // Up
                    else if (rotation === 270) nextX += 1; // Right
        
                    if (!environment.some(e => e.x === nextX && e.y === nextY && (e.type === 'wall' || e.type === 'tree' || e.type === 'rough_terrain'))) {
                        x = nextX; y = nextY;
                        message = `Robot ${toolCall.arguments.agentId} moved backward to (${x}, ${y}).`;
                        moved = true;
                    }
                } else if (toolToExecute.name === 'Turn Left') {
                    rotation = (rotation - 90 + 360) % 360;
                    message = `Robot ${toolCall.arguments.agentId} turned left. New rotation: ${rotation} degrees.`;
                    moved = true;
                } else if (toolToExecute.name === 'Turn Right') {
                    rotation = (rotation + 90) % 360;
                    message = `Robot ${toolCall.arguments.agentId} turned right. New rotation: ${rotation} degrees.`;
                     moved = true;
                }
        
                if (moved) {
                    // All actions consume power
                    powerLevel = Math.max(0, powerLevel - 2); // Movement is costly
                    setRobotStates(prev => prev.map(r => r.id === toolCall.arguments.agentId ? { ...r, x, y, rotation, powerLevel } : r));
                }
                enrichedResult.executionResult = { success: moved, message };
                // Do not log manual control spam
                // logEvent(`[ROBOTICS] ${message}`);
            } catch (e) {
                enrichedResult.executionError = e instanceof Error ? e.message : String(e);
            }
            return enrichedResult;
        }

        // --- ROBOTICS SIMULATION CONTROL ---
        if (toolToExecute.name.includes('Robot Simulation')) {
             if (toolToExecute.name === 'Start Robot Simulation') {
                setRobotStates(prev => {
                    const personalities = runtime.getRobotSimState().personalities;
                    const newStates = personalities.map(p => ({ id: p.id, x: p.startX, y: p.startY, rotation: 0, hasResource: false, powerLevel: 100 }));
                    return newStates;
                });
                enrichedResult.executionResult = { success: true, message: 'Robotics simulation started.' };
            } else if (toolToExecute.name === 'Stop Robot Simulation') {
                setRobotStates([]);
                setAgentPersonalities([]);
                enrichedResult.executionResult = { success: true, message: 'Robotics simulation stopped and reset.' };
            } else if (toolToExecute.name === 'Step Robot Simulation') {
                enrichedResult.executionResult = { success: true, message: 'Simulated one step for all agents.' };
                logEvent(`[ROBOTICS] Stepped simulation forward.`);
            }
            return enrichedResult;
        }

        // --- ROBOTICS AGENT DEFINITION ---
        if (toolToExecute.name === 'Define Robot Agent') {
             const newPersonality: AgentPersonality = toolCall.arguments as any;
             setAgentPersonalities(prev => [...prev.filter(p => p.id !== newPersonality.id), newPersonality]);
             enrichedResult.executionResult = { success: true, message: `Defined personality for agent ${newPersonality.id}` };
             return enrichedResult;
        }

        // --- KICAD SIMULATION HEURISTICS ---
        if (toolToExecute.name === 'Set Simulation Heuristics') {
            try {
                setLayoutHeuristics(prev => ({ ...prev, ...toolCall.arguments }));
                enrichedResult.executionResult = { success: true, message: 'Simulation heuristics updated.', heuristics: toolCall.arguments };
                return enrichedResult;
            } catch (e) {
                enrichedResult.executionError = e instanceof Error ? e.message : String(e);
                return enrichedResult;
            }
        }
        
        // --- KICAD WORKFLOW CHECKLIST ---
        if (toolToExecute.name === 'Update Workflow Checklist') {
             try {
                const { workflowStepName, checklistItems } = toolCall.arguments;
                // The AI returns array parameters as a JSON string. We must parse it.
                const itemsArray = typeof checklistItems === 'string' ? JSON.parse(checklistItems) : checklistItems;

                if (!Array.isArray(itemsArray)) {
                    throw new Error(`'checklistItems' for '${workflowStepName}' is not a valid array.`);
                }

                updateWorkflowChecklist(workflowStepName, itemsArray);
                enrichedResult.executionResult = { success: true, message: `Checklist updated for '${workflowStepName}'.`};
                logEvent(`[INFO] ✅ Agent provided a plan for '${workflowStepName}' with ${itemsArray.length} items.`);
                return enrichedResult;
             } catch (e) {
                enrichedResult.executionError = e instanceof Error ? e.message : String(e);
                logEvent(`[ERROR] ❌ Failed to update workflow checklist: ${enrichedResult.executionError}`);
                return enrichedResult;
             }
        }
        
        // --- SERVER TOOL EXECUTION (REAL & SIMULATED) ---
        if (toolToExecute.category === 'Server') {
            const sortedArgs = Object.keys(toolCall.arguments).sort().reduce((obj: Record<string, any>, key: string) => {
                obj[key] = toolCall.arguments[key];
                return obj;
            }, {});
            
            // Caching strategy: By default, cache keys include all arguments.
            // For project-specific KiCad tools, this is correct as 'projectName' is part of the arguments.
            // For project-agnostic tools (like component asset generation), we must explicitly
            // remove 'projectName' from the arguments before creating the cache key.
            const projectAgnosticKicadTools = new Set([
                'Define KiCad Component'
            ]);
            
            let cacheKey: string;

            if (projectAgnosticKicadTools.has(toolCall.name)) {
                // For these tools, the cache key should NOT include the project name.
                const { projectName, ...argsForCache } = sortedArgs;
                cacheKey = `${toolCall.name}::${JSON.stringify(argsForCache)}`;
            } else {
                // For all other tools, the cache key is based on the full arguments.
                // If 'projectName' is present, it will be included, ensuring project-specific caching.
                cacheKey = `${toolCall.name}::${JSON.stringify(sortedArgs)}`;
            }

            const cachedResult = await getMcpCache(cacheKey);

            if (isServerConnectedRef.current) { // REAL SERVER
                if (cachedResult) {
                    logEvent(`[CACHE HIT] ✅ [SERVER] Using cached result for '${toolToExecute.name}'.`);
                    enrichedResult.executionResult = cachedResult;
                } else {
                    try {
                        const response = await fetch('http://localhost:3001/api/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: toolCall.name, arguments: sortedArgs })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                            throw new Error(result.error || `Server responded with status ${response.status}`);
                        }
                        enrichedResult.executionResult = result;
                        await setMcpCache(cacheKey, result);
                        logEvent(`[INFO] ✅ [SERVER] ${result.message || `Tool '${toolToExecute.name}' executed.`}`);
                    } catch (execError) {
                        enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                        logEvent(`[ERROR] ❌ [SERVER] ${enrichedResult.executionError}`);
                    }
                }
            } else { // SIMULATION FALLBACK
                try {
                    // Always run the simulator to update ephemeral React state (like kicadProjectState).
                    // This is crucial for workflows to function correctly across page reloads when using the cache.
                    let simResult;
                    const simKey = toolToExecute.name.replace(/KiCad /g, '').replace(/\s/g, '_').toLowerCase();
                    if (toolToExecute.name.toLowerCase().includes('kicad') && kicadSimulators[simKey]) {
                         // Pass the full sorted arguments to the simulator.
                         simResult = await kicadSimulators[simKey](sortedArgs);
                    } else if (toolToExecute.name.toLowerCase().includes('strategic')) {
                        if (toolToExecute.name === 'Read Strategic Memory') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            simResult = { success: true, message: "Read memory graph.", stdout: JSON.stringify(graph) };
                        } else if (toolToExecute.name === 'Define Strategic Directive') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            const newGraph = JSON.parse(JSON.stringify(graph));
                            const { id, label, parent } = sortedArgs; // Use sorted args
                            if (newGraph.nodes.some(n => n.id === id)) throw new Error(`Directive '${id}' already exists.`);
                            newGraph.nodes.push({ id, label, type: 'directive' });
                            if (parent) newGraph.edges.push({ source: parent, target: id });
                            setKnowledgeGraphState(newGraph);
                            simResult = { success: true, message: `Directive '${label}' defined.`};
                        } else if (toolToExecute.name === 'Update Strategic Memory') {
                             simResult = { success: true, message: "Strategic memory updated via simulation." };
                        } else {
                            throw new Error(`Strategy simulator for '${toolToExecute.name}' not implemented.`);
                        }
                    } else {
                         throw new Error(`Server tool '${toolToExecute.name}' cannot be simulated. Please start the server.`);
                    }

                    if (cachedResult) {
                        logEvent(`[CACHE HIT] ✅ [SIM] Using cached result for '${toolToExecute.name}'.`);
                        enrichedResult.executionResult = cachedResult;
                    } else {
                        // First run: use the simulator's result and cache it.
                        enrichedResult.executionResult = simResult;
                        await setMcpCache(cacheKey, simResult);
                        const logMsg = simResult.stdout ? (JSON.parse(simResult.stdout).message || `Simulated '${toolToExecute.name}' executed.`) : (simResult.message || `Simulated '${toolToExecute.name}' executed.`);
                        logEvent(`[INFO] ✅ [SIM] ${logMsg}`);
                    }
                } catch (execError) {
                     enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                     logEvent(`[ERROR] ❌ [SIM] ${enrichedResult.executionError}`);
                }
            }
        } else if (toolToExecute.category === 'UI Component') {
             enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else { // Client-side Functional or Automation
            try {
                const finalArgs = { ...toolCall.arguments };
                for (const param of toolToExecute.parameters) {
                    if ((param.type === 'array' || param.type === 'object') && typeof finalArgs[param.name] === 'string') {
                        try {
                            finalArgs[param.name] = JSON.parse(finalArgs[param.name]);
                        } catch (e) {
                            console.warn(`Could not auto-parse argument '${param.name}' for tool '${toolToExecute.name}' as JSON. Passing it as a string.`);
                        }
                    }
                }
                
                const result = await runToolImplementation(toolToExecute.implementationCode, finalArgs, runtime);
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ ${result?.message || `Tool "${toolToExecute.name}" executed by ${agentId}.`}`);
            } catch (execError) {
                enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                logEvent(`[ERROR] ❌ ${enrichedResult.executionError}`);
            }
        }

        // --- KICAD POST-PROCESSING ---
        if (enrichedResult.toolCall?.name?.toLowerCase().includes('kicad')) {
            const kicadResult = enrichedResult.executionResult;
            console.log('[DEBUG] KICAD POST-PROCESSING: Raw result from tool execution:', JSON.stringify(kicadResult, null, 2));

            if (kicadResult && typeof kicadResult.stdout === 'string') {
                console.log('[DEBUG] KICAD POST-PROCESSING: Found stdout string. Attempting to parse.');
                try {
                    const parsedStdout = JSON.parse(kicadResult.stdout);
                    console.log('[DEBUG] KICAD POST-PROCESSING: Parsed stdout:', JSON.stringify(parsedStdout, null, 2));
                    enrichedResult.executionResult = { ...kicadResult, ...parsedStdout };
                } catch (e) {
                    console.log('[DEBUG] KICAD POST-PROCESSING: Failed to parse stdout as JSON.', e);
                }
            }
            
            const finalKicadResult = enrichedResult.executionResult;
            console.log('[DEBUG] KICAD POST-PROCESSING: Final result object:', JSON.stringify(finalKicadResult, null, 2));

            if (finalKicadResult) {
                if (finalKicadResult.message) kicadLogEvent(`✔️ ${finalKicadResult.message}`);
                
                if (finalKicadResult.rule) {
                    console.log('[DEBUG] KICAD POST-PROCESSING: Found "rule" property.');
                    logEvent(`[RUNTIME] Propagating rule from server to client state: ${finalKicadResult.rule.type}`);
                } else {
                     console.log('[DEBUG] KICAD POST-PROCESSING: "rule" property NOT found in final result.');
                }

                if (finalKicadResult.outline) {
                    kicadLogEvent(`[SIM] Board outline defined. Updating view.`);
                    const { shape, boardWidthMillimeters, boardHeightMillimeters, diameterMillimeters } = finalKicadResult.outline;
                    const isAutoSize = !boardWidthMillimeters && !boardHeightMillimeters && !diameterMillimeters;

                    const width = boardWidthMillimeters || diameterMillimeters || (isAutoSize ? 1.6 : 50);
                    const height = boardHeightMillimeters || diameterMillimeters || (isAutoSize ? 1.6 : 50);
                    
                    const newOutline = {
                        shape: shape || 'rectangle',
                        width: width,
                        height: height,
                        x: -width / 2,
                        y: -height / 2,
                        autoSize: isAutoSize,
                    };

                    updateLayout(prev => ({
                        ...(prev || { nodes: [], edges: [], rules: [] }),
                        board_outline: newOutline
                    }));
                }
                
                if (finalKicadResult.artifacts) {
                    if (finalKicadResult.artifacts.fabZipPath && finalKicadResult.artifacts.glbPath) {
                        kicadLogEvent("🎉 Fabrication successful! Displaying final 3D model.");
                         setPcbArtifacts({ 
                            boardName: String(finalKicadResult.artifacts.boardName), 
                            glbPath: String(finalKicadResult.artifacts.glbPath), 
                            fabZipPath: String(finalKicadResult.artifacts.fabZipPath),
                            serverUrl: 'http://localhost:3001'
                         });
                        setCurrentKicadArtifact(null);
                    }
                }
                
                if (finalKicadResult.layout_data && enrichedResult.executionResult) {
                     enrichedResult.executionResult.stdout = `(Layout data received, see UI)`;
                }
            }
             if(enrichedResult.toolCall?.name) { kicadLogEvent(`⚙️ Agent ${agentId} called: ${enrichedResult.toolCall.name}`); }
             if(enrichedResult.executionError) { kicadLogEvent(`❌ ERROR: ${enrichedResult.executionError}`); }
        }

        return enrichedResult;
    }, [getRuntimeApiForAgent, runToolImplementation, logEvent, kicadLogEvent, setPcbArtifacts, setCurrentKicadArtifact, updateWorkflowChecklist, getRobotStateForRuntime, setRobotStates, setAgentPersonalities, kicadSimulators, getKnowledgeGraphState, setKnowledgeGraphState, isServerConnected, setLayoutHeuristics, updateLayout]);
    
    const runtimeApi = useMemo(() => {
        const api: ExecuteActionFunction = async (...args) => executeAction(...args);
        api.getRuntimeApiForAgent = getRuntimeApiForAgent;
        return api;
    }, [executeAction, getRuntimeApiForAgent]);

    useEffect(() => {
        executeActionRef.current = runtimeApi;
    }, [runtimeApi]);
    
    const processRequest = useCallback(async (
        prompt: { text: string; files: any[] },
        systemInstruction: string,
        agentId: string,
        relevantTools: LLMTool[],
    ): Promise<AIToolCall[] | null> => {
        logEvent(`[API CALL] Agent ${agentId} is thinking...`);
        setApiCallCount(prev => ({ ...prev, [selectedModelRef.current.id]: (prev[selectedModelRef.current.id] || 0) + 1 }));
        try {
            const aiResponse = await aiService.generateResponse(prompt, systemInstruction, selectedModelRef.current, apiConfigRef.current, (progress) => logEvent(`[AI-PROGRESS] ${progress}`), relevantTools);
            if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) return aiResponse.toolCalls;
            logEvent(`[WARN] Agent ${agentId} did not choose any tool calls.`);
            return null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);            
            logEvent(`[ERROR] Agent ${agentId} failed during AI generation: ${errorMessage.replace(/API key not valid. Please pass a valid API key./, 'Invalid API Key provided.')}`);
            throw error;
        }
    }, [logEvent, setApiCallCount]);

    return { executeActionRef, processRequest };
};