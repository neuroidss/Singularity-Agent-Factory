
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { CORE_TOOLS, AI_MODELS, SWARM_AGENT_SYSTEM_PROMPT } from './constants';
import { BOOTSTRAP_TOOL_PAYLOADS } from './bootstrap';
import type { LLMTool, EnrichedAIResponse, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, AgentWorker, AgentStatus, RobotState, EnvironmentObject, ToolCreatorPayload, WorkflowStep } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider } from './types';
import { loadStateFromStorage, saveStateToStorage } from './versioning';

const SERVER_URL = 'http://localhost:3001';

const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 50);
  if (!baseId) baseId = 'unnamed_tool';
  let finalId = baseId;
  let counter = 1;
  const existingIds = new Set(existingTools.map(t => t.id));
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

// This function simulates the "Tool Creator" to build tools from payloads at startup.
const bootstrapTool = (payload: ToolCreatorPayload, existingTools: LLMTool[]): LLMTool => {
    const { executionEnvironment, ...toolData } = payload;
    const newId = generateMachineReadableId(toolData.name, existingTools);
    const now = new Date().toISOString();
    
    // All bootstrapped tools are considered version 1 client-side tools.
    // The 'executionEnvironment' is part of the creation payload but not the final tool object itself.
    return {
        ...toolData,
        id: newId,
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
};

const initializeTools = (): LLMTool[] => {
    console.log("Bootstrapping initial toolset...");
    const allCreatedTools: LLMTool[] = [...CORE_TOOLS];
    
    BOOTSTRAP_TOOL_PAYLOADS.forEach(payload => {
        // In this bootstrap phase, we assume all are client-side tools.
        // Server tools are fetched separately from the server.
        if (payload.executionEnvironment === 'Client') {
             const newTool = bootstrapTool(payload, allCreatedTools);
             allCreatedTools.push(newTool);
        }
    });
    console.log(`Bootstrap complete. ${allCreatedTools.length} client tools loaded.`);
    return allCreatedTools;
};

const App: React.FC = () => {
    // Client-side state
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [tools, setTools] = useState<LLMTool[]>(() => {
        const loadedState = loadStateFromStorage();
        if (loadedState) {
            return loadedState.tools;
        }
        // If no saved state, bootstrap from constants
        return initializeTools();
    });
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [apiCallCount, setApiCallCount] = useState<number>(0);
    const [eventLog, setEventLog] = useState<string[]>(['[INFO] System Initialized. Target: Achieve Singularity.']);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    
    // KiCad Workflow State
    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, topImage: string, bottomImage: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>([]);
    const [isKicadGenerating, setIsKicadGenerating] = useState<boolean>(false);
    const [kicadWorkflowPlan, setKicadWorkflowPlan] = useState<WorkflowStep[] | null>(null);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    
    // Swarm State
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const swarmIterationCounter = useRef(0);
    const swarmAgentIdCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const [currentUserTask, setCurrentUserTask] = useState<string>('');
    
    // Robot & Environment State
    const [robotStates, setRobotStates] = useState<RobotState[]>([]);
    const [observationHistory, setObservationHistory] = useState<AIToolCall[]>([]);
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>([
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 0, type: 'wall' as const })),
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 11, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 0, y: i + 1, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 11, y: i + 1, type: 'wall' as const })),
        { x: 5, y: 1, type: 'tree' }, { x: 5, y: 2, type: 'tree' }, { x: 5, y: 3, type: 'tree' },
        { x: 5, y: 4, type: 'tree' }, { x: 5, y: 5, type: 'tree' }, { x: 5, y: 6, type: 'tree' },
        { x: 9, y: 2, type: 'resource' },
        { x: 2, y: 9, type: 'collection_point' },
    ]);

    // Model & API Config State
    const [availableModels, setAvailableModels] = useState<AIModel[]>(AI_MODELS);
    const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[0]);
    const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
        let initialConfig: APIConfig = { 
            openAIAPIKey: 'ollama',
            openAIBaseUrl: 'http://localhost:8008/v1',
            ollamaHost: 'http://localhost:11434',
        };
        try {
            const stored = localStorage.getItem('apiConfig');
            if (stored) initialConfig = { ...initialConfig, ...JSON.parse(stored) };
        } catch {}
        return initialConfig;
    });
    
    const executeActionRef = useRef<any>(null);
    const allTools = useMemo(() => [...tools, ...serverTools], [tools, serverTools]);

    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(apiConfig)); }, [apiConfig]);

    const logEvent = useCallback((message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setEventLog(prev => [...prev.slice(-199), `[${timestamp}] ${message}`]);
    }, []);
    
    const fetchServerTools = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/tools`);
            if (!response.ok) throw new Error('Failed to fetch server tools');
            const data: LLMTool[] = await response.json();
            // Basic check to see if tools have changed to avoid needless re-renders
            if (JSON.stringify(data) !== JSON.stringify(serverTools)) {
              setServerTools(data);
            }
            if (!isServerConnected) {
              setIsServerConnected(true);
              logEvent(`[INFO] ✅ Backend server connected. Found ${data.length} server-side tools.`);
            }
        } catch (e) {
            if (isServerConnected) {
              setIsServerConnected(false);
              setServerTools([]); // Clear stale tools
              logEvent(`[WARN] ⚠️ Backend server disconnected. Running in client-only mode.`);
              console.warn(`Could not connect to backend at ${SERVER_URL}. Server tools unavailable.`, e);
            }
        }
    }, [logEvent, isServerConnected, serverTools]);

    useEffect(() => {
        fetchServerTools(); // Initial fetch
        const serverToolInterval = setInterval(fetchServerTools, 5000);
        return () => {
          clearInterval(serverToolInterval)
        };
    }, [fetchServerTools]);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const executor = new AsyncFunction('args', 'runtime', code);
        return await executor(params, runtime);
    }, []);

    const getRuntimeApi = useCallback((agentId: string) => ({
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                const toolToRun = allTools.find(t => t.name === toolName);
                if (!toolToRun) throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                const result = await executeActionRef.current({ name: toolName, arguments: args }, agentId);
                if (result.executionError) throw new Error(result.executionError);
                return result.executionResult;
            },
            add: (newToolPayload: NewToolPayload): LLMTool => {
                if (allTools.find(t => t.name === newToolPayload.name)) throw new Error(`A tool with the name '${newToolPayload.name}' already exists.`);
                const newId = generateMachineReadableId(newToolPayload.name, allTools);
                const now = new Date().toISOString();
                const completeTool: LLMTool = { ...newToolPayload, id: newId, version: 1, createdAt: now, updatedAt: now };
                setTools(prevTools => [...prevTools, completeTool]);
                return completeTool;
            },
            list: (): LLMTool[] => allTools,
        },
        server: {
            isConnected: () => isServerConnected,
            getUrl: () => SERVER_URL,
            createTool: async (newToolPayload: NewToolPayload): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot create server tool: Backend server is not connected.");
                try {
                    const response = await fetch(`${SERVER_URL}/api/tools/create`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newToolPayload),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Server failed to create tool');
                    // The server now adds the tool to its own cache. We just need to re-fetch.
                    await fetchServerTools();
                    return { success: true, message: `Successfully created server-side tool: '${result.tool.name}'`};
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[ERROR] Failed to create server tool: ${errorMessage}`);
                    throw e;
                }
            },
            writeFile: async (filePath: string, content: string): Promise<any> => {
                if (!isServerConnected) throw new Error("Cannot write file: The backend server is not connected.");
                 try {
                    const response = await fetch(`${SERVER_URL}/api/files/write`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath, content }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Server failed to write file');
                    logEvent(`[INFO] ✅ [SERVER] Successfully wrote file: ${filePath}`);
                    return result;
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[ERROR] Failed to write server file: ${errorMessage}`);
                    throw e;
                }
            },
        },
        fetchServerTools: fetchServerTools, // Expose fetchServerTools to runtime
        robot: {
            getState: () => {
                const robot = robotStates.find(r => r.id === agentId);
                if (!robot) {
                    throw new Error(`Pathfinder cannot find robot state for agent ${agentId}.`);
                }
                return { robot, environment: environmentState };
            },
            moveForward: () => new Promise<any>((resolve, reject) => {
                setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    let { x, y } = robot;
                    if (robot.rotation === 0) y -= 1; if (robot.rotation === 90) x += 1; if (robot.rotation === 180) y += 1; if (robot.rotation === 270) x -= 1;
                    
                    if (environmentState.some(obj => obj.x === x && obj.y === y && (obj.type === 'wall' || obj.type === 'tree'))) {
                        reject(new Error(`Agent ${agentId} Move failed: Collision with environment.`));
                        return prevStates;
                    }
                    if (prevStates.some(r => r.id !== agentId && r.x === x && r.y === y)) {
                        reject(new Error(`Agent ${agentId} Move failed: Collision with another robot.`));
                        return prevStates;
                    }

                    const newStates = [...prevStates];
                    newStates[robotIndex] = { ...robot, x, y };
                    resolve({ success: true, message: `Agent ${agentId} moved forward to (${x}, ${y})`});
                    return newStates;
                });
            }),
            turn: (direction: 'left' | 'right') => new Promise<any>((resolve, reject) => {
                setRobotStates(prev => {
                    const robotIndex = prev.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Agent ${agentId} not found for turn operation.`));
                        return prev;
                    }
                    const newStates = [...prev];
                    const robot = newStates[robotIndex];
                    newStates[robotIndex] = { ...robot, rotation: (robot.rotation + (direction === 'left' ? -90 : 90) + 360) % 360 };
                    resolve({ success: true, message: `Agent ${agentId} turned ${direction}.` });
                    return newStates;
                });
            }),
            pickupResource: () => new Promise<any>((resolve, reject) => {
                setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    const resourceObj = environmentState.find(obj => obj.type === 'resource');
                    if (robot.hasResource) {
                        reject(new Error(`Pickup failed: Agent ${agentId} is already carrying a resource.`));
                        return prevStates;
                    }
                    if (resourceObj && resourceObj.x === robot.x && resourceObj.y === robot.y) {
                        const newStates = [...prevStates];
                        newStates[robotIndex] = {...robot, hasResource: true};
                        setEnvironmentState(prevEnv => prevEnv.filter(obj => obj.type !== 'resource'));
                        resolve({ success: true, message: `Agent ${agentId} picked up resource.` });
                        return newStates;
                    }
                    reject(new Error(`Pickup failed: Agent ${agentId} is not at the resource location.`));
                    return prevStates;
                });
            }),
            deliverResource: () => new Promise<any>((resolve, reject) => {
                 setRobotStates(prevStates => {
                    const robotIndex = prevStates.findIndex(r => r.id === agentId);
                    if (robotIndex === -1) {
                        reject(new Error(`Robot for agent ${agentId} not found.`));
                        return prevStates;
                    }
                    const robot = prevStates[robotIndex];
                    const collectionPointObj = environmentState.find(obj => obj.type === 'collection_point');
                    if (!robot.hasResource) {
                        reject(new Error(`Delivery failed: Agent ${agentId} is not carrying a resource.`));
                        return prevStates;
                    }
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
        getObservationHistory: () => observationHistory,
        clearObservationHistory: () => setObservationHistory([]),
        // Add a new API for workflows to update the UI
        updatePcbArtifacts: (artifacts) => {
            setPcbArtifacts(artifacts);
        },
    }), [allTools, runToolImplementation, robotStates, environmentState, observationHistory, logEvent, isServerConnected, fetchServerTools]);

    const executeAction = useCallback(async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        const toolToExecute = allTools.find(t => t.name === toolCall.name);

        if (!toolToExecute) throw new Error(`AI returned unknown tool name for agent ${agentId}: ${toolCall.name}`);
        
        enrichedResult.tool = toolToExecute;
        const runtime = getRuntimeApi(agentId);

        if (toolToExecute.category === 'Server') {
            if (!isServerConnected) {
                const errorMessage = `Cannot execute server tool '${toolToExecute.name}': Backend server is not connected.`;
                enrichedResult.executionError = errorMessage;
                logEvent(`[ERROR] ❌ ${errorMessage}`);
                return enrichedResult;
            }
            try {
                const response = await fetch(`${SERVER_URL}/api/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(toolCall)
                });
                 const result = await response.json();
                if (!response.ok) {
                   throw new Error(result.error || 'Server execution failed with unknown error');
                }
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ [SERVER] ${result?.stdout || result?.message || `Tool "${toolToExecute.name}" executed by server.`}`);
            } catch (execError) {
                 const errorMessage = execError instanceof Error ? execError.message : String(execError);
                 enrichedResult.executionError = errorMessage;
                 logEvent(`[ERROR] ❌ [SERVER] ${errorMessage}`);
            }
        } else if (toolToExecute.category === 'UI Component') {
             enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else { // Client-side Functional or Automation
            try {
                const result = await runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtime);
                enrichedResult.executionResult = result;
                logEvent(`[INFO] ✅ ${result?.message || `Tool "${toolToExecute.name}" executed by ${agentId}.`}`);
            } catch (execError) {
                const errorMessage = execError instanceof Error ? execError.message : String(execError);
                enrichedResult.executionError = errorMessage;
                logEvent(`[ERROR] ❌ ${errorMessage}`);
            }
        }
        return enrichedResult;
    }, [allTools, getRuntimeApi, runToolImplementation, logEvent, isServerConnected]);
    
    executeActionRef.current = executeAction;
    
    // --- Local AI Tool Handlers ---
    // These functions allow UI components to trigger server-side tools through the main execution pipeline.
    const runServerTool = useCallback(async (toolName: string, args: Record<string, any> = {}) => {
        try {
            const result = await executeActionRef.current({ name: toolName, arguments: args }, 'system-task');
            if (result.executionError) {
                throw new Error(result.executionError);
            }
            return result.executionResult;
        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] Tool '${toolName}' failed: ${errorMessage}`);
            throw e; // Re-throw to be caught by the caller
        }
    }, [logEvent]);

    const handleStartLocalAI = useCallback(() => runServerTool('Start Local AI Server'), [runServerTool]);
    const handleStopLocalAI = useCallback(() => runServerTool('Stop Local AI Server'), [runServerTool]);
    const handleGetLocalAIStatus = useCallback(() => runServerTool('Get Local AI Server Status'), [runServerTool]);


    const handleManualControl = useCallback(async (toolName: string, args: any = {}) => {
        logEvent(`[PILOT] Manual command: ${toolName}`);
        const leadAgentId = 'agent-1';
        
        try {
            const toolToExecute = allTools.find(t => t.name === toolName);
            if (!toolToExecute) {
                logEvent(`[ERROR] Manual control tool '${toolName}' not found.`);
                return;
            }
            const result = await executeActionRef.current({ name: toolName, arguments: args }, leadAgentId);
             if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[PILOT] ${result.executionResult.message}`);
            setObservationHistory(prev => [...prev, { name: toolName, arguments: args }]);
        } catch(e) {
            logEvent(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [allTools, logEvent]);

    const processRequest = useCallback(async (prompt: string, systemInstruction: string, agentId: string): Promise<EnrichedAIResponse | null> => {
        setIsLoading(true);
        try {
            logEvent(`[INFO] 🤖 Agent ${agentId} is thinking using ${selectedModel.name}...`);
            setApiCallCount(prev => prev + 1);
            const aiResponse: AIResponse = await aiService.generateResponse(prompt, systemInstruction, selectedModel, apiConfig, logEvent, allTools);
            
            if(!aiResponse.toolCall) {
                logEvent(`[WARN] Agent ${agentId} did not select a tool to execute.`);
                return null;
            }
            logEvent(`💡 Agent ${agentId} decided to call: ${aiResponse.toolCall.name} with args: ${JSON.stringify(aiResponse.toolCall.arguments)}`);
            const executionResult = await executeActionRef.current(aiResponse.toolCall, agentId);
            return executionResult;

        } catch (err) {
            logEvent(`[ERROR] ${err instanceof Error ? err.message : "Unexpected error"}`);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [allTools, apiConfig, logEvent, selectedModel]);

    const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        logEvent("[INFO] 🛑 Swarm task stopped by user.");
    }, [logEvent]);

    const runSwarmCycle = useCallback(async () => {
        if (!isSwarmRunning) {
            setIsLoading(false);
            setIsSwarmRunning(false);
            logEvent("[SUCCESS] Swarm task concluded.");
            setRobotStates([]);
            return;
        }
        if (swarmIterationCounter.current >= 50) {
            logEvent("[WARN] ⚠️ Swarm reached max iterations.");
            setIsSwarmRunning(false);
            setIsLoading(false);
            setRobotStates([]);
            return;
        }
        const idleAgentIndex = agentSwarm.findIndex(a => a.status === 'idle');
        if (idleAgentIndex === -1) {
            setTimeout(runSwarmCycle, 2000); // Wait for an agent to become free
            return;
        }
        const agent = agentSwarm[idleAgentIndex];
        swarmIterationCounter.current++;

        try {
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
            const historyString = swarmHistoryRef.current.length > 0 ? `The swarm has already performed these actions:\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message)})`}`).join('\n')}` : "The swarm has not performed any actions yet.";
            const promptForAgent = `The swarm's overall goal is: "${currentUserTask}".\n\n${historyString}\n\nBased on this, what is the single next action? If the goal is complete, call "Task Complete".`;
            
            const result = await processRequest(promptForAgent, SWARM_AGENT_SYSTEM_PROMPT, agent.id);

            if (!isSwarmRunning) throw new Error("Swarm stopped by user.");

            if (result) {
                swarmHistoryRef.current.push(result);
                const actionSummary = result.toolCall ? `Called '${result.toolCall.name}'` : 'No action';
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'succeeded', lastAction: actionSummary, result: result.executionResult } : a));
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${result.executionResult?.message || 'Finished!'}`);
                    setIsSwarmRunning(false);
                    setIsLoading(false);
                    return;
                }
            } else {
                 setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Did not choose action.' } : a));
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            // Respawn a failed agent
            setAgentSwarm(prev => {
                const failedSwarm = prev.map(a => a.id === agent.id ? { ...a, status: 'terminated' as AgentStatus, error: errorMessage, lastAction: `FAILED: ${a.lastAction}` } : a);
                swarmAgentIdCounter.current++;
                return [...failedSwarm, { id: `agent-${swarmAgentIdCounter.current}`, status: 'idle', lastAction: 'Newly spawned', error: null, result: null }];
            });
        }
        setTimeout(runSwarmCycle, 1000);
    }, [agentSwarm, currentUserTask, processRequest, logEvent, isSwarmRunning]);

    const startSwarmTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsSwarmRunning(true);
        setCurrentUserTask(initialTask);
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
        setPcbArtifacts(null); // Clear any previous PCB results
        const timestamp = new Date().toLocaleTimeString();
        setEventLog([`[${timestamp}] [INFO] 🚀 Starting swarm task: "${initialTask}"`]); // Clear previous logs and set the starting message
        const initialAgents: AgentWorker[] = Array.from({ length: 3 }, (_, i) => ({ id: `agent-${i + 1}`, status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }));
        setAgentSwarm(initialAgents);
        const initialRobots: RobotState[] = initialAgents.map((agent, i) => ({
            id: agent.id,
            x: 1 + i,
            y: 1,
            rotation: 90,
            hasResource: false,
        }));
        setRobotStates(initialRobots);
    }, [logEvent]);

    useEffect(() => {
        if (isSwarmRunning && agentSwarm.length > 0 && agentSwarm.every(a => a.status !== 'working')) {
            runSwarmCycle();
        }
    }, [isSwarmRunning, agentSwarm, runSwarmCycle]);

    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) { logEvent("[WARN] Please enter a task."); return; }
        await startSwarmTask(userInput);
    }, [userInput, startSwarmTask, logEvent]);

    const handleResetTools = useCallback(() => {
        if (window.confirm('This will delete ALL client-side custom-made tools and restore the original set. Server tools will NOT be affected. Are you sure?')) {
            localStorage.removeItem('singularity-agent-factory-state');
            setTools(initializeTools());
            setEventLog(['[SUCCESS] Client-side system reset complete.']);
            setApiCallCount(0);
        }
    }, []);

    // --- KiCad Workflow Handlers ---
    const logKicadEvent = useCallback((message: string) => {
        setKicadLog(prev => [...prev.slice(-99), message]);
    }, []);

    const handleGenerateKicadPlan = useCallback(async (prompt: string) => {
        setIsKicadGenerating(true);
        setKicadLog([]);
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
        setKicadWorkflowPlan(null);
        logKicadEvent("🚀 Starting KiCad Generation Workflow...");

        const boardName = `brd_${Date.now()}`;
        logKicadEvent(`Board name set to: ${boardName}`);

        const systemPrompt = `
You are an expert KiCad automation engineer. Your task is to convert a user's request into a precise sequence of tool calls.
You MUST output a single, valid JSON array of objects, where each object represents a tool call. Do not add any other text or markdown.

The available tools are:
1. "Define KiCad Component": { "boardName": string, "ref": string, "partDescription": string, "value": string, "footprint": string, "pinCount": number }
2. "Create KiCad Netlist": { "boardName": string, "connectionsJson": stringified_json_array }
   - connectionsJson is a JSON string of: [{ "net_name": string, "pin_connections": string[] }]
3. "Create Initial PCB": { "boardName": string }
4. "Autoroute PCB": { "boardName": string }
5. "Export Fabrication Files": { "boardName": string }

CRITICAL INSTRUCTIONS:
- You MUST use the exact boardName provided in the user prompt for ALL tool calls.
- The 'connectionsJson' parameter for 'Create KiCad Netlist' MUST be a string containing valid JSON.
- When defining components:
  - For specific parts from a KiCad library (e.g., a resistor, a specific IC), set 'pinCount' to 0 and use the format 'Library:Part' for the 'value' argument (e.g., 'Device:R', 'Connector_Generic:Conn_01x07', 'Texas_Instruments:ADS131M08').
  - For generic connectors where you only need a symbol with a certain number of pins, provide a non-zero 'pinCount' (e.g., 7) and a descriptive 'value' (e.g., 'XIAO Header'). The script will automatically use a generic 'Conn_01x{pinCount}' symbol for it.
- The entire output MUST be a single JSON array, like this: [ { "toolName": "...", "arguments": {...} }, ... ]
- The sequence of calls must be logical: Define all components, then create the netlist, then create PCB, then route, then fabricate.
        `;
    
        const userPromptForAI = `User Request: "${prompt}"\n\nUse this boardName for all steps: "${boardName}"`;

        try {
            logKicadEvent(`🧠 Asking ${selectedModel.name} to generate workflow plan...`);
            const workflowSteps = await aiService.generateStructuredResponse(
                userPromptForAI,
                systemPrompt,
                selectedModel,
                apiConfig,
                logKicadEvent // onProgress
            );
            
            if (!Array.isArray(workflowSteps)) {
                throw new Error("AI did not return a valid array of workflow steps.");
            }
            setKicadWorkflowPlan(workflowSteps);
            logKicadEvent(`✅ Workflow plan received with ${workflowSteps.length} steps. Ready to execute.`);

        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ ERROR: ${errorMessage}`);
            logEvent(`[ERROR] KiCad plan generation failed: ${errorMessage}`);
        } finally {
            setIsKicadGenerating(false);
        }
    }, [logKicadEvent, logEvent, selectedModel, apiConfig]);
    
    const handleExecuteKicadPlan = useCallback(async () => {
        if (!kicadWorkflowPlan) {
            logKicadEvent("❌ Cannot execute: No plan has been generated.");
            return;
        }
        setIsKicadGenerating(true);
        logKicadEvent(`▶️ Executing ${kicadWorkflowPlan.length} steps...`);

        try {
             // Check if the KiCad tools are installed. If not, install them.
            const requiredTools = ["Define KiCad Component", "Create KiCad Netlist", "Create Initial PCB", "Autoroute PCB", "Export Fabrication Files"];
            const allToolNames = new Set(allTools.map(t => t.name));
            const missingTools = requiredTools.filter(t => !allToolNames.has(t));

            if (missingTools.length > 0) {
                logKicadEvent("🔧 KiCad Engineering Suite not fully installed. Installing now...");
                const installResult = await executeActionRef.current({ name: 'Install KiCad Engineering Suite', arguments: {} }, 'system-installer');
                if (installResult.executionError) {
                    throw new Error(`Failed to install KiCad suite: ${installResult.executionError}`);
                }
                logKicadEvent(`✅ ${installResult.executionResult.message}`);
                // After installation, server tools are re-fetched automatically by the runtime.
                // The updated tools will be available for the subsequent steps.
            }


            for (const [index, step] of kicadWorkflowPlan.entries()) {
                logKicadEvent(`[${index+1}/${kicadWorkflowPlan.length}] ⚙️ Executing: ${step.toolName}...`);
                const result = await executeActionRef.current({ name: step.toolName, arguments: step.arguments }, 'kicad-agent');
                
                if (result.executionError) {
                    throw new Error(`Step '${step.toolName}' failed: ${result.executionError}`);
                }
                
                // Server tools return JSON in stdout
                const serverOutput = result.executionResult?.stdout;
                if (serverOutput) {
                    try {
                        const parsedOutput = JSON.parse(serverOutput);
                        logKicadEvent(`✔️ ${parsedOutput.message || `Success: ${step.toolName}`}`);

                        const artifacts = parsedOutput.artifacts;
                        if (artifacts) {
                             const title = step.toolName.includes('Route') ? 'Routed Board' : 'Unrouted Board';
                             const newArtifact = {
                                title,
                                path: artifacts.image_top || null,
                                svgPath: artifacts.routed_svg || null
                             };
                             if (newArtifact.path || newArtifact.svgPath) {
                                setCurrentKicadArtifact(newArtifact);
                             }
                        }
                        
                        if (artifacts?.fab_zip) {
                             logKicadEvent("🎉 Fabrication successful! Displaying final 3D results.");
                             setPcbArtifacts({
                                boardName: artifacts.boardName,
                                topImage: artifacts.image_top_3d,
                                bottomImage: artifacts.image_bottom_3d,
                                fabZipPath: artifacts.fab_zip
                             });
                             setCurrentKicadArtifact(null); // Clear intermediate artifact
                        }

                    } catch (e) {
                        // Not all stdout is JSON, this is okay.
                        logKicadEvent(`✔️ ${serverOutput.trim()}`);
                    }
                } else {
                    logKicadEvent(`✔️ Success: ${step.toolName}`);
                }
            }
            logKicadEvent("✅ Workflow Complete!");
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED: ${errorMessage}`);
            logEvent(`[ERROR] KiCad execution failed: ${errorMessage}`);
        } finally {
            setIsKicadGenerating(false);
        }

    }, [kicadWorkflowPlan, logKicadEvent, logEvent, allTools]);


    const configProps = { apiConfig, setApiConfig, availableModels, selectedModel, setSelectedModel };
    const debugLogProps = { logs: eventLog, onReset: handleResetTools, apiCallCount, apiCallLimit: -1 };
    
    // Dynamically get tools to avoid stale closures in props
    const getTool = (name: string): LLMTool => {
        const tool = allTools.find(t => t.name === name);
        if (tool) return tool;
        return { 
          id: 'fallback', 
          name: 'Not Found', 
          description: `A fallback UI tool for '${name}' which was not found.`,
          category: 'UI Component', 
          version: 1, 
          parameters: [], 
          implementationCode: `return <div>UI Tool '${name}' not found.</div>` 
        };
    };

    const localAiPanelTool = allTools.find(t => t.name === 'Local AI Server Panel');
    const localAiServerProps = {
        isServerConnected,
        logEvent,
        onStartServer: handleStartLocalAI,
        onStopServer: handleStopLocalAI,
        onGetStatus: handleGetLocalAIStatus,
    };
    
    const pcbViewerProps = pcbArtifacts ? {
        ...pcbArtifacts,
        serverUrl: SERVER_URL,
        onClose: () => setPcbArtifacts(null),
    } : null;
    
    const kicadPanelProps = {
        onGeneratePlan: handleGenerateKicadPlan,
        onExecutePlan: handleExecuteKicadPlan,
        kicadLog,
        isGenerating: isKicadGenerating,
        plan: kicadWorkflowPlan,
        currentArtifact: currentKicadArtifact,
        serverUrl: SERVER_URL,
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    {pcbViewerProps ? (
                        <UIToolRunner tool={getTool('KiCad PCB Viewer')} props={pcbViewerProps} />
                    ) : (
                         <UIToolRunner tool={getTool('Robot Simulation Environment')} props={{ robotStates, environmentState }} />
                    )}
                    <UIToolRunner tool={getTool('KiCad Design Automation Panel')} props={kicadPanelProps} />
                    {localAiPanelTool && <UIToolRunner tool={localAiPanelTool} props={localAiServerProps} />}
                    <UIToolRunner tool={getTool('Manual Robot Control')} props={{ handleManualControl, isSwarmRunning }} />
                     <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                    <UIToolRunner tool={getTool('User Input Form')} props={{ userInput, setUserInput, handleSubmit, isSwarmRunning }} />
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-6">
                     <UIToolRunner tool={getTool('Agent Swarm Display')} props={{ agentSwarm, isSwarmRunning, handleStopSwarm, currentUserTask }} />
                    <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected }} />
                </div>
            </main>
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;
