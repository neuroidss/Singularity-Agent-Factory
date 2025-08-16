

import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import * as aiService from '../services/aiService';
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
    isServerConnected: boolean;
    setTools: React.Dispatch<React.SetStateAction<LLMTool[]>>;
    forceRefreshServerTools: () => Promise<{ success: boolean; count: number }>;
    // Kicad props
    setPcbArtifacts: (artifacts: any) => void;
    kicadLogEvent: (message: string) => void;
    setCurrentKicadArtifact: (artifact: any) => void;
    updateWorkflowChecklist: (stepName: string, items: string[]) => void;
    kicadSimulators: any;
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
        apiConfig, selectedModel, isServerConnected, setTools,
        forceRefreshServerTools,
        // Kicad
        setPcbArtifacts, kicadLogEvent, setCurrentKicadArtifact,
        updateWorkflowChecklist, kicadSimulators,
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
    }), [runToolImplementation, logEvent, setTools, setPcbArtifacts, generateMachineReadableId, allToolsRef, executeActionRef, setObservationHistory, getRobotStateForRuntime, forceRefreshServerTools]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allToolsRef.current.find(t => t.name === toolCall.name);

        if (!toolToExecute) throw new Error(`AI returned unknown tool name for agent ${agentId}: ${toolCall.name}`);
        
        enrichedResult.tool = toolToExecute;
        const runtime = getRuntimeApiForAgent(agentId);
        
        // --- ROBOTICS PRIMITIVE ACTIONS ---
        if (toolToExecute.category === 'Functional' && (toolToExecute.name.startsWith('Move') || toolToExecute.name.startsWith('Turn'))) {
            try {
                const { robot, environment } = getRobotStateForRuntime(agentId);
                let { x, y, rotation } = robot;
                let message = `Robot ${agentId} is already at a wall. Cannot move further.`;
                let moved = false;
        
                if (toolToExecute.name === 'Move Forward') {
                    let nextX = x, nextY = y;
                    if (rotation === 0) nextY -= 1; // Up
                    else if (rotation === 90) nextX += 1; // Right
                    else if (rotation === 180) nextY += 1; // Down
                    else if (rotation === 270) nextX -= 1; // Left
        
                    if (!environment.some(e => e.x === nextX && e.y === nextY && (e.type === 'wall' || e.type === 'tree'))) {
                        x = nextX; y = nextY;
                        message = `Robot ${agentId} moved forward to (${x}, ${y}).`;
                        moved = true;
                    }
                } else if (toolToExecute.name === 'Turn Left') {
                    rotation = (rotation - 90 + 360) % 360;
                    message = `Robot ${agentId} turned left. New rotation: ${rotation} degrees.`;
                    moved = true;
                } else if (toolToExecute.name === 'Turn Right') {
                    rotation = (rotation + 90) % 360;
                    message = `Robot ${agentId} turned right. New rotation: ${rotation} degrees.`;
                     moved = true;
                }
        
                if (moved) {
                    setRobotStates(prev => prev.map(r => r.id === agentId ? { ...r, x, y, rotation } : r));
                }
                enrichedResult.executionResult = { success: moved, message };
                logEvent(`[ROBOTICS] ${message}`);
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
                    const newStates = personalities.map(p => ({ id: p.id, x: p.startX, y: p.startY, rotation: 0, hasResource: false }));
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
            if (isServerConnectedRef.current) { // REAL SERVER
                try {
                    const response = await fetch('http://localhost:3001/api/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(toolCall)
                    });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.error || `Server responded with status ${response.status}`);
                    }
                    enrichedResult.executionResult = result;
                    logEvent(`[INFO] ✅ [SERVER] ${result.message || `Tool '${toolToExecute.name}' executed.`}`);
                } catch (execError) {
                    enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                    logEvent(`[ERROR] ❌ [SERVER] ${enrichedResult.executionError}`);
                }
            } else { // SIMULATION FALLBACK
                try {
                    let result;
                    // Determine which simulator to use based on the tool's name
                    const lowerCaseName = toolToExecute.name.toLowerCase();

                    if (lowerCaseName.includes('kicad')) {
                        const simKey = toolToExecute.name.replace(/KiCad /g, '').replace(/\\s/g, '_').toLowerCase();
                        if (kicadSimulators[simKey]) {
                            result = await kicadSimulators[simKey](toolCall.arguments);
                        } else {
                            throw new Error(`KiCad simulator for '${toolToExecute.name}' not implemented.`);
                        }
                    } else if (lowerCaseName.includes('strategic') || lowerCaseName.includes('directive')) {
                        if (toolToExecute.name === 'Read Strategic Memory') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            result = { success: true, message: "Read memory graph.", stdout: JSON.stringify(graph) };
                        } else if (toolToExecute.name === 'Define Strategic Directive') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            const newGraph = JSON.parse(JSON.stringify(graph));
                            const { id, label, parent } = toolCall.arguments;
                            if (newGraph.nodes.some(n => n.id === id)) throw new Error(`Directive '${id}' already exists.`);
                            newGraph.nodes.push({ id, label, type: 'directive' });
                            if (parent) newGraph.edges.push({ source: parent, target: id });
                            setKnowledgeGraphState(newGraph);
                            result = { success: true, message: `Directive '${label}' defined.`};
                        } else if (toolToExecute.name === 'Update Strategic Memory') {
                             result = { success: true, message: "Strategic memory updated via simulation." };
                        } else {
                            throw new Error(`Strategy simulator for '${toolToExecute.name}' not implemented.`);
                        }
                    } else {
                         throw new Error(`Server tool '${toolToExecute.name}' cannot be simulated. Please start the server.`);
                    }
                    
                    enrichedResult.executionResult = result;
                    const logMsg = result.stdout ? (JSON.parse(result.stdout).message || `Simulated '${toolToExecute.name}' executed.`) : (result.message || `Simulated '${toolToExecute.name}' executed.`);
                    logEvent(`[INFO] ✅ [SIM] ${logMsg}`);
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
            if (kicadResult) {
                let parsedResult = kicadResult;
                if (typeof kicadResult.stdout === 'string') {
                    try { parsedResult = JSON.parse(kicadResult.stdout); } catch (e) {}
                }

                if (parsedResult.message) kicadLogEvent(`✔️ ${parsedResult.message}`);
                
                if (parsedResult.artifacts) {
                    if (parsedResult.artifacts.fabZipPath && parsedResult.artifacts.glbPath) {
                        kicadLogEvent("🎉 Fabrication successful! Displaying final 3D model.");
                         setPcbArtifacts({ 
                            boardName: String(parsedResult.artifacts.boardName), 
                            glbPath: String(parsedResult.artifacts.glbPath), 
                            fabZipPath: String(parsedResult.artifacts.fabZipPath),
                            serverUrl: 'http://localhost:3001'
                         });
                        setCurrentKicadArtifact(null);
                    }
                }
                
                if (parsedResult.layout_data) {
                     if (enrichedResult.executionResult) {
                        enrichedResult.executionResult.stdout = `(Layout data received, see UI)`;
                     }
                }
            }
             if(enrichedResult.toolCall?.name) { kicadLogEvent(`⚙️ Agent ${agentId} called: ${enrichedResult.toolCall.name}`); }
             if(enrichedResult.executionError) { kicadLogEvent(`❌ ERROR: ${enrichedResult.executionError}`); }
        }

        return enrichedResult;
    }, [getRuntimeApiForAgent, runToolImplementation, logEvent, kicadLogEvent, setPcbArtifacts, setCurrentKicadArtifact, updateWorkflowChecklist, getRobotStateForRuntime, setRobotStates, setAgentPersonalities, kicadSimulators, getKnowledgeGraphState, setKnowledgeGraphState, isServerConnected]);
    
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
        try {
            const aiResponse = await aiService.generateResponse(prompt, systemInstruction, selectedModelRef.current, apiConfigRef.current, (progress) => logEvent(`[AI-PROGRESS] ${progress}`), relevantTools);
            if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) return aiResponse.toolCalls;
            logEvent(`[WARN] Agent ${agentId} did not return any tool calls.`);
            return null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logEvent(`[ERROR] Agent ${agentId} failed during AI generation: ${errorMessage}`);
            throw error;
        }
    }, [logEvent]);

    return { executeAction, executeActionRef, processRequest };
};