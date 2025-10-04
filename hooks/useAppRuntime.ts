// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import * as aiService from '../services/aiService';
import { getMcpCache, setMcpCache } from '../services/cacheService';
import { ModelProvider } from '../types';
import type {
    LLMTool, EnrichedAIResponse, NewToolPayload, AIToolCall,
    RobotState, EnvironmentObject, AIModel, APIConfig, ExecuteActionFunction,
    AgentPersonality, KnowledgeGraph, MainView, PlayerState, VaultItem, ServerInventoryItem, WorldEvent, WorldCreature
} from '../types';
import { INITIAL_LAYOUT_DATA } from './useKicadManager';

type UseAppRuntimeProps = {
    executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>; // Added to break circular dependency
    allToolsRef: React.MutableRefObject<LLMTool[]>;
    logEvent: (message: string) => void;
    generateMachineReadableId: (name: string, existingTools: LLMTool[]) => string;
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
    getKicadProjectState: () => any;
    // Contextual State Accessors & Setters
    robotSetters: any;
    gameSetters: any;
    getGameStateForRuntime: (agentId: string) => { robot: RobotState; players: PlayerState[]; robotStates: RobotState[]; environment: EnvironmentObject[]; personalities: AgentPersonality[]; gameTick: number; worldCreatures: WorldCreature[]; };
    // Knowledge Graph props
    getKnowledgeGraphState: () => KnowledgeGraph | null;
    setKnowledgeGraphState: React.Dispatch<React.SetStateAction<KnowledgeGraph | null>>;
    // Player State props
    playerManager: {
        addToVault: (vaultItem: Omit<VaultItem, 'id' | 'createdAt'>) => Promise<void>;
        hasBlueprint: (blueprintName: string) => boolean;
        updateInventory: (items: ServerInventoryItem[]) => Promise<void>;
        hasItems: (items: { name: string, quantity: number }[]) => boolean;
    };
    // AI Config props
    setApiCallCount: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    selectedModel: AIModel;
    apiConfig: APIConfig;
    generativeServiceConfig: { imageModel: string; ttsModel: string; ttsVoice: string; musicModel: string; };
    // Observation History
    observationHistory: AIToolCall[];
    setObservationHistory: React.Dispatch<React.SetStateAction<AIToolCall[]>>;
};

// FIX: This hook no longer returns a value; it populates a ref passed in via props to break a circular dependency.
export const useAppRuntime = (props: UseAppRuntimeProps): void => {
    const {
        executeActionRef, // Use passed-in ref
        allToolsRef, logEvent, generateMachineReadableId,
        isServerConnected, setTools,
        forceRefreshServerTools,
        // Kicad
        setPcbArtifacts, kicadLogEvent, setCurrentKicadArtifact,
        updateWorkflowChecklist, kicadSimulators,
        setLayoutHeuristics, updateLayout, getKicadProjectState,
        // Contextual Setters
        robotSetters, gameSetters, getGameStateForRuntime,
        // Knowledge Graph
        getKnowledgeGraphState, setKnowledgeGraphState,
        // Player
        playerManager,
        // AI Config
        setApiCallCount,
        selectedModel,
        apiConfig,
        generativeServiceConfig,
        // Observation
        observationHistory, setObservationHistory,
    } = props;

    const isServerConnectedRef = useRef(isServerConnected);
    useEffect(() => { isServerConnectedRef.current = isServerConnected; }, [isServerConnected]);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', 'runtime', code);
        return await executor(params, runtime);
    }, []);

    const getRuntimeApiForAgent = useCallback((agentId: string) => {
        return {
            logEvent: logEvent,
            tools: {
                run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                    if (!executeActionRef.current) throw new Error("Runtime not initialized.");
                    const toolToRun = allToolsRef.current.find(t => t.name === toolName);
                    if (!toolToRun) throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                    const finalArgs = toolToRun.parameters.some(p => p.name === 'agentId') ? { ...args, agentId } : args;
                    const result = await executeActionRef.current({ name: toolName, arguments: finalArgs }, agentId, 'AETHERIUM_GAME');
                    if (result.executionError) throw new Error(result.executionError);
                    return result.executionResult;
                },
                add: (newToolPayload: NewToolPayload): LLMTool => {
                    const allCurrentTools = allToolsRef.current;
                    const existingTool = allCurrentTools.find(t => t.name === newToolPayload.name);
                    if (existingTool) throw new Error(`Tool '${newToolPayload.name}' already exists.`);
                    const newId = generateMachineReadableId(newToolPayload.name, allCurrentTools);
                    const now = new Date().toISOString();
                    const newTool: LLMTool = { ...newToolPayload, id: newId, version: 1, createdAt: now, updatedAt: now };
                    setTools(prevTools => [...prevTools, newTool]);
                    return newTool;
                },
                list: (): LLMTool[] => allToolsRef.current,
            },
            player: {
                hasItems: playerManager.hasItems,
                hasBlueprint: playerManager.hasBlueprint,
                // Do not expose addToVault directly to agents, it should be a side-effect of a tool call result.
            },
            ai: {
                generateText: (prompt: string, systemInstruction: string, files: { name: string; type: string, data: string }[] = []): Promise<string> => {
                    logEvent(`[API CALL] Direct text generation requested by '${agentId}' using ${selectedModel.name}...`);
                    setApiCallCount(prev => ({ ...prev, [selectedModel.id]: (prev[selectedModel.id] || 0) + 1 }));
                    return aiService.generateTextResponse(prompt, systemInstruction, selectedModel, apiConfig, logEvent, files);
                },
                generateImages: async (prompt: string, imageModelIdFromTool?: string, contextImages_base64?: string[]): Promise<any> => {
                    const imageModelId = imageModelIdFromTool || generativeServiceConfig.imageModel || 'imagen-4.0-generate-001';
                    logEvent(`[API CALL] Image generation requested by '${agentId}' using ${imageModelId}...`);
                    setApiCallCount(prev => ({ ...prev, [imageModelId]: (prev[imageModelId] || 0) + 1 }));
                    const imageModel: AIModel = { id: imageModelId, name: imageModelId, provider: ModelProvider.GoogleAI };
                    return aiService.generateImages(prompt, imageModel, apiConfig, logEvent, contextImages_base64);
                },
                generateAudioStream: async (prompt: string, voice: string, context?: string, contextAudio_base64?: string, contextImage_base64?: string): Promise<any> => {
                    const modelId = 'gemini-2.5-flash-preview-tts';
                    logEvent(`[API CALL] Audio stream requested by '${agentId}' using ${modelId} with voice ${voice}...`);
                    setApiCallCount(prev => ({...prev, [modelId]: (prev[modelId] || 0) + 1}));
                    const audioModel: AIModel = { id: modelId, name: 'TTS (Flash)', provider: ModelProvider.GoogleAI };
                    return aiService.generateAudioStream(prompt, voice, audioModel, apiConfig, logEvent, context, contextAudio_base64, contextImage_base64);
                },
                connectToMusicSession: async (callbacks: any): Promise<any> => {
                    const modelId = "models/lyria-realtime-exp";
                    logEvent(`[API CALL] Music session connection requested by '${agentId}' using ${modelId}...`);
                    setApiCallCount(prev => ({...prev, [modelId]: (prev[modelId] || 0) + 1}));
                    const musicModel: AIModel = { id: modelId, name: 'Lyria', provider: ModelProvider.GoogleAI };
                    return aiService.connectToMusicSession(callbacks, musicModel, apiConfig, logEvent);
                },
            },
            isServerConnected: () => isServerConnectedRef.current,
            forceRefreshServerTools,
            getGameState: () => getGameStateForRuntime(agentId),
            getGenerativeConfig: () => generativeServiceConfig,
            getObservationHistory: () => observationHistory,
            clearObservationHistory: () => setObservationHistory([]),
        };
    }, [runToolImplementation, logEvent, setTools, generateMachineReadableId, forceRefreshServerTools, getGameStateForRuntime, playerManager, allToolsRef, selectedModel, apiConfig, setApiCallCount, executeActionRef, generativeServiceConfig, observationHistory, setObservationHistory]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string, context?: MainView): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allToolsRef.current.find(t => t.name === toolCall.name);

        if (!toolToExecute) {
            throw new Error(`Tool call failed for agent ${agentId}: Tool '${toolCall.name}' not found in the tool registry.`);
        }
        
        enrichedResult.tool = toolToExecute;
        
        const simSetters = context === 'AETHERIUM_GAME' ? gameSetters : (context === 'ROBOTICS' ? robotSetters : {});

        try {
            const { name: toolName, arguments: toolArgs } = toolCall;

            // --- Special Client-Side Tools (State Triggers) ---
            if (toolName === 'Update Workflow Checklist') {
                updateWorkflowChecklist(toolArgs.workflowStepName, toolArgs.checklistItems);
                enrichedResult.executionResult = { success: true, message: `UI checklist updated for step: ${toolArgs.workflowStepName}` };
            } else if (toolToExecute.category === 'Server') {
                if (!isServerConnectedRef.current) {
                    kicadLogEvent(`[SIM] Server not connected. Simulating '${toolName}'.`);
                    const simToolName = toolName.replace(/ /g, '_').toLowerCase();
                    const simulator = kicadSimulators[simToolName];
                    if (simulator) {
                        const simResult = simulator(toolArgs);
                        enrichedResult.executionResult = simResult;

                        if (simResult.newNode) updateLayout(prev => ({ ...(prev || INITIAL_LAYOUT_DATA), nodes: [...(prev?.nodes || []), simResult.newNode] }));
                        if (simResult.edges) updateLayout(prev => ({ ...(prev || INITIAL_LAYOUT_DATA), edges: [...(prev?.edges || []), ...simResult.edges] }));
                        if (simResult.rule) updateLayout(prev => ({ ...(prev || INITIAL_LAYOUT_DATA), rules: [...(prev?.rules || []), simResult.rule] }));
                        if (simResult.board_outline) updateLayout(prev => ({ ...(prev || INITIAL_LAYOUT_DATA), board_outline: simResult.board_outline }));
                        if (simResult.pour) updateLayout(prev => ({ ...(prev || INITIAL_LAYOUT_DATA), copper_pours: [...(prev?.copper_pours || []), simResult.pour] }));
                        if (simResult.heuristics) setLayoutHeuristics(prev => ({ ...(prev || {}), ...simResult.heuristics }));
                        if (simResult.artifacts) setPcbArtifacts({ ...simResult.artifacts, serverUrl: '' });
                        if (simResult.current_artifact) setCurrentKicadArtifact(simResult.current_artifact);
                    } else {
                        throw new Error(`Cannot execute server tool '${toolName}' while offline: no simulator available.`);
                    }
                } else {
                    const response = await fetch('http://localhost:3001/api/execute', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: toolName, arguments: toolArgs })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || `Server responded with status ${response.status}`);
                    enrichedResult.executionResult = result;
                    
                    if (result.artifacts) setPcbArtifacts({ ...result.artifacts, serverUrl: 'http://localhost:3001' });
                    if (result.layout_data) setCurrentKicadArtifact(null);
                    
                    const logMessage = result.message || `Tool '${toolToExecute.name}' executed.`;
                    logEvent(`[INFO] ✅ [SERVER] ${logMessage}`);
                }
            } else {
                 const runtime = getRuntimeApiForAgent(agentId);
                 const result = await runToolImplementation(toolToExecute.implementationCode, toolArgs, runtime);
                 enrichedResult.executionResult = result;

                 if (result?.heuristics) { setLayoutHeuristics(prev => ({ ...(prev || {}), ...result.heuristics })); }

                 const logMessage = result?.message || `Tool "${toolToExecute.name}" executed by ${agentId}.`;
                 logEvent(`[INFO] ✅ ${logMessage}`);
            }
            
            if (enrichedResult.executionResult?.blueprint) {
                await playerManager.addToVault(enrichedResult.executionResult.blueprint);
            }

        } catch (execError) {
            enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
            logEvent(`[ERROR] ❌ ${enrichedResult.executionError}`);
        }
        
        return enrichedResult;
    }, [getRuntimeApiForAgent, runToolImplementation, logEvent, gameSetters, robotSetters, allToolsRef, setTools, generateMachineReadableId, playerManager, getGameStateForRuntime, kicadSimulators, kicadLogEvent, updateLayout, setLayoutHeuristics, setPcbArtifacts, setCurrentKicadArtifact, updateWorkflowChecklist, selectedModel, apiConfig, setObservationHistory]);
    
    const runtimeApi = useMemo(() => {
        const api: ExecuteActionFunction = async (...args) => executeAction(...args);
        api.getRuntimeApiForAgent = getRuntimeApiForAgent;
        return api;
    }, [executeAction, getRuntimeApiForAgent]);

    executeActionRef.current = runtimeApi;
};
