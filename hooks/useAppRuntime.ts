
import React, { useCallback, useRef, useEffect } from 'react';
import { SERVER_URL } from '../App';
import * as aiService from '../services/aiService';
import type {
    LLMTool, EnrichedAIResponse, NewToolPayload, AIToolCall,
    RobotState, EnvironmentObject, AIModel, APIConfig
} from '../types';

type UseAppRuntimeProps = {
    allToolsRef: React.MutableRefObject<LLMTool[]>;
    isServerConnected: boolean;
    logEvent: (message: string) => void;
    fetchServerTools: () => Promise<LLMTool[]>;
    generateMachineReadableId: (name: string, existingTools: LLMTool[]) => string;
    apiConfig: APIConfig;
    selectedModel: AIModel;
    robotState: {
        robotStates: RobotState[];
        environmentState: EnvironmentObject[];
        observationHistory: AIToolCall[];
    };
    robotSetters: {
        setRobotStates: React.Dispatch<React.SetStateAction<RobotState[]>>;
        setEnvironmentState: React.Dispatch<React.SetStateAction<EnvironmentObject[]>>;
        setObservationHistory: React.Dispatch<React.SetStateAction<AIToolCall[]>>;
    };
    getRobotStateForRuntime: (agentId: string) => { robot: RobotState; environment: EnvironmentObject[] };
    setTools: React.Dispatch<React.SetStateAction<LLMTool[]>>;
    setPcbArtifacts: (artifacts: any) => void;
    kicadLogEvent: (message: string) => void;
    setCurrentKicadArtifact: (artifact: any) => void;
};

export const useAppRuntime = (props: UseAppRuntimeProps) => {
    const {
        allToolsRef, isServerConnected, logEvent, fetchServerTools, generateMachineReadableId,
        apiConfig, selectedModel,
        robotState, robotSetters, getRobotStateForRuntime,
        setTools, setPcbArtifacts,
        kicadLogEvent, setCurrentKicadArtifact
    } = props;

    const executeActionRef = useRef<any>(null);
    
    // Add refs for changing dependencies of processRequest
    const selectedModelRef = useRef(selectedModel);
    useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);

    const apiConfigRef = useRef(apiConfig);
    useEffect(() => { apiConfigRef.current = apiConfig; }, [apiConfig]);


    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', 'runtime', code);
        return await executor(params, runtime);
    }, []);

    const getRuntimeApi = useCallback((agentId: string) => ({
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                const toolToRun = allToolsRef.current.find(t => t.name === toolName);
                if (!toolToRun) throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                const result = await executeActionRef.current({ name: toolName, arguments: args }, agentId);
                if (result.executionError) throw new Error(result.executionError);
                return result.executionResult;
            },
            add: (newToolPayload: NewToolPayload): LLMTool => {
                const currentTools = allToolsRef.current;
                if (currentTools.find(t => t.name === newToolPayload.name)) throw new Error(`A tool with the name '${newToolPayload.name}' already exists.`);
                const newId = generateMachineReadableId(newToolPayload.name, currentTools);
                const now = new Date().toISOString();
                const completeTool: LLMTool = { ...newToolPayload, id: newId, version: 1, createdAt: now, updatedAt: now };
                setTools(prevTools => [...prevTools, completeTool]);
                return completeTool;
            },
            list: (): LLMTool[] => allToolsRef.current,
        },
        server: {
            isConnected: () => isServerConnected,
            getUrl: () => SERVER_URL,
            createTool: async (newToolPayload: NewToolPayload): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot create server tool: Backend server is not connected.");
                const response = await fetch(`${SERVER_URL}/api/tools/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newToolPayload) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Server failed to create or update tool');
                await fetchServerTools();
                return { success: true, message: result.message };
            },
            writeFile: async (filePath: string, content: string): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot write file: The backend server is not connected.");
                const response = await fetch(`${SERVER_URL}/api/files/write`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath, content }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Server failed to write file');
                logEvent(`[INFO] ✅ [SERVER] Successfully wrote file: ${filePath}`);
                return result;
            },
        },
        fetchServerTools: fetchServerTools,
        robot: {
            getState: () => getRobotStateForRuntime(agentId),
            moveForward: () => new Promise<any>((resolve, reject) => {
                robotSetters.setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) { reject(new Error(`Robot for agent ${agentId} not found.`)); return prevStates; }
                    const robot = prevStates[robotIndex];
                    let { x, y } = robot;
                    if (robot.rotation === 0) y -= 1; if (robot.rotation === 90) x += 1; if (robot.rotation === 180) y += 1; if (robot.rotation === 270) x -= 1;
                    if (robotState.environmentState.some(obj => obj.x === x && obj.y === y && (obj.type === 'wall' || obj.type === 'tree'))) { reject(new Error(`Agent ${agentId} Move failed: Collision with environment.`)); return prevStates; }
                    if (prevStates.some(r => r.id !== agentId && r.x === x && r.y === y)) { reject(new Error(`Agent ${agentId} Move failed: Collision with another robot.`)); return prevStates; }
                    const newStates = [...prevStates];
                    newStates[robotIndex] = { ...robot, x, y };
                    resolve({ success: true, message: `Agent ${agentId} moved forward to (${x}, ${y})`});
                    return newStates;
                });
            }),
            turn: (direction: 'left' | 'right') => new Promise<any>((resolve, reject) => {
                robotSetters.setRobotStates(prev => {
                    const robotIndex = prev.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) { reject(new Error(`Agent ${agentId} not found for turn operation.`)); return prev; }
                    const newStates = [...prev];
                    const robot = newStates[robotIndex];
                    newStates[robotIndex] = { ...robot, rotation: (robot.rotation + (direction === 'left' ? -90 : 90) + 360) % 360 };
                    resolve({ success: true, message: `Agent ${agentId} turned ${direction}.` });
                    return newStates;
                });
            }),
            pickupResource: () => new Promise<any>((resolve, reject) => {
                robotSetters.setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) { reject(new Error(`Robot for agent ${agentId} not found.`)); return prevStates; }
                    const robot = prevStates[robotIndex];
                    const resourceObj = robotState.environmentState.find(obj => obj.type === 'resource');
                    if (robot.hasResource) { reject(new Error(`Pickup failed: Agent ${agentId} is already carrying a resource.`)); return prevStates; }
                    if (resourceObj && resourceObj.x === robot.x && resourceObj.y === robot.y) {
                        const newStates = [...prevStates];
                        newStates[robotIndex] = {...robot, hasResource: true};
                        robotSetters.setEnvironmentState(prevEnv => prevEnv.filter(obj => obj.type !== 'resource'));
                        resolve({ success: true, message: `Agent ${agentId} picked up resource.` });
                        return newStates;
                    }
                    reject(new Error(`Pickup failed: Agent ${agentId} is not at the resource location.`));
                    return prevStates;
                });
            }),
            deliverResource: () => new Promise<any>((resolve, reject) => {
                 robotSetters.setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) { reject(new Error(`Robot for agent ${agentId} not found.`)); return prevStates; }
                    const robot = prevStates[robotIndex];
                    const collectionPointObj = robotState.environmentState.find(obj => obj.type === 'collection_point');
                    if (!robot.hasResource) { reject(new Error(`Delivery failed: Agent ${agentId} is not carrying a resource.`)); return prevStates; }
                    if (collectionPointObj && collectionPointObj.x === robot.x && collectionPointObj.y === robot.y) {
                        const newStates = [...prevStates];
                        newStates[robotIndex] = {...robot, hasResource: false};
                        logEvent(`[SUCCESS] Agent ${agentId} delivered the resource.`);
                        resolve({ success: true, message: `Agent ${agentId} delivered resource.` });
                        return newStates;
                    }
                    reject(new Error(`Delivery failed: Agent ${agentId} is not at the collection point.`));
                    return prevStates;
                 });
            })
        },
        getObservationHistory: () => robotState.observationHistory,
        clearObservationHistory: () => robotSetters.setObservationHistory([]),
        updatePcbArtifacts: setPcbArtifacts,
    }), [runToolImplementation, robotState, robotSetters, logEvent, isServerConnected, fetchServerTools, getRobotStateForRuntime, setTools, setPcbArtifacts, generateMachineReadableId]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allToolsRef.current.find(t => t.name === toolCall.name);

        if (!toolToExecute) throw new Error(`AI returned unknown tool name for agent ${agentId}: ${toolCall.name}`);
        
        enrichedResult.tool = toolToExecute;
        const runtime = getRuntimeApi(agentId);

        if (toolToExecute.category === 'Server') {
            if (!isServerConnected) {
                enrichedResult.executionError = `Cannot execute server tool '${toolToExecute.name}': Backend server is not connected.`;
                logEvent(`[ERROR] ❌ ${enrichedResult.executionError}`);
            } else {
                try {
                    const response = await fetch(`${SERVER_URL}/api/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toolCall) });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Server execution failed with unknown error');
                    enrichedResult.executionResult = result;
                    logEvent(`[INFO] ✅ [SERVER] ${result?.stdout || result?.message || `Tool "${toolToExecute.name}" executed by server.`}`);
                } catch (execError) {
                     enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                     logEvent(`[ERROR] ❌ [SERVER] ${enrichedResult.executionError}`);
                }
            }
        } else if (toolToExecute.category === 'UI Component') {
             enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else { // Client-side Functional or Automation
            try {
                const result = await runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtime);
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ ${result?.message || `Tool "${toolToExecute.name}" executed by ${agentId}.`}`);
            } catch (execError) {
                enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                logEvent(`[ERROR] ❌ ${enrichedResult.executionError}`);
            }
        }

        // Post-processing logic for KiCad tools
        if (enrichedResult.toolCall?.name?.toLowerCase().includes('kicad')) {
            if (enrichedResult.executionResult?.stdout) {
                try {
                    const parsed = JSON.parse(enrichedResult.executionResult.stdout);
                    if(parsed.message) kicadLogEvent(`✔️ ${parsed.message}`);

                     if (parsed.artifacts) {
                        let title = 'Processing...';
                        if (toolCall.name.includes('Arrange')) title = 'Placed Components';
                        if (toolCall.name.includes('Route')) title = 'Routed Board';
                        if (toolCall.name.includes('Create Initial')) title = 'Unplaced Board';
                        if (toolCall.name.includes('Export')) title = 'Final Fabrication Output';
                        
                        const newArtifact = { 
                            title, 
                            path: parsed.artifacts.placed_png || parsed.artifacts.topImage || null,
                            svgPath: parsed.artifacts.routed_svg || null 
                        };
                        
                        if (newArtifact.path || newArtifact.svgPath) setCurrentKicadArtifact(newArtifact);

                        if (parsed.artifacts.fabZipPath) {
                            kicadLogEvent("🎉 Fabrication successful! Displaying final 3D results.");
                             setPcbArtifacts({ 
                                boardName: String(parsed.artifacts.boardName), 
                                topImage: String(parsed.artifacts.topImage), 
                                bottomImage: String(parsed.artifacts.bottomImage), 
                                fabZipPath: String(parsed.artifacts.fabZipPath) 
                            });
                            setCurrentKicadArtifact(null);
                        }
                    }
                } catch(e) { /* Not JSON, ignore */ }
            }
             if(enrichedResult.toolCall?.name) {
                 kicadLogEvent(`⚙️ Agent ${agentId} called: ${enrichedResult.toolCall.name}`);
             }
             if(enrichedResult.executionError) {
                kicadLogEvent(`❌ ERROR: ${enrichedResult.executionError}`);
             }
        }

        return enrichedResult;
    }, [getRuntimeApi, runToolImplementation, logEvent, isServerConnected, kicadLogEvent, setPcbArtifacts, setCurrentKicadArtifact]);
    
    executeActionRef.current = executeAction;
    
    const processRequest = useCallback(async (
        prompt: { text: string; files: any[] },
        systemInstruction: string,
        agentId: string
    ): Promise<EnrichedAIResponse[] | null> => {
        logEvent(`[API CALL] Agent ${agentId} is thinking...`);
        try {
            const aiResponse = await aiService.generateResponse(
                prompt,
                systemInstruction,
                selectedModelRef.current, // Use ref
                apiConfigRef.current,     // Use ref
                (progress) => logEvent(`[AI-PROGRESS] ${progress}`),
                allToolsRef.current
            );
    
            if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
                const executionPromises = aiResponse.toolCalls.map(toolCall => 
                    executeActionRef.current(toolCall, agentId)
                );
                return await Promise.all(executionPromises);
            } else {
                logEvent(`[WARN] Agent ${agentId} did not return any tool calls.`);
                return null;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logEvent(`[ERROR] Agent ${agentId} failed during AI generation: ${errorMessage}`);
            throw error;
        }
    }, [logEvent, allToolsRef, executeActionRef]);

    const runServerTool = useCallback(async (toolName: string, args: Record<string, any> = {}) => {
        try {
            const result = await executeActionRef.current({ name: toolName, arguments: args }, 'system-task');
            if (result.executionError) throw new Error(result.executionError);
            return result.executionResult;
        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] Tool '${toolName}' failed: ${errorMessage}`);
            throw e;
        }
    }, [logEvent, executeActionRef]);

    return {
        executeAction,
        executeActionRef,
        processRequest,
        runServerTool,
    };
};
