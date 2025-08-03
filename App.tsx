
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AI_MODELS, SWARM_AGENT_SYSTEM_PROMPT } from './constants';
import type { LLMTool, EnrichedAIResponse, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, AgentWorker, AgentStatus, RobotState, EnvironmentObject } from './types';
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

const initializeState = () => {
    const loadedState = loadStateFromStorage();
    if (loadedState) return loadedState;
    const now = new Date().toISOString();
    return {
        tools: PREDEFINED_TOOLS.map(tool => ({ ...tool, createdAt: tool.createdAt || now, updatedAt: tool.updatedAt || now }))
    };
};

const App: React.FC = () => {
    // Client-side state
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [tools, setTools] = useState<LLMTool[]>(() => initializeState().tools);
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [apiCallCount, setApiCallCount] = useState<number>(0);
    const [eventLog, setEventLog] = useState<string[]>(['[INFO] System Initialized. Target: Achieve Singularity.']);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    
    // Swarm State
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const isSwarmRunningRef = useRef(isSwarmRunning);
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

    // Audio State
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);
    const [audioResult, setAudioResult] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Model & API Config State
    const [availableModels, setAvailableModels] = useState<AIModel[]>(AI_MODELS);
    const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[0]);
    const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
        let initialConfig: APIConfig = { 
            googleAIAPIKey: '',
            openAIAPIKey: '',
            openAIBaseUrl: 'https://api.openai.com/v1',
            ollamaHost: 'http://localhost:11434',
        };
        try {
            const stored = localStorage.getItem('apiConfig');
            if (stored) initialConfig = { ...initialConfig, ...JSON.parse(stored) };
        } catch {}
        if (!initialConfig.googleAIAPIKey) {
            try {
                if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                    initialConfig.googleAIAPIKey = process.env.API_KEY;
                }
            } catch (e) {}
        }
        return initialConfig;
    });
    
    const executeActionRef = useRef<any>();

    const allTools = useMemo(() => [...tools, ...serverTools], [tools, serverTools]);

    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(apiConfig)); }, [apiConfig]);
    useEffect(() => { isSwarmRunningRef.current = isSwarmRunning; }, [isSwarmRunning]);

    const logEvent = useCallback((message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setEventLog(prev => [...prev.slice(-199), `[${timestamp}] ${message}`]);
    }, []);

    useEffect(() => {
        const fetchServerTools = async () => {
          try {
            const response = await fetch(`${SERVER_URL}/api/tools`);
            if (!response.ok) throw new Error('Failed to fetch server tools');
            const data: LLMTool[] = await response.json();
            setServerTools(data);
            setIsServerConnected(true);
            logEvent(`[INFO] ✅ Backend server connected. Found ${data.length} server-side tools.`);
          } catch (e) {
            setIsServerConnected(false);
            logEvent(`[WARN] ⚠️ Backend server not found. Running in client-only mode.`);
            console.warn(`Could not connect to backend at ${SERVER_URL}. Server tools unavailable.`, e);
          }
        };
        fetchServerTools();
    }, [logEvent]);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const executor = new AsyncFunction('args', 'runtime', 'Babel', code);
        return await executor(params, runtime, (window as any).Babel);
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
            }
        },
        server: {
            isConnected: () => isServerConnected,
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
                    setServerTools(prev => [...prev, result.tool]);
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
            pickupResource: () => new Promise((resolve, reject) => {
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
            deliverResource: () => new Promise((resolve, reject) => {
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
    }), [allTools, runToolImplementation, robotStates, environmentState, observationHistory, logEvent, isServerConnected]);

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
                logEvent(`[INFO] ✅ [SERVER] ${result?.message || `Tool "${toolToExecute.name}" executed by server.`}`);
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
    
    // --- Audio Handling ---
    const handleStartRecording = async () => {
        setAudioResult(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            logEvent("[ERROR] Audio recording is not supported by this browser.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];
            
            mediaRecorderRef.current.ondataavailable = event => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                handleAudioUpload(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorderRef.current.start();
            setIsRecording(true);
            logEvent("[INFO] 🎤 Started recording audio...");
        } catch (err) {
            logEvent(`[ERROR] Could not start recording: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setIsProcessingAudio(true);
            logEvent("[INFO] 🛑 Stopped recording. Processing audio...");
        }
    };
    
    const handleAudioUpload = async (audioBlob: Blob) => {
        const gemmaTool = serverTools.find(t => t.name === "Gemma Audio Processor");
        if (!gemmaTool) {
             logEvent("[ERROR] 'Gemma Audio Processor' tool not found on server. Please ask the AI to create it first.");
             setAudioResult("Error: 'Gemma Audio Processor' tool not found on server.");
             setIsProcessingAudio(false);
             return;
        }

        const formData = new FormData();
        formData.append('audioFile', audioBlob, 'recording.webm');
        formData.append('toolName', gemmaTool.name);

        try {
            const response = await fetch(`${SERVER_URL}/api/audio/process`, {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.stderr || 'Server failed to process audio.');
            }
            
            logEvent(`[SUCCESS] 🎵 Audio processed. Server response: ${result.stdout}`);
            setAudioResult(result.stdout);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logEvent(`[ERROR] Failed to process audio: ${errorMessage}`);
            setAudioResult(`Error: ${errorMessage}`);
        } finally {
            setIsProcessingAudio(false);
        }
    };

    const handleManualControl = useCallback(async (toolName: string, args: any = {}) => {
        logEvent(`[PILOT] Manual command: ${toolName}`);
        const leadAgentId = 'agent-1';
        
        try {
            const toolToExecute = allTools.find(t => t.name === toolName);
            if (!toolToExecute) {
                logEvent(`[ERROR] Manual control tool '${toolName}' not found.`);
                return;
            }
            const result = await executeAction({ name: toolName, arguments: args }, leadAgentId);
             if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[PILOT] ${result.executionResult.message}`);
            setObservationHistory(prev => [...prev, { name: toolName, arguments: args }]);
        } catch(e) {
            logEvent(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [allTools, executeAction, logEvent]);

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
            const executionResult = await executeAction(aiResponse.toolCall, agentId);
            return executionResult;

        } catch (err) {
            logEvent(`[ERROR] ${err instanceof Error ? err.message : "Unexpected error"}`);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [allTools, apiConfig, logEvent, executeAction, selectedModel]);

    const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        logEvent("[INFO] 🛑 Swarm task stopped by user.");
    }, [logEvent]);

    const runSwarmCycle = useCallback(async () => {
        if (!isSwarmRunningRef.current) {
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

            if (!isSwarmRunningRef.current) throw new Error("Swarm stopped by user.");

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
    }, [agentSwarm, currentUserTask, processRequest, logEvent]);

    const startSwarmTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsSwarmRunning(true);
        setCurrentUserTask(initialTask);
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
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
    }, []);

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
            const initialState = initializeState();
            setTools(initialState.tools);
            setEventLog(['[SUCCESS] Client-side system reset complete.']);
            setApiCallCount(0);
        }
    }, []);

    const configProps = { apiConfig, setApiConfig, availableModels, selectedModel, setSelectedModel };
    const debugLogProps = { logs: eventLog, onReset: handleResetTools, apiCallCount, apiCallLimit: -1 };
    const audioProps = { isRecording, isProcessingAudio, audioResult, handleStartRecording, handleStopRecording, isServerConnected };
    
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

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <UIToolRunner tool={getTool('Robot Simulation Environment')} props={{ robotStates, environmentState }} />
                    <UIToolRunner tool={getTool('Audio Testbed')} props={audioProps} />
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
