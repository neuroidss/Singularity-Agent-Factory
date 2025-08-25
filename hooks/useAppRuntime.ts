

import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import * as aiService from '../services/aiService';
import { getMcpCache, setMcpCache } from '../services/cacheService';
import type {
    LLMTool, EnrichedAIResponse, NewToolPayload, AIToolCall,
    RobotState, EnvironmentObject, AIModel, APIConfig, ExecuteActionFunction,
    AgentPersonality, KnowledgeGraph
} from '../types';
import { INITIAL_LAYOUT_DATA } from './useKicadManager';

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

type UseAppRuntimeReturn = {
    executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>;
    processRequest: (
        prompt: { text: string; files: any[] },
        systemInstruction: string,
        agentId: string,
        relevantTools: LLMTool[],
    ) => Promise<AIToolCall[] | null>;
};

export const useAppRuntime = (props: UseAppRuntimeProps): UseAppRuntimeReturn => {
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
        ai: {
            generateText: (prompt: string, systemInstruction: string) => {
                logEvent(`[AI SUB-CALL] Tool is calling LLM for analysis...`);
                return aiService.generateTextResponse(prompt, systemInstruction, selectedModelRef.current, apiConfigRef.current, (progress) => logEvent(`[AI-PROGRESS] ${progress}`));
            }
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

        try {
             if (toolToExecute.category === 'Server') {
                const sortedArgs = Object.keys(toolCall.arguments).sort().reduce((obj: Record<string, any>, key: string) => {
                    obj[key] = toolCall.arguments[key];
                    return obj;
                }, {});
                
                const projectAgnosticKicadTools = new Set(['Define KiCad Component']);
                
                let cacheKey: string;
    
                if (projectAgnosticKicadTools.has(toolCall.name)) {
                    const { projectName, ...argsForCache } = sortedArgs;
                    cacheKey = `${toolCall.name}::${JSON.stringify(argsForCache)}`;
                } else {
                    cacheKey = `${toolCall.name}::${JSON.stringify(sortedArgs)}`;
                }
    
                const cachedResult = await getMcpCache(cacheKey);
    
                if (isServerConnectedRef.current) { // REAL SERVER
                    if (cachedResult) {
                        logEvent(`[CACHE HIT] ✅ [SERVER] Using cached result for '${toolToExecute.name}'.`);
                        enrichedResult.executionResult = cachedResult;
                    } else {
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
                    }
                } else { // SIMULATION FALLBACK
                    let simResult;
                    const simKey = toolToExecute.name.replace(/KiCad /g, '').replace(/\s/g, '_').toLowerCase();
                    if (toolToExecute.name.toLowerCase().includes('kicad') && kicadSimulators[simKey]) {
                         simResult = await kicadSimulators[simKey](sortedArgs);
                    } else if (toolToExecute.name.toLowerCase().includes('strategic')) {
                        if (toolToExecute.name === 'Read Strategic Memory') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            simResult = { success: true, message: "Read memory graph.", stdout: JSON.stringify(graph) };
                        } else if (toolToExecute.name === 'Define Strategic Directive') {
                            const graph = getKnowledgeGraphState() || { nodes: [], edges: [] };
                            const newGraph = JSON.parse(JSON.stringify(graph));
                            const { id, label, parent } = sortedArgs;
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
                        enrichedResult.executionResult = simResult;
                        await setMcpCache(cacheKey, simResult);
                        const logMsg = simResult.stdout ? (JSON.parse(simResult.stdout).message || `Simulated '${toolToExecute.name}' executed.`) : (simResult.message || `Simulated '${toolToExecute.name}' executed.`);
                        logEvent(`[INFO] ✅ [SIM] ${logMsg}`);
                    }
                }
            } else if (toolToExecute.category === 'UI Component') {
                 enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
            } else { // Client-side Functional or Automation
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
            }
        } catch (execError) {
            enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
            logEvent(`[ERROR] ❌ ${enrichedResult.executionError}`);
        }

        const result = enrichedResult.executionResult;
        if (result) {
            // Atomically update layout state to prevent race conditions
            const layoutUpdates: Partial<KnowledgeGraph> = {};
            if (result.newNode) layoutUpdates.nodes = [result.newNode];
            if (result.edges) layoutUpdates.edges = result.edges;
            if (result.rule) layoutUpdates.rules = [result.rule];
            if (result.board_outline) layoutUpdates.board_outline = result.board_outline;

            if (Object.keys(layoutUpdates).length > 0) {
                updateLayout(prev => {
                    const newState = { ...(prev || INITIAL_LAYOUT_DATA) };
                    if (layoutUpdates.nodes) {
                        const prevNodes = Array.isArray(newState.nodes) ? newState.nodes : [];
                        const newNode = layoutUpdates.nodes[0];
                        newState.nodes = [...prevNodes.filter(n => n.id !== newNode.id), newNode];
                    }
                    if (layoutUpdates.edges) {
                        const prevEdges = Array.isArray(newState.edges) ? newState.edges : [];
                        newState.edges = [...prevEdges, ...layoutUpdates.edges];
                    }
                    if (layoutUpdates.rules) {
                        const prevRules = Array.isArray(newState.rules) ? newState.rules : [];
                        newState.rules = [...prevRules, ...layoutUpdates.rules];
                    }
                    if (layoutUpdates.board_outline) {
                        newState.board_outline = layoutUpdates.board_outline;
                    }
                    return newState;
                });
            }

            if (result.heuristics) {
                setLayoutHeuristics(prev => ({ ...prev, ...result.heuristics }));
            }
        }

        // --- KICAD-specific post-processing ---
        if (enrichedResult.toolCall?.name?.toLowerCase().includes('kicad')) {
            if (result && typeof result.stdout === 'string') {
                try {
                    const parsedStdout = JSON.parse(result.stdout);
                    enrichedResult.executionResult = { ...result, ...parsedStdout };
                } catch (e) { /* ignore if not json */ }
            }
            
            const finalKicadResult = enrichedResult.executionResult;

            if (finalKicadResult) {
                if (finalKicadResult.message) kicadLogEvent(`✔️ ${finalKicadResult.message}`);
                
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