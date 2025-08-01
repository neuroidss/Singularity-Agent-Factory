
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS, DEFAULT_HUGGING_FACE_DEVICE, SWARM_AGENT_SYSTEM_PROMPT, TASK_AGENT_SYSTEM_PROMPT } from './constants';
import type { LLMTool, EnrichedAIResponse, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, AgentWorker, AgentStatus, RobotState, EnvironmentObject, KnowledgeGraphNode, KnowledgeGraph, Episode, EpisodeStatus } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider, OperatingMode, ToolRetrievalStrategy } from './types';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { retrieveToolsByEmbeddings, generateEmbeddings } from './services/embeddingService';
import { dot } from '@huggingface/transformers';

const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name
    .trim()
    .toLowerCase()
    // remove special chars except space and underscore
    .replace(/[^a-z0-9\s_]/g, '')
    // collapse spaces to underscores
    .replace(/\s+/g, '_')
     // collapse multiple underscores
    .replace(/_{2,}/g, '_')
    .slice(0, 50);

  if (!baseId) {
    baseId = 'unnamed_tool';
  }

  // Ensure uniqueness
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
    if (loadedState) {
        return loadedState;
    }
    // If nothing in storage, initialize from predefined
    const now = new Date().toISOString();
    return {
        tools: PREDEFINED_TOOLS.map(tool => ({
            ...tool,
            createdAt: tool.createdAt || now,
            updatedAt: tool.updatedAt || now,
        })),
        episodes: [],
        learnedHeuristics: [],
    };
};

const programmaticClusterNamer = (clusterTools: LLMTool[]): string => {
    const stopWords = new Set(['a', 'an', 'the', 'of', 'for', 'in', 'to', 'and', 'or', 'with', 'by', 'tool', 'component', 'display', 'panel', 'selector', 'configuration', 'control', 'agent', 'service', 'system', 'view']);

    const wordCounts = new Map<string, number>();

    clusterTools.forEach(tool => {
        tool.name.split(/\s+/)
            .map(word => word.toLowerCase().replace(/[^a-z0-9]/g, ''))
            .filter(word => word.length > 2 && !stopWords.has(word))
            .forEach(word => {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            });
    });

    if (wordCounts.size === 0) {
        return `Cluster: ${clusterTools[0]?.name || 'Unnamed'}`;
    }

    const sortedWords = Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1]);
    
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const topWord = sortedWords[0][0];
    if (sortedWords.length === 1 || sortedWords[0][1] > (sortedWords[1]?.[1] || 0)) {
        return `${capitalize(topWord)} Tools`;
    }

    const secondWord = sortedWords[1][0];
    return `${capitalize(topWord)} & ${capitalize(secondWord)}`;
};


const App: React.FC = () => {
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    const [tools, setTools] = useState<LLMTool[]>(() => initializeState().tools);
    const [episodes, setEpisodes] = useState<Episode[]>(() => initializeState().episodes);
    const [learnedHeuristics, setLearnedHeuristics] = useState<string[]>(() => initializeState().learnedHeuristics);

    const [lastResponse, setLastResponse] = useState<EnrichedAIResponse | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>(
        () => localStorage.getItem('selectedModelId') || AVAILABLE_MODELS[0].id
    );
    const [temperature, setTemperature] = useState<number>(
      () => parseFloat(localStorage.getItem('modelTemperature') || '0.0')
    );
    const [toolRetrievalStrategy, setToolRetrievalStrategy] = useState<ToolRetrievalStrategy>(
      () => (localStorage.getItem('toolRetrievalStrategy') as ToolRetrievalStrategy) || ToolRetrievalStrategy.LLM
    );
    // New state for operating mode and resource limits
    const [operatingMode, setOperatingMode] = useState<OperatingMode>(
      () => (localStorage.getItem('operatingMode') as OperatingMode) || OperatingMode.Command
    );
    const [autonomousActionLimit, setAutonomousActionLimit] = useState<number>(
      () => parseInt(localStorage.getItem('autonomousActionLimit') || '20', 10)
    );
    const [autonomousActionCount, setAutonomousActionCount] = useState<number>(
        () => parseInt(localStorage.getItem('autonomousActionCount') || '0', 10)
    );
    const [lastActionDate, setLastActionDate] = useState<string>(
        () => localStorage.getItem('lastActionDate') || ''
    );
     // State for Assist mode
    const [proposedAction, setProposedAction] = useState<AIToolCall | null>(null);
    
    // State for autonomous loop
    const [isAutonomousLoopRunning, setIsAutonomousLoopRunning] = useState<boolean>(false);
    const [cycleDelay, setCycleDelay] = useState<number>(
      () => parseInt(localStorage.getItem('cycleDelay') || '1000', 10)
    );
    const autonomousHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isAutonomousLoopRunning);
    const autonomousGoalRef = useRef<string>("");

    // State for Swarm mode
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const isSwarmRunningRef = useRef(isSwarmRunning);
    const swarmIterationCounter = useRef(0);
    const swarmAgentIdCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);

    // New state for Task mode loop
    const [isTaskLoopRunning, setIsTaskLoopRunning] = useState<boolean>(false);
    const [currentUserTask, setCurrentUserTask] = useState<string>('');
    const taskHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const taskIsRunningRef = useRef(isTaskLoopRunning);

    // State for embedding-based tool retrieval
    const [toolEmbeddingsCache, setToolEmbeddingsCache] = useState<Map<string, number[]>>(new Map());
    const [embeddingSimilarityThreshold, setEmbeddingSimilarityThreshold] = useState<number>(
        () => parseFloat(localStorage.getItem('embeddingSimilarityThreshold') || '0.5')
    );
    const [embeddingTopK, setEmbeddingTopK] = useState<number>(
        () => parseInt(localStorage.getItem('embeddingTopK') || '5', 10)
    );

    // State for Robotics Simulation
    const [robotState, setRobotState] = useState<RobotState>({ x: 1, y: 1, rotation: 90, hasResource: false });
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>([
        // Borders
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 0, type: 'wall' as const })),
        ...Array.from({length: 12}, (_, i) => ({ x: i, y: 11, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 0, y: i + 1, type: 'wall' as const })),
        ...Array.from({length: 10}, (_, i) => ({ x: 11, y: i + 1, type: 'wall' as const })),
        // Internal maze
        { x: 3, y: 1, type: 'wall' }, { x: 3, y: 2, type: 'wall' }, { x: 3, y: 3, type: 'wall' },
        { x: 3, y: 4, type: 'wall' }, { x: 3, y: 5, type: 'wall' },
        { x: 8, y: 10, type: 'wall' }, { x: 8, y: 9, type: 'wall' }, { x: 8, y: 8, type: 'wall' },
        { x: 8, y: 7, type: 'wall' }, { x: 8, y: 6, type: 'wall' },
        // Items
        { x: 9, y: 2, type: 'resource' },
        { x: 2, y: 9, type: 'collection_point' },
    ]);
    
    // State for Knowledge Graph
    const [selectedGraphNode, setSelectedGraphNode] = useState<KnowledgeGraphNode | null>(null);
    
    // NEW: State for agent economy
    const [agentResources, setAgentResources] = useState<Record<string, number>>({ Energy: 100 });

    // Centralized Logging and API call counting
    const [eventLog, setEventLog] = useState<string[]>(['[INFO] Log initialized.']);
    const [apiCallCount, setApiCallCount] = useState<number>(0);

    const logEvent = useCallback((message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setEventLog(prev => [...prev.slice(-199), `[${timestamp}] ${message}`]);
    }, []);

    const incrementApiCallCount = useCallback((purpose: string) => {
      setApiCallCount(prev => prev + 1);
      logEvent(`[API Call - ${purpose}]`);
    }, [logEvent]);


    const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
        const defaultConfig: APIConfig = {
            openAIBaseUrl: '',
            openAIAPIKey: '',
            openAIModelId: '',
            ollamaHost: '',
            googleAIAPIKey: '',
            huggingFaceDevice: DEFAULT_HUGGING_FACE_DEVICE,
        };

        let initialConfig = { ...defaultConfig };

        // 1. Load from localStorage, which is the primary source of truth for user settings.
        try {
            const stored = localStorage.getItem('apiConfig');
            if (stored) {
                initialConfig = { ...initialConfig, ...JSON.parse(stored) };
            }
        } catch {
            // Fallback to default if parsing fails.
        }

        // 2. If no Google key is set by the user (i.e., not in localStorage),
        //    then fall back to the environment variable as a convenience.
        //    This check happens only on initial load.
        if (!initialConfig.googleAIAPIKey) {
            try {
                if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                    initialConfig.googleAIAPIKey = process.env.API_KEY;
                }
            } catch (e) {
                // 'process' might not be defined in a pure browser context.
            }
        }
        
        return initialConfig;
    });
    
    // State to manage the currently displayed UI tool
    const [activeUITool, setActiveUITool] = useState<LLMTool | null>(null);

    const selectedModel = useMemo(
        (): AIModel => AVAILABLE_MODELS.find(m => m.id === selectedModelId) || AVAILABLE_MODELS[0],
        [selectedModelId]
    );

    useEffect(() => {
        saveStateToStorage({ tools, episodes, learnedHeuristics });
    }, [tools, episodes, learnedHeuristics]);
    
    useEffect(() => {
        localStorage.setItem('selectedModelId', selectedModelId);
    }, [selectedModelId]);

     useEffect(() => {
        localStorage.setItem('modelTemperature', String(temperature));
    }, [temperature]);
    
    useEffect(() => {
        localStorage.setItem('toolRetrievalStrategy', toolRetrievalStrategy);
    }, [toolRetrievalStrategy]);

     useEffect(() => {
        localStorage.setItem('apiConfig', JSON.stringify(apiConfig));
    }, [apiConfig]);

    // Persistence for new settings
    useEffect(() => {
        localStorage.setItem('operatingMode', operatingMode);
        if (operatingMode === OperatingMode.Swarm) {
             setUserInput(`The swarm's goal is to deliver the resource. First, create a tool that allows the robot to move in a square of a given size. Then, use that new tool to have one agent patrol a 3x3 square while another agent goes for the resource.`);
        } else if (operatingMode !== OperatingMode.Task) {
             setUserInput('');
        }
    }, [operatingMode]);
    useEffect(() => {
        localStorage.setItem('autonomousActionCount', String(autonomousActionCount));
    }, [autonomousActionCount]);
    useEffect(() => {
        localStorage.setItem('autonomousActionLimit', String(autonomousActionLimit));
    }, [autonomousActionLimit]);
    useEffect(() => {
        localStorage.setItem('lastActionDate', lastActionDate);
    }, [lastActionDate]);
     useEffect(() => {
        localStorage.setItem('cycleDelay', String(cycleDelay));
    }, [cycleDelay]);
    useEffect(() => {
        localStorage.setItem('embeddingSimilarityThreshold', String(embeddingSimilarityThreshold));
    }, [embeddingSimilarityThreshold]);
    useEffect(() => {
        localStorage.setItem('embeddingTopK', String(embeddingTopK));
    }, [embeddingTopK]);

    useEffect(() => {
      isRunningRef.current = isAutonomousLoopRunning;
    }, [isAutonomousLoopRunning]);

    useEffect(() => {
      taskIsRunningRef.current = isTaskLoopRunning;
    }, [isTaskLoopRunning]);
    
    useEffect(() => {
      isSwarmRunningRef.current = isSwarmRunning;
    }, [isSwarmRunning]);

    const handleGraphNodeClick = useCallback((node: KnowledgeGraphNode) => {
        logEvent(`[INFO] Graph node clicked: ${node.label}`);
        setSelectedGraphNode(node);
        // Maybe scroll to the tool in the list later
    }, [logEvent]);

    const findToolByName = useCallback((toolName: string): LLMTool | undefined => {
        return tools.find(t => t.name === toolName);
    }, [tools]);

    const runToolImplementation = useCallback(async (code: string, params: any, runtime: any): Promise<any> => {
        let codeToRun = code;
        const functionMatch = codeToRun.trim().match(/^function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);

        if (functionMatch) {
            const functionName = functionMatch[1];
            const declaredArgs = functionMatch[2].split(',').map(s => s.trim()).filter(Boolean);
            
            let callExpression;
            if (declaredArgs.length === 1 && (declaredArgs[0] === 'args' || declaredArgs[0] === 'props')) {
                 callExpression = `${functionName}(args)`;
            } else if (declaredArgs.length === 2 && declaredArgs.includes('args') && declaredArgs.includes('runtime')) {
                 callExpression = `${functionName}(args, runtime)`;
            }
            else {
                const callArgsList = declaredArgs.map(arg => `args['${arg}']`).join(', ');
                callExpression = `${functionName}(${callArgsList})`;
            }
            codeToRun += `\nreturn ${callExpression};`;
        }
        
        // This makes Babel available to the tool's execution scope
        // We use an AsyncFunction constructor to allow 'await' inside tool code.
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const executor = new AsyncFunction('args', 'runtime', 'Babel', codeToRun);
        return await executor(params, runtime, (window as any).Babel);
    }, []);

    const runtimeApi = useMemo(() => ({
        tools: {
            get: (name: string): LLMTool | undefined => {
                return tools.find(t => t.name === name);
            },
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                const toolToRun = tools.find(t => t.name === toolName);
                if (!toolToRun) {
                    throw new Error(`Workflow failed: Tool '${toolName}' not found.`);
                }
                if (toolToRun.category === 'UI Component') {
                    throw new Error(`Workflow failed: Cannot execute UI tool '${toolName}' in a workflow.`);
                }
                // We pass the runtimeApi itself back in, so tools can call other tools (with care).
                return await runToolImplementation(toolToRun.implementationCode, args, runtimeApi);
            },
            add: (newToolPayload: NewToolPayload): LLMTool => {
                const existingTool = tools.find(t => t.name === newToolPayload.name);
                if (existingTool) {
                    throw new Error(`A tool with the name '${newToolPayload.name}' already exists. Use the 'Tool Improver' to modify it.`);
                }
                const newId = generateMachineReadableId(newToolPayload.name, tools);
                const now = new Date().toISOString();
                const completeTool: LLMTool = { 
                    ...newToolPayload, 
                    id: newId, 
                    version: 1,
                    createdAt: now,
                    updatedAt: now,
                };
                setTools(prevTools => [...prevTools, completeTool]);
                setActiveUITool(null); // Close any active UI tool
                return completeTool;
            },
            update: (name: string, updates: Partial<Omit<LLMTool, 'id' | 'version' | 'name'>>): LLMTool => {
                const toolToUpdate = tools.find(t => t.name === name);
                if (!toolToUpdate) {
                    throw new Error(`Tool with name '${name}' not found for update.`);
                }
                
                // Prevent core properties from being nullified
                const essentialProps: (keyof typeof updates)[] = ['description', 'implementationCode', 'category'];
                for (const prop of essentialProps) {
                    if (updates.hasOwnProperty(prop) && (updates[prop] === null || updates[prop] === undefined)) {
                         throw new Error(`Tool update rejected: Attempted to set required property '${prop}' to null or undefined.`);
                    }
                }

                const updatedTool: LLMTool = {
                    ...toolToUpdate,
                    ...updates,
                    version: toolToUpdate.version + 1,
                    updatedAt: new Date().toISOString(),
                };

                setTools(prevTools => prevTools.map(t => t.id === updatedTool.id ? updatedTool : t));
                return updatedTool;
            }
        },
        ai: {
            verify: async (toolToVerify: LLMTool): Promise<{ is_correct: boolean; reasoning: string }> => {
                const verifierSystemPrompt = `You are a "Tool Functionality Verifier". Your job is to determine if a tool's code correctly implements its description.

Analyze the following tool:
- Name: ${toolToVerify.name}
- Description: ${toolToVerify.description}
- Parameters: ${JSON.stringify(toolToVerify.parameters, null, 2)}
- Implementation Code:
\`\`\`javascript
${toolToVerify.implementationCode}
\`\`\`

Does the code logically perform the action described in the description, considering its parameters?
Respond with ONLY a single, valid JSON object. Do not add any other text. Do not wrap the JSON in markdown backticks.
The JSON object must have this exact format:
{
  "is_correct": boolean, // true if the code matches the description, false otherwise
  "reasoning": "string" // A brief explanation for your decision.
}`;
                incrementApiCallCount('Tool Verification');
                const result = await aiService.verifyToolFunctionality(
                    verifierSystemPrompt, selectedModel, apiConfig, temperature
                );

                return result;
            },
            critique: async (userGoal: string, proposedAction: AIToolCall): Promise<{ is_optimal: boolean; suggestion: string }> => {
                const criticSystemPrompt = `You are an "Action Critic". Your role is to be a skeptical supervisor for another AI agent.
Your goal is to prevent errors and improve efficiency by critiquing the agent's proposed action before it is executed.

**User's Goal:**
"${userGoal}"

**Agent's Proposed Action:**
\`\`\`json
${JSON.stringify(proposedAction, null, 2)}
\`\`\`

**Your Task:**
1.  **Analyze the Goal:** Understand what the user is trying to achieve.
2.  **Analyze the Action:** Carefully examine the tool the agent chose and the arguments it provided.
3.  **Identify Flaws:** Look for potential problems:
    *   **Logical Errors:** Does the action actually contribute to the user's goal? Is there a more direct way?
    *   **Inefficiency:** Could a different tool or a simpler set of arguments achieve the same result faster or with fewer steps?
    *   **Incorrectness:** Are the arguments malformed? Is the 'purpose' for a new tool too vague? Is the implementation code for a new tool buggy or incomplete?
4.  **Formulate Response:** Respond with ONLY a single, valid JSON object in the specified format. Do not add any other text or markdown.

**JSON Response Format:**
{
  "is_optimal": boolean, // true if the action is logical, efficient, and correct. false otherwise.
  "suggestion": "string" // If not optimal, provide a concise, actionable suggestion for how the agent should change its proposed action. If optimal, briefly state why.
}`;
                incrementApiCallCount('Action Critique');
                const result = await aiService.critiqueAction(
                    criticSystemPrompt, selectedModel, apiConfig, temperature
                );

                return result;
            },
            learnFromGameTapes: async (): Promise<{ success: boolean; message: string; }> => {
                logEvent("[INFO] 🧠 Analyzing past performance to generate new heuristic...");
                const lastSuccess = [...episodes].reverse().find(e => e.status === 'Completed');
                const lastFailure = [...episodes].reverse().find(e => e.status === 'Failed');
                
                if (!lastSuccess && !lastFailure) {
                    throw new Error("No completed or failed episodes found to learn from.");
                }

                const formatAction = (a: EnrichedAIResponse) => ` - Action: ${a.toolCall?.name}, Result: ${a.executionError ? `FAILED (${a.executionError})` : 'OK'}`;
                
                const successLog = lastSuccess ? `SUCCESSFUL EPISODE:\nGoal: ${lastSuccess.goal}\nActions:\n${lastSuccess.actions.map(formatAction).join('\n')}` : "No successful episodes found.";
                const failureLog = lastFailure ? `FAILED EPISODE:\nGoal: ${lastFailure.goal}\nActions:\n${lastFailure.actions.map(formatAction).join('\n')}` : "No failed episodes found.";

                const systemInstruction = `You are a brilliant strategy analyst for an AI agent.
Your task is to analyze logs from one successful and one failed mission to derive a single, useful, high-level strategic heuristic.
The heuristic should be a general rule that helps the agent perform better in the future.
It should be concise, memorable, and start with "If..., then...".
Do not mention specific tools unless absolutely necessary. Focus on behavior and strategy.

Respond with ONLY the single heuristic as a raw string. Do not add any other text, reasoning, or quotation marks.

Example: "If an action fails, try a different tool before repeating the same action."

ANALYSIS DATA:
${successLog}
-----------------
${failureLog}`;
                
                incrementApiCallCount('Heuristic Generation');
                const newHeuristic = await aiService.generateHeuristic(systemInstruction, selectedModel, apiConfig, temperature, logEvent);
                
                if (newHeuristic && !learnedHeuristics.includes(newHeuristic)) {
                    setLearnedHeuristics(prev => [...prev, newHeuristic]);
                    logEvent(`[SUCCESS] ✨ New Heuristic Learned: "${newHeuristic}"`);
                    return { success: true, message: `New heuristic learned and added to agent's core logic.` };
                } else if (newHeuristic) {
                    logEvent(`[INFO] 😐 Agent generated a heuristic that was already learned.`);
                    return { success: true, message: `The generated heuristic was already known.` };
                } else {
                    throw new Error("AI failed to generate a valid heuristic.");
                }
            }
        },
        robot: {
            getState: () => ({ robot: robotState, environment: environmentState }),
            moveForward: () => {
                return new Promise((resolve, reject) => {
                    setRobotState(prev => {
                        let { x, y } = prev;
                        if (prev.rotation === 0) y -= 1; // Up
                        if (prev.rotation === 90) x += 1; // Right
                        if (prev.rotation === 180) y += 1; // Down
                        if (prev.rotation === 270) x -= 1; // Left

                        const isCollision = environmentState.some(obj => obj.x === x && obj.y === y && obj.type === 'wall');
                        if (isCollision) {
                            reject(new Error("Move failed: Robot would collide with a wall."));
                            return prev;
                        }
                        
                        resolve({ success: true, message: `Moved forward to (${x}, ${y})`});
                        return { ...prev, x, y };
                    });
                });
            },
            turn: (direction: 'left' | 'right') => {
                 setRobotState(prev => {
                    const newRotation = direction === 'left' 
                        ? (prev.rotation - 90 + 360) % 360
                        : (prev.rotation + 90) % 360;
                    return { ...prev, rotation: newRotation };
                });
                return { success: true, message: `Turned ${direction}.` };
            },
            pickupResource: () => {
                const resourceObj = environmentState.find(obj => obj.type === 'resource');
                if (robotState.hasResource) {
                    throw new Error("Pickup failed: Robot is already carrying a resource.");
                }
                if (resourceObj && resourceObj.x === robotState.x && resourceObj.y === robotState.y) {
                    setRobotState(prev => ({...prev, hasResource: true}));
                    setEnvironmentState(prev => prev.filter(obj => obj.type !== 'resource'));
                    return { success: true, message: "Resource picked up." };
                }
                throw new Error("Pickup failed: Robot is not at the resource location.");
            },
            deliverResource: () => {
                 const collectionPointObj = environmentState.find(obj => obj.type === 'collection_point');
                 if (!robotState.hasResource) {
                    throw new Error("Delivery failed: Robot is not carrying a resource.");
                }
                 if (collectionPointObj && collectionPointObj.x === robotState.x && collectionPointObj.y === robotState.y) {
                    setRobotState(prev => ({...prev, hasResource: false}));
                    const gainedEnergy = 50;
                    setAgentResources(prev => ({ ...prev, Energy: (prev.Energy || 0) + gainedEnergy }));
                    logEvent(`[SUCCESS] +${gainedEnergy} Energy! Resource delivered to the collection point.`);
                    
                     // Respawn the resource
                    setTimeout(() => {
                        setEnvironmentState(prevEnv => {
                            const validSpawns = [];
                            const existingObjects = new Set(prevEnv.map(o => `${o.x},${o.y}`));
                            for (let x = 1; x < 11; x++) {
                                for (let y = 1; y < 11; y++) {
                                    if (!existingObjects.has(`${x},${y}`)) {
                                        validSpawns.push({ x, y });
                                    }
                                }
                            }
                            if (validSpawns.length > 0) {
                                const spawnPoint = validSpawns[Math.floor(Math.random() * validSpawns.length)];
                                return [...prevEnv, { x: spawnPoint.x, y: spawnPoint.y, type: 'resource' }];
                            }
                            return prevEnv;
                        });
                    }, 500);

                    return { success: true, message: `Resource delivered. Gained ${gainedEnergy} Energy.` };
                 }
                 throw new Error("Delivery failed: Robot is not at the collection point.");
            }
        },
        graph: {
            generate: async (toolsToGraph: LLMTool[], onProgress: (msg: string) => void): Promise<KnowledgeGraph> => {
                 const CLUSTER_THRESHOLD = 0.65;
                 const MIN_CLUSTER_SIZE = 2;

                onProgress('Generating embeddings for all tools...');
                const toolTexts = toolsToGraph.map(tool => `passage: Tool: ${tool.name}. Description: ${tool.description}`);
                const toolEmbeddings = await generateEmbeddings(toolTexts, onProgress);
                
                const toolData = toolsToGraph.map((tool, i) => ({ tool, embedding: toolEmbeddings[i] }));

                onProgress('Clustering tools by semantic similarity...');
                let unclusteredTools = [...toolData];
                const clusters: { tool: LLMTool; embedding: number[] }[][] = [];

                while (unclusteredTools.length > 0) {
                    const seed = unclusteredTools.shift()!;
                    const cluster = [seed];

                    const remainingTools = [];
                    for (const candidate of unclusteredTools) {
                        const similarity = dot(seed.embedding, candidate.embedding);
                        if (similarity > CLUSTER_THRESHOLD) {
                            cluster.push(candidate);
                        } else {
                            remainingTools.push(candidate);
                        }
                    }
                    unclusteredTools = remainingTools;
                    if (cluster.length >= MIN_CLUSTER_SIZE) {
                        clusters.push(cluster);
                    }
                }
                
                onProgress(`Found ${clusters.length} potential clusters. Naming them programmatically...`);

                const nodes: KnowledgeGraphNode[] = [];
                const edges: any[] = [];
                const workflowRegex = /const workflowSteps\s*=\s*\[([\s\S]*?)\];/;

                // Add all tool nodes first
                toolsToGraph.forEach(tool => {
                    nodes.push({ id: tool.id, label: tool.name, type: tool.category, rawTool: tool });
                });

                for (let i = 0; i < clusters.length; i++) {
                    const cluster = clusters[i];
                    const clusterTools = cluster.map(d => d.tool);
                    
                    const clusterName = programmaticClusterNamer(clusterTools);

                    const clusterId = `cluster-${i}`;
                    nodes.push({ id: clusterId, label: clusterName, type: 'Topic' });
                    
                    cluster.forEach(d => {
                        edges.push({ source: d.tool.id, target: clusterId, type: 'belongs_to' });
                    });
                }
                
                // Add workflow edges
                 toolsToGraph.forEach(tool => {
                    if (tool.description.toLowerCase().includes('workflow') && tool.category === 'Automation') {
                        const match = tool.implementationCode.match(workflowRegex);
                        if (match && match[1]) {
                            try {
                                const stepsJson = `[${match[1]}]`;
                                const steps = JSON.parse(stepsJson);
                                if (Array.isArray(steps)) {
                                    steps.forEach(step => {
                                        if (step.toolName) {
                                            const targetTool = toolsToGraph.find(t => t.name === step.toolName);
                                            if (targetTool) {
                                                edges.push({ source: tool.id, target: targetTool.id, type: 'calls' });
                                            }
                                        }
                                    });
                                }
                            } catch (e) {
                                 logEvent(`[ERROR] Could not parse workflow steps for tool: ${tool.name}`);
                            }
                        }
                    }
                });

                return { nodes, edges };
            }
        }
    }), [tools, selectedModel, apiConfig, temperature, robotState, environmentState, agentResources, episodes, learnedHeuristics, runToolImplementation, logEvent, incrementApiCallCount]);

    const handleResetTools = useCallback(() => {
        if (window.confirm('This will delete ALL custom-made tools and restore the original set of tools. This action cannot be undone. Are you sure?')) {
            // Clear all relevant storage items
            localStorage.removeItem('singularity-agent-factory-state');
            localStorage.removeItem('tools'); // Legacy key
            
            // Update the state to immediately reflect the change in the UI
            const initialState = initializeState();
            setTools(initialState.tools);
            setEpisodes(initialState.episodes);
            setLearnedHeuristics(initialState.learnedHeuristics);

            setEventLog(['[SUCCESS] System reset complete. Original tools restored.']);
            setApiCallCount(0);
            setLastResponse(null);
            setActiveUITool(null);
            setAgentResources({ Energy: 100 });
        }
    }, []);

    const handleClearEmbeddingsCache = useCallback(() => {
        if (window.confirm('This will clear the cached tool embeddings, forcing them to be recalculated on the next embedding search. Are you sure?')) {
            setToolEmbeddingsCache(new Map());
            logEvent("[INFO] Tool embeddings cache has been cleared.");
        }
    }, [logEvent]);


    const executeAction = useCallback(async (toolCall: AIToolCall): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        let infoMessage: string | null = null;
        let executionError: string | null = null;

        const toolToExecute = findToolByName(toolCall.name);
        if (!toolToExecute) {
            throw new Error(`AI returned unknown tool name: ${toolCall.name}`);
        }
        
        // --- NEW: Resource Cost Check ---
        const toolCost = toolToExecute.cost || 0;
        if (toolCost > 0) {
            if ((agentResources.Energy || 0) < toolCost) {
                const errorMsg = `Execution failed: Insufficient Energy to use tool '${toolToExecute.name}'. Required: ${toolCost}, Available: ${agentResources.Energy}.`;
                logEvent(`[ERROR] ${errorMsg}`);
                enrichedResult.executionError = errorMsg;
                setLastResponse(enrichedResult);
                return enrichedResult;
            }
            logEvent(`[INFO] Spending ${toolCost} Energy to use ${toolToExecute.name}.`);
            setAgentResources(prev => ({...prev, Energy: (prev.Energy || 0) - toolCost}));
        }


        enrichedResult.tool = toolToExecute;

        if (toolToExecute.category === 'UI Component') {
            setActiveUITool(toolToExecute);
            infoMessage = `▶️ Activating tool: "${toolToExecute.name}"`;
            enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else {
            if (toolCall.arguments === undefined || toolCall.arguments === null) {
                enrichedResult.executionError = "Execution failed: AI did not provide any arguments for the tool call.";
            } else {
                try {
                    const result = await runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtimeApi);
                    enrichedResult.executionResult = result;
                    if (result?.message) {
                        infoMessage = `✅ ${result.message}`;
                    } else {
                        infoMessage = `✅ Tool "${toolToExecute.name}" executed.`;
                    }
                } catch (execError) {
                    enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                    executionError = enrichedResult.executionError;
                }
            }
        }
        
        if(infoMessage) logEvent(`[INFO] ${infoMessage}`);
        if(executionError) logEvent(`[ERROR] ${executionError}`);

        setLastResponse(enrichedResult);

        return enrichedResult;

    }, [findToolByName, runtimeApi, runToolImplementation, logEvent, agentResources]);

    const handleApproveAction = useCallback(async () => {
        if (!proposedAction) return;

        setIsLoading(true);
        setLastResponse(null);
        logEvent(`[INFO] ⚙️ Executing approved action: ${proposedAction.name}`);
        
        const actionToExecute = { ...proposedAction };
        setProposedAction(null); // Clear proposal immediately

        try {
            await executeAction(actionToExecute);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred during execution.";
            logEvent(`[ERROR] ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    }, [proposedAction, executeAction, logEvent]);

    const handleRejectAction = useCallback(() => {
        logEvent("[INFO] Suggestion rejected. Please provide a new prompt.");
        setProposedAction(null);
        setLastResponse(null);
    }, [logEvent]);

    const processRequest = useCallback(async (prompt: string, isAutonomous: boolean = false, systemInstructionOverride?: string): Promise<EnrichedAIResponse | null> => {
        setIsLoading(true);
        setLastResponse(null);
        if (!isAutonomous) {
            setActiveUITool(null);
            setProposedAction(null);
        }

        try {
            if (isAutonomous) {
                setAutonomousActionCount(prev => prev + 1);
            }

            // --- STEP 1: Tool Retrieval ---
            let selectedToolNames: string[] = [];
            logEvent(`🔎 Retrieving tools with strategy: ${toolRetrievalStrategy}...`);
            
            switch (toolRetrievalStrategy) {
                case ToolRetrievalStrategy.LLM: {
                    logEvent("[INFO] 🧠 Retrieving relevant tools via LLM...");
                    const retrieverLogicTool = findToolByName('Tool Retriever Logic');
                    if (!retrieverLogicTool) throw new Error("Critical error: 'Tool Retriever Logic' tool not found.");
                    
                    incrementApiCallCount('Tool Selection');
                    const { names } = await aiService.selectTools(prompt, retrieverLogicTool.implementationCode, selectedModel, apiConfig, temperature, tools, logEvent);
                    selectedToolNames = names;
                    break;
                }
                case ToolRetrievalStrategy.Embedding: {
                    logEvent("[INFO] 🧠 Retrieving relevant tools via embedding search...");
                    const foundTools = await retrieveToolsByEmbeddings(
                        prompt, 
                        tools, 
                        toolEmbeddingsCache,
                        setToolEmbeddingsCache,
                        logEvent,
                        embeddingSimilarityThreshold,
                        embeddingTopK
                    );
                    selectedToolNames = foundTools.map(t => t.name);
                    break;
                }
                case ToolRetrievalStrategy.Direct: {
                    logEvent("[INFO] 🧠 Providing all tools directly to agent...");
                    selectedToolNames = tools.map(t => t.name);
                    break;
                }
            }
            logEvent(`🛠️ Agent will use these tools: [${selectedToolNames.join(', ')}]`);

            // --- STEP 2: Agent Execution ---
            const coreLogicTool = findToolByName('Core Agent Logic');
            if (!coreLogicTool && !systemInstructionOverride) throw new Error("Critical error: 'Core Agent Logic' tool not found and no override provided.");
            
            const mandatoryToolNames = ['Core Agent Logic', 'Tool Creator', 'Tool Improver', 'Workflow Creator', 'Tool Self-Tester', 'Tool Verifier', 'Task Complete', 'Refuse Task', 'Action Critic', 'Strategic Reviewer'];
            const relevantToolNames = new Set([...selectedToolNames, ...mandatoryToolNames]);
            const relevantTools = Array.from(relevantToolNames).map(name => findToolByName(name)).filter((t): t is LLMTool => !!t);
            
            const agentSystemInstruction = systemInstructionOverride || coreLogicTool!.implementationCode;
            const agentTools = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Tool Retriever Logic');

            // NEW: Augment the system instruction with the list of tool names AND learned heuristics
            const toolListForContext = agentTools.map(t => `- "${t.name}"`).join('\n');
            const heuristicsForContext = learnedHeuristics.length > 0
                ? `\n\n---REFERENCE: Learned Heuristics---\n* ${learnedHeuristics.join('\n* ')}`
                : '';
            const augmentedSystemInstruction = `${agentSystemInstruction}\n\n---REFERENCE: Original Tool Names---\n${toolListForContext}${heuristicsForContext}`;

            if (isAutonomous) {
                logEvent(`🤖 Agent is thinking... Prompt size: ${prompt.length} chars. Tools: ${agentTools.length}.`);
            } else {
                logEvent("[INFO] 🤖 Preparing agent with selected tools...");
            }

            const handleRawResponseChunk = (rawResponse: string) => {
                // With the new log, we don't need to show raw responses in the same way.
                // Could log this if needed for deep debugging, but for now we omit it to reduce noise.
            };
            
            incrementApiCallCount('Agent Execution');
            const aiResponse: AIResponse = await aiService.generateResponse(prompt, augmentedSystemInstruction, selectedModel, apiConfig, temperature, handleRawResponseChunk, logEvent, agentTools);
            
            if (!isAutonomous) {
                setUserInput(''); // Clear input only for user-submitted prompts
            }

            if(!aiResponse.toolCall) {
                const noToolMessage = "[WARN] The AI did not select a tool to execute. Please try rephrasing your request.";
                logEvent(noToolMessage);
                return null;
            }
            
            if (operatingMode === OperatingMode.Assist && !isAutonomous) {
                setProposedAction(aiResponse.toolCall);
                logEvent("[INFO] The agent has a suggestion. Please review and approve or reject it.");
                const proposalResponse: EnrichedAIResponse = { ...aiResponse, executionResult: { status: "AWAITING_USER_APPROVAL" } };
                return proposalResponse;
            } else {
                 if (isAutonomous) logEvent(`💡 Agent decided to call: ${aiResponse.toolCall.name} with args: ${JSON.stringify(aiResponse.toolCall.arguments)}`);
                logEvent(`⚙️ Executing: ${aiResponse.toolCall.name}...`);
                const executionResult = await executeAction(aiResponse.toolCall);
                 if (isAutonomous) {
                    const isToolCreation = executionResult.toolCall?.name === 'Tool Creator' && executionResult.executionResult?.success;
                    const resultSummary = executionResult.executionError 
                        ? `❌ Execution Failed: ${executionResult.executionError}`
                        : isToolCreation
                        ? `💡 Agent created tool: '${executionResult.toolCall.arguments.name}' (Purpose: ${executionResult.toolCall.arguments.purpose})`
                        : `✅ Execution Succeeded. Result: ${JSON.stringify(executionResult.executionResult?.message || executionResult.executionResult || 'OK')}`;
                    logEvent(resultSummary);
                }
                return executionResult;
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
            logEvent(`[ERROR] ${errorMessage}`);
            throw err; // Re-throw the error so swarm/task loops can catch it
        } finally {
            if (!isAutonomous) {
                setIsLoading(false);
            }
        }
    }, [tools, findToolByName, selectedModel, apiConfig, temperature, runtimeApi, operatingMode, executeAction, logEvent, toolRetrievalStrategy, toolEmbeddingsCache, embeddingSimilarityThreshold, embeddingTopK, incrementApiCallCount, learnedHeuristics]);

    const stopAndRecordEpisode = useCallback((historyRef: React.MutableRefObject<EnrichedAIResponse[]>, goal: string, status: EpisodeStatus) => {
        if (historyRef.current.length === 0) return;
        
        const newEpisode: Episode = {
            id: `ep-${new Date().getTime()}-${Math.random().toString(36).substring(2, 7)}`,
            startTime: new Date().toISOString(), // This is technically the end time, needs improvement
            endTime: new Date().toISOString(),
            status,
            goal,
            actions: [...historyRef.current]
        };
        
        setEpisodes(prev => [...prev, newEpisode]);
        historyRef.current = [];
        logEvent(`[INFO] 📼 Game Tape saved. Episode status: ${status}.`);
    }, [logEvent]);

    const handleStopTask = useCallback(() => {
        setIsTaskLoopRunning(false);
        stopAndRecordEpisode(taskHistoryRef, currentUserTask, 'Terminated by User');
        logEvent("[INFO] ⏹️ User requested to stop the task.");
    }, [logEvent, stopAndRecordEpisode, currentUserTask]);

     const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        stopAndRecordEpisode(swarmHistoryRef, currentUserTask, 'Terminated by User');
        logEvent("[INFO] 🛑 Swarm task stopped by user.");
    }, [logEvent, stopAndRecordEpisode, currentUserTask]);

    const runSwarmCycle = useCallback(async () => {
        if (!isSwarmRunningRef.current) {
            setIsLoading(false);
            setIsSwarmRunning(false);
            stopAndRecordEpisode(swarmHistoryRef, currentUserTask, 'Terminated by User'); // Could be 'Failed' if it auto-stops
            logEvent("[SUCCESS] Swarm task concluded.");
            return;
        }

        const MAX_ITERATIONS = 25;
        if (swarmIterationCounter.current >= MAX_ITERATIONS) {
            logEvent("[WARN] ⚠️ Swarm reached maximum iterations. Stopping.");
            setIsSwarmRunning(false);
            setIsLoading(false);
            stopAndRecordEpisode(swarmHistoryRef, currentUserTask, 'Failed');
            return;
        }

        const idleAgentIndex = agentSwarm.findIndex(a => a.status === 'idle');
        if (idleAgentIndex === -1) {
            // No idle agents, wait a moment and check again
            setTimeout(runSwarmCycle, 2000);
            return;
        }

        const agent = agentSwarm[idleAgentIndex];
        swarmIterationCounter.current++;

        try {
            // Set agent to working
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking about next step...', error: null } : a));
            
            const historyString = swarmHistoryRef.current.length > 0
              ? `The swarm has already performed these actions:\n${swarmHistoryRef.current.map(r => {
                  const toolName = r.toolCall?.name || 'Unknown Action';
                  if (r.executionError) {
                    return `Action: ${toolName} - Result: FAILED - Reason: ${r.executionError}`;
                  } else {
                    const successMessage = r.executionResult?.message || JSON.stringify(r.executionResult);
                    return `Action: ${toolName} - Result: SUCCEEDED - Output: ${successMessage}`;
                  }
                }).join('\n')}`
              : "The swarm has not performed any actions yet.";
            
            const promptForAgent = `The swarm's overall goal is: "${currentUserTask}".\n\n${historyString}\n\nBased on this, what is the single next action for an agent to take? If the goal is fully complete, call the "Task Complete" tool.`;

            const result = await processRequest(promptForAgent, true, SWARM_AGENT_SYSTEM_PROMPT);

            if (!isSwarmRunningRef.current) throw new Error("Swarm stopped by user during processing.");

            if (result) {
                swarmHistoryRef.current.push(result);
                const actionSummary = result.toolCall ? `Called '${result.toolCall.name}'` : 'No action taken';
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'succeeded', lastAction: actionSummary, result: result.executionResult } : a));
                
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${result.executionResult?.message || 'Finished!'}`);
                    setIsSwarmRunning(false);
                    setIsLoading(false);
                    stopAndRecordEpisode(swarmHistoryRef, currentUserTask, 'Completed');
                    return;
                }
            } else {
                 setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Agent did not choose an action.' } : a));
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            // Terminate the failing agent and spawn a new one
            setAgentSwarm(prev => {
                const terminatedStatus: AgentStatus = 'terminated';
                const failedSwarm = prev.map(a => a.id === agent.id ? { ...a, status: terminatedStatus, error: errorMessage, lastAction: `FAILED: ${a.lastAction}` } : a);
                swarmAgentIdCounter.current++;
                const newAgent: AgentWorker = {
                    id: `agent-${swarmAgentIdCounter.current}`,
                    status: 'idle',
                    lastAction: 'Newly spawned',
                    error: null,
                    result: null,
                };
                return [...failedSwarm, newAgent];
            });
        }
        
        // Schedule the next cycle
        setTimeout(runSwarmCycle, 1000);
    }, [agentSwarm, currentUserTask, processRequest, logEvent, stopAndRecordEpisode]);


    const startSwarmTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsSwarmRunning(true);
        setCurrentUserTask(initialTask);
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
        logEvent(`[INFO] 🚀 Starting swarm task: "${initialTask}"`);
        setEventLog(prev => prev.slice(-1)); // Clear previous logs, keep the start message

        const initialAgents: AgentWorker[] = Array.from({ length: 3 }, (_, i) => ({
            id: `agent-${i + 1}`,
            status: 'idle',
            lastAction: 'Awaiting instructions',
            error: null,
            result: null,
        }));
        setAgentSwarm(initialAgents);
        
        // Use useEffect to kick off the cycle once the initial state is set
    }, [logEvent]);

    useEffect(() => {
        if (isSwarmRunning && agentSwarm.length > 0 && agentSwarm.every(a => a.status !== 'working')) {
            runSwarmCycle();
        }
    }, [isSwarmRunning, agentSwarm, runSwarmCycle]);

    const runTaskCycle = useCallback(async () => {
        if (!taskIsRunningRef.current) {
            setIsLoading(false);
            logEvent("[INFO] Task concluded.");
            return;
        }
        logEvent("🌀 Starting new task cycle...");

        try {
            const historyString = taskHistoryRef.current.length > 0
              ? `You have already performed these actions:\n${taskHistoryRef.current.map(r => {
                  const toolName = r.toolCall?.name || 'Unknown Action';
                  if (r.executionError) {
                    return `Action: ${toolName} - Result: FAILED - Reason: ${r.executionError}`;
                  } else {
                    const successMessage = r.executionResult?.message || JSON.stringify(r.executionResult);
                    return `Action: ${toolName} - Result: SUCCEEDED - Output: ${successMessage}`;
                  }
                }).join('\n')}`
              : "You have not performed any actions yet.";

            const promptForAgent = `Your overall goal is: "${currentUserTask}".\n\n${historyString}\n\nBased on this, what is the single next step to take? If the goal is fully complete, call the "Task Complete" tool.`;
            
            const result = await processRequest(promptForAgent, true, TASK_AGENT_SYSTEM_PROMPT);
            
            if (!taskIsRunningRef.current) throw new Error("Task stopped by user during processing.");

            if (result) {
                taskHistoryRef.current.push(result);
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Task Completed: ${result.executionResult?.message || 'Finished!'}`);
                    setIsTaskLoopRunning(false);
                    stopAndRecordEpisode(taskHistoryRef, currentUserTask, 'Completed');
                    return; // End of loop
                }
            } else {
                 // If the agent does not choose a tool, consider it a failure for this cycle.
                 taskHistoryRef.current.push({ toolCall: null, executionError: "Agent failed to choose an action." });
            }
        } catch (err) {
             taskHistoryRef.current.push({ toolCall: null, executionError: err instanceof Error ? err.message : String(err) });
        }
        
        // Schedule the next cycle
        setTimeout(runTaskCycle, 1000);

    }, [currentUserTask, processRequest, logEvent, stopAndRecordEpisode]);
    
    const startTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsTaskLoopRunning(true);
        setCurrentUserTask(initialTask);
        taskHistoryRef.current = [];
        setUserInput('');
        logEvent(`[INFO] 🚀 Starting task: "${initialTask}"`);
        setEventLog(prev => prev.slice(-1)); // Clear previous logs, keep the start message
    }, [logEvent]);
    
     useEffect(() => {
        if (isTaskLoopRunning) {
            runTaskCycle();
        }
    }, [isTaskLoopRunning, runTaskCycle]);


    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) {
            logEvent("[WARN] Please enter a task or describe a tool to create.");
            return;
        }

        if (operatingMode === OperatingMode.Swarm) {
            await startSwarmTask(userInput);
            return;
        }
        
        if (operatingMode === OperatingMode.Task) {
            await startTask(userInput);
            return;
        }

        const directExecutionRegex = /^run\s+"([^"]+)"\s+with\s+(.*)$/s;
        const match = userInput.trim().match(directExecutionRegex);

        if (match) {
            setIsLoading(true);
            try {
                const [, toolName, paramsJson] = match;
                const toolCall: AIToolCall = { name: toolName, arguments: JSON.parse(paramsJson) };
                await executeAction(toolCall);
                logEvent(`[INFO] ⚡️ Direct Execution`);
                setUserInput('');
            } catch (err) {
                logEvent(err instanceof Error ? `[ERROR] Direct execution failed: ${err.message}` : "[ERROR] An unexpected error occurred during direct execution.");
            } finally {
                setIsLoading(false);
            }
        } else {
            await processRequest(userInput, false);
        }
    }, [userInput, processRequest, executeAction, operatingMode, startSwarmTask, startTask, logEvent]);

    // Create a ref to hold all dependencies for the autonomous loop.
    // This prevents the loop's useEffect from re-firing on every state change.
    const autonomousLoopDependencies = useRef({
        logEvent,
        autonomousActionLimit,
        autonomousActionCount,
        findToolByName,
        selectedModel,
        apiConfig,
        temperature,
        tools,
        processRequest,
        setAutonomousActionCount,
        setLastActionDate,
        autonomousHistoryRef,
        robotState,
        environmentState,
        agentResources,
        cycleDelay,
        incrementApiCallCount,
        stopAndRecordEpisode,
        autonomousGoalRef,
    });

    // Keep the ref updated with the latest state and functions.
    useEffect(() => {
        autonomousLoopDependencies.current = {
            logEvent,
            autonomousActionLimit,
            autonomousActionCount,
            findToolByName,
            selectedModel,
            apiConfig,
            temperature,
            tools,
            processRequest,
            setAutonomousActionCount,
            setLastActionDate,
            autonomousHistoryRef,
            robotState,
            environmentState,
            agentResources,
            cycleDelay,
            incrementApiCallCount,
            stopAndRecordEpisode,
            autonomousGoalRef,
        };
    }, [
        logEvent,
        autonomousActionLimit,
        autonomousActionCount,
        findToolByName,
        selectedModel,
        apiConfig,
        temperature,
        tools,
        processRequest,
        setAutonomousActionCount,
        setLastActionDate,
        robotState,
        environmentState,
        agentResources,
        cycleDelay,
        incrementApiCallCount,
        stopAndRecordEpisode,
    ]);
    
    // The autonomous loop. It now ONLY depends on the on/off switch.
    useEffect(() => {
        if (!isAutonomousLoopRunning) {
            return;
        }

        const autonomousRunner = async () => {
            const { logEvent: initialLog, autonomousHistoryRef: historyRef, autonomousGoalRef: goalRef } = autonomousLoopDependencies.current;
            initialLog("[INFO] ▶️ Starting autonomous loop...");
            historyRef.current = [];
            goalRef.current = "Achieve long-term autonomy by gathering resources and improving tools.";
            
            while (isRunningRef.current) {
                // Get the latest dependencies on each iteration from the ref.
                const {
                    logEvent,
                    autonomousActionLimit,
                    autonomousActionCount,
                    findToolByName,
                    selectedModel,
                    apiConfig,
                    temperature,
                    tools,
                    processRequest,
                    setAutonomousActionCount,
                    setLastActionDate,
                    autonomousHistoryRef,
                    robotState,
                    environmentState,
                    agentResources,
                    cycleDelay,
                    incrementApiCallCount,
                } = autonomousLoopDependencies.current;

                logEvent("🌀 Starting new cycle...");
                
                let currentCountForThisCycle = autonomousActionCount;
                const today = new Date().toDateString();
                const lastDate = localStorage.getItem('lastActionDate') || '';
                
                if (lastDate !== today) {
                    logEvent("[INFO] ☀️ New day detected, resetting autonomous action counter.");
                    currentCountForThisCycle = 0;
                    setAutonomousActionCount(0);
                    setLastActionDate(today);
                    autonomousHistoryRef.current = []; // Also clear history for the new day
                }
                
                if (autonomousActionLimit !== -1 && currentCountForThisCycle >= autonomousActionLimit) {
                    logEvent(`[WARN] 🛑 Daily limit of ${autonomousActionLimit} actions reached. Stopping loop.`);
                    setIsAutonomousLoopRunning(false);
                    autonomousLoopDependencies.current.stopAndRecordEpisode(autonomousHistoryRef, autonomousLoopDependencies.current.autonomousGoalRef.current, 'Failed');
                    break;
                }

                try {
                    // This is the core architectural change.
                    // 1. Generate a high-level, natural language goal.
                    logEvent("🤔 Deciding next action...");
                    const goalGenTool = findToolByName('Autonomous Goal Generator');
                    if (!goalGenTool) throw new Error("Critical error: 'Autonomous Goal Generator' tool not found.");
                    
                    const actionHistoryString = autonomousHistoryRef.current.length > 0
                      ? autonomousHistoryRef.current.slice(-5).map(r => {
                          const toolName = r.toolCall?.name || 'Unknown Action';
                          if (r.executionError) {
                            return `Action: ${toolName} - Result: FAILED - Reason: ${r.executionError}`;
                          } else {
                            const successMessage = r.executionResult?.message || JSON.stringify(r.executionResult);
                            return `Action: ${toolName} - Result: SUCCEEDED - Output: ${successMessage}`;
                          }
                        }).join('\n')
                      : null;
                    
                    const remainingActions = autonomousActionLimit === -1 ? Infinity : autonomousActionLimit - currentCountForThisCycle;
                    const goalPrompt = "What should I do next?"; // This is a generic trigger for the goal generator.
                    
                    incrementApiCallCount('Goal Generation');
                    const { goal } = await aiService.generateGoal(
                        goalGenTool.implementationCode, goalPrompt, selectedModel, apiConfig, temperature, tools, remainingActions, actionHistoryString, robotState, environmentState, agentResources
                    );
                    
                    if (goal && goal.toLowerCase().trim() !== "no action needed.") {
                        logEvent(`🎯 New Goal: ${goal}`);
                        
                        // 2. Feed the natural language goal into the full agent process.
                        // The agent will now perform tool retrieval and execution based on this goal.
                        const result = await processRequest(goal, true);

                        // 3. Store the full, enriched result in history.
                        if (result) {
                          autonomousHistoryRef.current.unshift(result);
                           if (result.toolCall?.name === 'Deliver Resource' && result.executionResult?.success) {
                                logEvent(`[SUCCESS] ✅ Mission accomplished! Stopping loop.`);
                                setIsAutonomousLoopRunning(false);
                                autonomousLoopDependencies.current.stopAndRecordEpisode(autonomousHistoryRef, autonomousLoopDependencies.current.autonomousGoalRef.current, 'Completed');
                            }
                        }
                    } else {
                        logEvent("🧘 No action needed. Agent is idle.");
                    }
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred in autonomous cycle.";
                    logEvent(`[ERROR] Error in autonomous cycle: ${errorMessage}`);
                }
                
                if (!isRunningRef.current) break;

                logEvent(`⏸️ Cycle finished. Pausing for ${cycleDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, cycleDelay));
            }

            if (!isRunningRef.current) {
                const { logEvent: finalLog, autonomousHistoryRef, autonomousGoalRef, stopAndRecordEpisode } = autonomousLoopDependencies.current;
                finalLog("[INFO] ⏹️ Autonomous loop stopped.");
                stopAndRecordEpisode(autonomousHistoryRef, autonomousGoalRef.current, 'Terminated by User');
            }
        };

        autonomousRunner();
    // The ONLY dependency is the on/off switch, which prevents the race condition.
    }, [isAutonomousLoopRunning]);
    
    const handleToggleAutonomousLoop = () => {
        if(operatingMode !== OperatingMode.Autonomous) {
            logEvent("[WARN] Autonomous loop can only be started in Autonomous mode.");
            return;
        }
        setIsAutonomousLoopRunning(prev => !prev);
    };

    const getUITool = (name: string) => {
        const tool = tools.find(t => t.name === name);
        if (tool && tool.category === 'UI Component') return tool;
        return {
            id: 'ui_tool_not_found', name: `UI Tool Not Found`, description: `A UI tool with the name '${name}' could not be found.`,
            category: 'UI Component', version: 1, parameters: [],
            implementationCode: `
              return (
                <div className="p-4 bg-red-900/50 border-2 border-dashed border-red-500 rounded-lg text-red-300">
                  <p className="font-bold">UI Tool Missing: '${name}'</p>
                </div>
              );
            `
        } as LLMTool;
    };

    const uiProps = {
        userInput, isLoading,
        tools,
        models: AVAILABLE_MODELS,
        selectedModelId,
        temperature, setTemperature,
        toolRetrievalStrategy, setToolRetrievalStrategy,
        setUserInput, handleSubmit, setSelectedModelId,
        UIToolRunner,
        apiConfig, setApiConfig,
        handleResetTools,
        handleClearEmbeddingsCache,
        operatingMode, setOperatingMode,
        autonomousActionCount, autonomousActionLimit, setAutonomousActionLimit,
        cycleDelay, setCycleDelay,
        proposedAction, handleApproveAction, handleRejectAction,
        isAutonomousLoopRunning, handleToggleAutonomousLoop,
        isTaskLoopRunning, handleStopTask,
        agentSwarm, isSwarmRunning, handleStopSwarm,
        embeddingSimilarityThreshold, setEmbeddingSimilarityThreshold,
        embeddingTopK, setEmbeddingTopK,
        robotState, environmentState,
        selectedGraphNode, handleGraphNodeClick,
        agentResources,
        runtime: runtimeApi,
        episodes,
        learnedHeuristics,
    };

    const debugLogProps = {
        logs: eventLog,
        onReset: handleResetTools,
        apiCallCount: apiCallCount,
        apiCallLimit: autonomousActionLimit,
    };

    const isHuggingFaceModel = selectedModel.provider === ModelProvider.HuggingFace;
    const showRemoteApiConfig = !isHuggingFaceModel && ['GoogleAI', 'OpenAI_API', 'Ollama'].includes(selectedModel.provider);
    const showSwarmPanel = operatingMode === OperatingMode.Swarm && agentSwarm.length > 0;
    const showActivityPanel = operatingMode === OperatingMode.Autonomous || operatingMode === OperatingMode.Task;

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getUITool('Application Header')} props={uiProps} />
            
            <main className="flex-grow flex flex-col gap-8">
                <UIToolRunner tool={getUITool('Security Warning Banner')} props={uiProps} />
                <UIToolRunner tool={getUITool('System Controls')} props={uiProps} />
                <div className="w-full max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <UIToolRunner tool={getUITool('Operating Mode Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Agent Inventory')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Autonomous Resource Monitor')} props={uiProps} />
                   <UIToolRunner tool={getUITool('Autonomous Action Limiter')} props={uiProps} />
                   <UIToolRunner tool={getUITool('Autonomous Cycle Delay Control')} props={uiProps} />
                </div>
                
                 {showActivityPanel && (
                    <div className="w-full max-w-7xl mx-auto">
                        <UIToolRunner tool={getUITool('Autonomous Control Panel')} props={uiProps} />
                    </div>
                )}
                 {showSwarmPanel && (
                    <div className="w-full max-w-7xl mx-auto">
                        <UIToolRunner tool={getUITool('Agent Swarm Display')} props={uiProps} />
                    </div>
                )}


                <div className="w-full max-w-4xl mx-auto">
                    <UIToolRunner tool={getUITool('Robot Simulation Environment')} props={uiProps} />
                </div>


                <div className="flex flex-col gap-4 mt-8">
                  <UIToolRunner tool={getUITool('AI Model Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Tool Retrieval Strategy Selector')} props={uiProps} />
                  {toolRetrievalStrategy === 'EMBEDDING' && (
                    <UIToolRunner tool={getUITool('Embedding Parameters Configuration')} props={uiProps} />
                  )}
                  <UIToolRunner tool={getUITool('Model Parameters Configuration')} props={uiProps} />
                  
                  {isHuggingFaceModel && (
                      <UIToolRunner tool={getUITool('Hugging Face Configuration')} props={uiProps} />
                  )}
                  {showRemoteApiConfig && (
                    <UIToolRunner tool={getUITool('API Endpoint Configuration')} props={{ ...uiProps, selectedModelProvider: selectedModel.provider, selectedModelId: selectedModel.id }} />
                  )}

                  <UIToolRunner tool={getUITool('User Input Form')} props={uiProps} />
                </div>

                {proposedAction && (
                    <UIToolRunner tool={getUITool('Action Proposal Panel')} props={uiProps} />
                )}

                {activeUITool && (
                    <div className="w-full max-w-3xl mx-auto mt-6">
                        <div className="bg-gray-800/80 border border-indigo-500 rounded-xl shadow-lg">
                            <div className="flex justify-between items-center p-3 border-b border-gray-700">
                                <h3 className="text-lg font-bold text-indigo-300">Active Tool: {activeUITool.name}</h3>
                                <button 
                                    onClick={() => setActiveUITool(null)}
                                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-1 px-3 rounded-full text-lg leading-none"
                                    aria-label="Close active tool"
                                >
                                    &times;
                                </button>
                            </div>
                            <div className="p-4">
                                <UIToolRunner tool={activeUITool} props={{}} />
                            </div>
                        </div>
                    </div>
                )}
                
                <UIToolRunner tool={getUITool('Learned Heuristics Display')} props={uiProps} />
                <UIToolRunner tool={getUITool('Game Tapes Viewer')} props={uiProps} />
                <UIToolRunner tool={getUITool('Tool Knowledge Graph Display')} props={uiProps} />
                <UIToolRunner tool={getUITool('Tool List Display')} props={uiProps} />
            </main>

            <UIToolRunner tool={getUITool('Application Footer')} props={uiProps} />
            
            <UIToolRunner tool={getUITool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;
