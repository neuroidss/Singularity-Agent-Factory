import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS, DEFAULT_HUGGING_FACE_DEVICE, SWARM_AGENT_SYSTEM_PROMPT } from './constants';
import type { LLMTool, EnrichedAIResponse, DebugInfo, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, ToolSelectionCallInfo, AgentExecutionCallInfo, AgentWorker, AgentStatus, RobotState, EnvironmentObject } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider, OperatingMode, ToolRetrievalStrategy } from './types';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { retrieveToolsByEmbeddings } from './services/embeddingService';

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

const initializeTools = (): LLMTool[] => {
    const loadedState = loadStateFromStorage();
    if (loadedState && loadedState.tools) {
        return loadedState.tools;
    }
    // If nothing in storage, initialize from predefined and add timestamps
    const now = new Date().toISOString();
    return PREDEFINED_TOOLS.map(tool => ({
        ...tool,
        createdAt: tool.createdAt || now,
        updatedAt: tool.updatedAt || now,
    }));
};


const App: React.FC = () => {
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [tools, setTools] = useState<LLMTool[]>(initializeTools);
    const [lastResponse, setLastResponse] = useState<EnrichedAIResponse | null>(null);
    const [showDebug, setShowDebug] = useState<boolean>(false);
    const [lastDebugInfo, setLastDebugInfo] = useState<DebugInfo | null>(null);
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
    const [autonomousLog, setAutonomousLog] = useState<string[]>([]);
    const autonomousHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isAutonomousLoopRunning);

    // State for Swarm mode
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const isSwarmRunningRef = useRef(isSwarmRunning);
    const swarmIterationCounter = useRef(0);
    const swarmAgentIdCounter = useRef(0);


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
    const [robotState, setRobotState] = useState<RobotState>({ x: 1, y: 1, rotation: 90, hasPackage: false });
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
        { x: 9, y: 2, type: 'package' },
        { x: 2, y: 9, type: 'goal' },
    ]);


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
                if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
                    initialConfig.googleAIAPIKey = process.env.GEMINI_API_KEY;
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
        if (tools.length > 0) {
            saveStateToStorage({ tools });
        }
    }, [tools]);
    
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
             setUserInput(`The swarm's goal is to deliver the package. First, create a tool that allows the robot to move in a square of a given size. Then, use that new tool to have one agent patrol a 3x3 square while another agent goes for the package.`);
        } else {
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

    const logToAutonomousPanel = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setAutonomousLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));
    }, []);

    const handleClearLog = useCallback(() => {
        setAutonomousLog([]);
    }, []);

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

                const result = await aiService.critiqueAction(
                    criticSystemPrompt, selectedModel, apiConfig, temperature
                );

                return result;
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
                        
                        resolve({ success: true, message: \`Moved forward to (${x}, ${y})\`});
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
                return { success: true, message: \`Turned \${direction}.\` };
            },
            grip: () => {
                const packageObj = environmentState.find(obj => obj.type === 'package');
                if (robotState.hasPackage) {
                    throw new Error("Grip failed: Robot is already holding the package.");
                }
                if (packageObj && packageObj.x === robotState.x && packageObj.y === robotState.y) {
                    setRobotState(prev => ({...prev, hasPackage: true}));
                    setEnvironmentState(prev => prev.filter(obj => obj.type !== 'package'));
                    return { success: true, message: "Package picked up." };
                }
                throw new Error("Grip failed: Robot is not at the package location.");
            },
            release: () => {
                 const goalObj = environmentState.find(obj => obj.type === 'goal');
                 if (!robotState.hasPackage) {
                    throw new Error("Release failed: Robot is not holding a package.");
                }
                 setRobotState(prev => ({...prev, hasPackage: false}));
                 if (goalObj && goalObj.x === robotState.x && goalObj.y === robotState.y) {
                    return { success: true, message: "Package delivered to the goal! Task complete." };
                 }
                 return { success: true, message: "Package dropped." };
            }
        },
    }), [tools, selectedModel, apiConfig, temperature, robotState, environmentState, runToolImplementation]);

    const handleResetTools = useCallback(() => {
        if (window.confirm('This will delete ALL custom-made tools and restore the original set of tools. This action cannot be undone. Are you sure?')) {
            // Clear all relevant storage items
            localStorage.removeItem('singularity-agent-factory-state');
            localStorage.removeItem('tools'); // Legacy key
            
            // Update the state to immediately reflect the change in the UI
            const now = new Date().toISOString();
            const defaultTools = PREDEFINED_TOOLS.map(tool => ({
                ...tool,
                createdAt: now,
                updatedAt: now,
            }));
            setTools(defaultTools);

            setInfo("System reset complete. All custom tools have been deleted and original tools have been restored.");
            setError(null);
            setLastResponse(null);
            setActiveUITool(null);
        }
    }, []);

    const handleClearEmbeddingsCache = useCallback(() => {
        if (window.confirm('This will clear the cached tool embeddings, forcing them to be recalculated on the next embedding search. Are you sure?')) {
            setToolEmbeddingsCache(new Map());
            setInfo("Tool embeddings cache has been cleared.");
        }
    }, []);


    const executeAction = useCallback(async (toolCall: AIToolCall): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        let infoMessage: string | null = null;
        let executionError: string | null = null;

        const toolToExecute = findToolByName(toolCall.name);
        if (!toolToExecute) {
            throw new Error(\`AI returned unknown tool name: \${toolCall.name}\`);
        }

        enrichedResult.tool = toolToExecute;

        if (toolToExecute.category === 'UI Component') {
            setActiveUITool(toolToExecute);
            infoMessage = \`▶️ Activating tool: "\${toolToExecute.name}"\`;
            enrichedResult.executionResult = { success: true, summary: \`Displayed UI tool '\${toolToExecute.name}'.\` };
        } else {
            if (!toolCall.arguments) {
                enrichedResult.executionError = "Execution failed: AI did not provide any arguments for the tool call.";
            } else {
                try {
                    const result = await runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtimeApi);
                    enrichedResult.executionResult = result;
                    if (result?.message) {
                        infoMessage = \`✅ \${result.message}\`;
                    } else {
                        infoMessage = \`✅ Tool "\${toolToExecute.name}" executed.\`;
                    }
                } catch (execError) {
                    enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                    executionError = enrichedResult.executionError;
                }
            }
        }
        
        if(infoMessage) setInfo(infoMessage);
        if(executionError) setError(executionError);

        setLastResponse(enrichedResult);
        setLastDebugInfo(prev => {
            if (!prev || !prev.agentExecutionCall) return prev;
            return { ...prev, agentExecutionCall: { ...prev.agentExecutionCall, processedResponse: enrichedResult } };
        });

        return enrichedResult;

    }, [findToolByName, runtimeApi, runToolImplementation]);

    const handleApproveAction = useCallback(async () => {
        if (!proposedAction) return;

        setIsLoading(true);
        setError(null);
        setLastResponse(null);
        setInfo(\`⚙️ Executing approved action...\`);
        
        const actionToExecute = { ...proposedAction };
        setProposedAction(null); // Clear proposal immediately

        try {
            await executeAction(actionToExecute);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred during execution.";
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [proposedAction, executeAction]);

    const handleRejectAction = useCallback(() => {
        setInfo("Suggestion rejected. Please provide a new prompt.");
        setProposedAction(null);
        setError(null);
        setLastResponse(null);
    }, []);

    const processRequest = useCallback(async (prompt: string, isAutonomous: boolean = false, systemInstructionOverride?: string): Promise<EnrichedAIResponse | null> => {
        setIsLoading(true);
        setError(null);
        setInfo(null);
        setLastResponse(null);
        if (!isAutonomous) {
            setActiveUITool(null);
            setProposedAction(null);
        }

        let debugInfoForRun: DebugInfo = {
            userInput: prompt,
            modelId: selectedModel.id,
            temperature,
            toolRetrievalStrategy,
        };
        setLastDebugInfo(debugInfoForRun);
        if (!showDebug) setShowDebug(true);

        try {
            if (isAutonomous) {
                setAutonomousActionCount(prev => prev + 1);
            }

            // --- STEP 1: Tool Retrieval ---
            let selectedToolNames: string[] = [];
            let toolSelectionDebug: ToolSelectionCallInfo = { strategy: toolRetrievalStrategy, userPrompt: prompt };
            if (isAutonomous) logToAutonomousPanel(\`🔎 Retrieving tools with strategy: \${toolRetrievalStrategy}...\`);
            
            switch (toolRetrievalStrategy) {
                case ToolRetrievalStrategy.LLM: {
                    setInfo("🧠 Retrieving relevant tools via LLM...");
                    const retrieverLogicTool = findToolByName('Tool Retriever Logic');
                    if (!retrieverLogicTool) throw new Error("Critical error: 'Tool Retriever Logic' tool not found.");
                    
                    const selectionSystemInstruction = retrieverLogicTool.implementationCode;
                    const allToolsForPrompt = tools.map(t => ({ name: t.name, description: t.description }));
                    
                    toolSelectionDebug = { ...toolSelectionDebug, systemInstruction: selectionSystemInstruction, availableTools: allToolsForPrompt, rawResponse: '⏳ Pending...' };
                    debugInfoForRun = { ...debugInfoForRun, toolSelectionCall: toolSelectionDebug };
                    setLastDebugInfo(debugInfoForRun);

                    const { names, rawResponse } = await aiService.selectTools(prompt, selectionSystemInstruction, selectedModel, apiConfig, temperature, tools, setInfo);
                    selectedToolNames = names;
                    toolSelectionDebug = { ...toolSelectionDebug, rawResponse, selectedToolNames: names };
                    break;
                }
                case ToolRetrievalStrategy.Embedding: {
                    setInfo("🧠 Retrieving relevant tools via embedding search...");
                    const foundTools = await retrieveToolsByEmbeddings(
                        prompt, 
                        tools, 
                        toolEmbeddingsCache,
                        setToolEmbeddingsCache,
                        setInfo,
                        embeddingSimilarityThreshold,
                        embeddingTopK
                    );
                    selectedToolNames = foundTools.map(t => t.name);
                    toolSelectionDebug = { ...toolSelectionDebug, availableTools: tools.map(t => ({name: t.name, description: t.description})), selectedToolNames };
                    break;
                }
                case ToolRetrievalStrategy.Direct: {
                    setInfo("🧠 Providing all tools directly to agent...");
                    selectedToolNames = tools.map(t => t.name);
                    toolSelectionDebug = { ...toolSelectionDebug, selectedToolNames };
                    break;
                }
            }
             if (isAutonomous) logToAutonomousPanel(\`🛠️ Agent will use these tools: [\${selectedToolNames.join(', ')}]\`);
            setLastDebugInfo(prev => ({ ...prev, toolSelectionCall: toolSelectionDebug }));

            // --- STEP 2: Agent Execution ---
            const coreLogicTool = findToolByName('Core Agent Logic');
            if (!coreLogicTool && !systemInstructionOverride) throw new Error("Critical error: 'Core Agent Logic' tool not found and no override provided.");
            
            const mandatoryToolNames = ['Core Agent Logic', 'Tool Creator', 'Tool Improver', 'Workflow Creator', 'Tool Self-Tester', 'Tool Verifier', 'Task Complete', 'Refuse Task', 'Action Critic'];
            const relevantToolNames = new Set([...selectedToolNames, ...mandatoryToolNames]);
            const relevantTools = Array.from(relevantToolNames).map(name => findToolByName(name)).filter((t): t is LLMTool => !!t);
            
            const agentSystemInstruction = systemInstructionOverride || coreLogicTool!.implementationCode;
            const agentTools = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Tool Retriever Logic');

            // NEW: Augment the system instruction with the list of tool names
            const toolListForContext = agentTools.map(t => \`- "\${t.name}"\`).join('\n');
            const augmentedSystemInstruction = \`\${agentSystemInstruction}\n\n---REFERENCE: Original Tool Names---\n\${toolListForContext}\`;

            if (isAutonomous) {
                logToAutonomousPanel(\`🤖 Agent is thinking... Prompt size: \${prompt.length} chars. Tools: \${agentTools.length}.\`);
            } else {
                setInfo("🤖 Preparing agent with selected tools...");
            }

            const agentExecutionCall: AgentExecutionCallInfo = {
                systemInstruction: augmentedSystemInstruction,
                userPrompt: prompt,
                toolsProvided: agentTools,
                rawResponse: '⏳ Pending...',
                processedResponse: null,
            };
            setLastDebugInfo(prev => ({ ...prev!, agentExecutionCall }));

            const handleRawResponseChunk = (rawResponse: string) => {
                setLastDebugInfo(prev => {
                    if (!prev || !prev.agentExecutionCall) return prev;
                    return { ...prev, agentExecutionCall: { ...prev.agentExecutionCall, rawResponse } };
                });
            };
            
            const aiResponse: AIResponse = await aiService.generateResponse(prompt, augmentedSystemInstruction, selectedModel, apiConfig, temperature, handleRawResponseChunk, setInfo, agentTools);
            
            if (!isAutonomous) {
                setUserInput(''); // Clear input only for user-submitted prompts
            }

            if(!aiResponse.toolCall) {
                const noToolMessage = "The AI did not select a tool to execute. Please try rephrasing your request.";
                if (isAutonomous) logToAutonomousPanel(\`⚠️ \${noToolMessage}\`);
                setInfo(noToolMessage);
                return null;
            }
            
            if (operatingMode === OperatingMode.Assist && !isAutonomous) {
                setProposedAction(aiResponse.toolCall);
                setInfo("The agent has a suggestion. Please review and approve or reject it.");
                const proposalResponse: EnrichedAIResponse = { ...aiResponse, executionResult: { status: "AWAITING_USER_APPROVAL" } };
                setLastDebugInfo(prev => {
                    if (!prev || !prev.agentExecutionCall) return prev;
                    return { ...prev, agentExecutionCall: { ...prev.agentExecutionCall, processedResponse: proposalResponse } };
                });
                return proposalResponse;
            } else {
                 if (isAutonomous) logToAutonomousPanel(\`💡 Agent decided to call: \${aiResponse.toolCall.name} with args: \${JSON.stringify(aiResponse.toolCall.arguments)}\`);
                logToAutonomousPanel(\`⚙️ Executing: \${aiResponse.toolCall.name}...\`);
                const executionResult = await executeAction(aiResponse.toolCall);
                 if (isAutonomous) {
                    const isToolCreation = executionResult.toolCall?.name === 'Tool Creator' && executionResult.executionResult?.success;
                    const resultSummary = executionResult.executionError 
                        ? \`❌ Execution Failed: \${executionResult.executionError}\`
                        : isToolCreation
                        ? \`💡 Agent created tool: '\${executionResult.toolCall.arguments.name}' (Purpose: \${executionResult.toolCall.arguments.purpose})\`
                        : \`✅ Execution Succeeded. Result: \${JSON.stringify(executionResult.executionResult?.message || executionResult.executionResult || 'OK')}\`;
                    logToAutonomousPanel(resultSummary);
                }
                return executionResult;
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(errorMessage);
            if(isAutonomous) logToAutonomousPanel(\`❌ Error: \${errorMessage}\`);
            const rawAIResponse = (err as any).rawAIResponse;

            setLastDebugInfo(prev => {
                const newDebug = { ...prev! };
                if (newDebug.agentExecutionCall) {
                    newDebug.agentExecutionCall.error = errorMessage;
                    newDebug.agentExecutionCall.rawResponse = rawAIResponse || newDebug.agentExecutionCall.rawResponse;
                } else if (newDebug.toolSelectionCall) {
                    newDebug.toolSelectionCall.error = errorMessage;
                    if(rawAIResponse) newDebug.toolSelectionCall.rawResponse = rawAIResponse;
                }
                return newDebug;
            });
            throw err; // Re-throw the error so swarm/task loops can catch it
        } finally {
            if (!isAutonomous) {
                setIsLoading(false);
            }
        }
    }, [tools, findToolByName, showDebug, selectedModel, apiConfig, temperature, runtimeApi, operatingMode, executeAction, logToAutonomousPanel, toolRetrievalStrategy, toolEmbeddingsCache, embeddingSimilarityThreshold, embeddingTopK]);

    const handleStopTask = useCallback(() => {
        setIsTaskLoopRunning(false);
        logToAutonomousPanel("⏹️ User requested to stop the task.");
    }, [logToAutonomousPanel]);

     const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        setInfo("🛑 Swarm task stopped by user.");
    }, []);

    const runSwarmCycle = useCallback(async () => {
        if (!isSwarmRunningRef.current) {
            setIsLoading(false);
            setIsSwarmRunning(false);
            setInfo("Swarm task concluded.");
            return;
        }

        const MAX_ITERATIONS = 25;
        if (swarmIterationCounter.current >= MAX_ITERATIONS) {
            setInfo("⚠️ Swarm reached maximum iterations. Stopping.");
            setError("Swarm stopped after reaching the maximum number of steps.");
            setIsSwarmRunning(false);
            setIsLoading(false);
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
            
            const historyString = taskHistoryRef.current.length > 0
                ? \`The swarm has already performed these actions:\n\${JSON.stringify(taskHistoryRef.current.map(r => ({ tool: r.toolCall?.name, args: r.toolCall?.arguments, result: r.executionResult, error: r.executionError })), null, 2)}\`
                : "The swarm has not performed any actions yet.";
            
            const promptForAgent = \`The swarm's overall goal is: "\${currentUserTask}".\n\n\${historyString}\n\nBased on this, what is the single next action for an agent to take? If the goal is fully complete, call the "Task Complete" tool.\`;

            const result = await processRequest(promptForAgent, true, SWARM_AGENT_SYSTEM_PROMPT);

            if (!isSwarmRunningRef.current) throw new Error("Swarm stopped by user during processing.");

            if (result) {
                taskHistoryRef.current.push(result);
                const actionSummary = result.toolCall ? \`Called '\${result.toolCall.name}'\` : 'No action taken';
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'succeeded', lastAction: actionSummary, result: result.executionResult } : a));
                
                if (result.toolCall?.name === 'Task Complete') {
                    setInfo(\`✅ Task Completed by Agent \${agent.id}: \${result.executionResult?.message || 'Finished!'}\`);
                    setIsSwarmRunning(false);
                    setIsLoading(false);
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
                const failedSwarm = prev.map(a => a.id === agent.id ? { ...a, status: terminatedStatus, error: errorMessage, lastAction: \`FAILED: \${a.lastAction}\` } : a);
                swarmAgentIdCounter.current++;
                const newAgent: AgentWorker = {
                    id: \`agent-\${swarmAgentIdCounter.current}\`,
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
    }, [agentSwarm, currentUserTask, processRequest]);


    const startSwarmTask = useCallback(async (initialTask: string) => {
        setIsLoading(true);
        setIsSwarmRunning(true);
        setCurrentUserTask(initialTask);
        taskHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
        setInfo(\`🚀 Starting swarm task: "\${initialTask}"\`);
        setError(null);
        setAutonomousLog([]);

        const initialAgents: AgentWorker[] = Array.from({ length: 3 }, (_, i) => ({
            id: \`agent-\${i + 1}\`,
            status: 'idle',
            lastAction: 'Awaiting instructions',
            error: null,
            result: null,
        }));
        setAgentSwarm(initialAgents);
        
        // Use useEffect to kick off the cycle once the initial state is set
    }, []);

    useEffect(() => {
        if (isSwarmRunning && agentSwarm.length > 0 && agentSwarm.every(a => a.status !== 'working')) {
            runSwarmCycle();
        }
    }, [isSwarmRunning, agentSwarm, runSwarmCycle]);


    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) {
            setError("Please enter a task or describe a tool to create.");
            return;
        }

        if (operatingMode === OperatingMode.Swarm) {
            await startSwarmTask(userInput);
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
                setInfo(\`⚡️ Direct Execution\`);
                setLastDebugInfo(null);
                setUserInput('');
            } catch (err) {
                setError(err instanceof Error ? \`Direct execution failed: \${err.message}\` : "An unexpected error occurred during direct execution.");
            } finally {
                setIsLoading(false);
            }
        } else {
            await processRequest(userInput, false);
        }
    }, [userInput, processRequest, executeAction, operatingMode, startSwarmTask]);

    // Create a ref to hold all dependencies for the autonomous loop.
    // This prevents the loop's useEffect from re-firing on every state change.
    const autonomousLoopDependencies = useRef({
        logToAutonomousPanel,
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
    });

    // Keep the ref updated with the latest state and functions.
    useEffect(() => {
        autonomousLoopDependencies.current = {
            logToAutonomousPanel,
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
        };
    }, [
        logToAutonomousPanel,
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
    ]);
    
    // The autonomous loop. It now ONLY depends on the on/off switch.
    useEffect(() => {
        if (!isAutonomousLoopRunning) {
            return;
        }

        const autonomousRunner = async () => {
            const { logToAutonomousPanel: initialLog } = autonomousLoopDependencies.current;
            initialLog("▶️ Starting autonomous loop...");
            
            while (isRunningRef.current) {
                // Get the latest dependencies on each iteration from the ref.
                const {
                    logToAutonomousPanel,
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
                } = autonomousLoopDependencies.current;

                logToAutonomousPanel("🌀 Starting new cycle...");
                
                let currentCountForThisCycle = autonomousActionCount;
                const today = new Date().toDateString();
                const lastDate = localStorage.getItem('lastActionDate') || '';
                
                if (lastDate !== today) {
                    logToAutonomousPanel("☀️ New day detected, resetting autonomous action counter.");
                    currentCountForThisCycle = 0;
                    setAutonomousActionCount(0);
                    setLastActionDate(today);
                    autonomousHistoryRef.current = []; // Also clear history for the new day
                }
                
                if (autonomousActionLimit !== -1 && currentCountForThisCycle >= autonomousActionLimit) {
                    logToAutonomousPanel(\`🛑 Daily limit of \${autonomousActionLimit} actions reached. Stopping loop.\`);
                    setIsAutonomousLoopRunning(false);
                    break;
                }

                try {
                    logToAutonomousPanel("🤔 Deciding next action...");
                    const goalGenTool = findToolByName('Autonomous Goal Generator');
                    if (!goalGenTool) throw new Error("Critical error: 'Autonomous Goal Generator' tool not found.");
                    
                    const actionHistoryString = autonomousHistoryRef.current.length > 0
                      ? JSON.stringify(autonomousHistoryRef.current.map(r => ({
                          tool: r.toolCall?.name,
                          args: r.toolCall?.arguments,
                          result: r.executionResult ? 'SUCCESS' : 'FAILURE',
                          error: r.executionError
                        })), null, 2)
                      : null;
                    
                    const remainingActions = autonomousActionLimit === -1 ? Infinity : autonomousActionLimit - currentCountForThisCycle;

                    const { goal } = await aiService.generateGoal(
                        goalGenTool.implementationCode, selectedModel, apiConfig, temperature, tools, remainingActions, actionHistoryString
                    );
                    
                    if (goal && goal !== "No action needed.") {
                        logToAutonomousPanel(\`🎯 New Goal: \${goal}\`);
                        const result = await processRequest(goal, true);
                        if (result) {
                          // Add to history and keep it capped at 10
                          autonomousHistoryRef.current.unshift(result);
                          if (autonomousHistoryRef.current.length > 10) {
                              autonomousHistoryRef.current.pop();
                          }
                        }
                    } else {
                        logToAutonomousPanel("🧘 No improvements found. Agent is idle.");
                    }
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred in autonomous cycle.";
                    setError(errorMessage);
                    logToAutonomousPanel(\`❌ Error in autonomous cycle: \${errorMessage}\`);
                }
                
                if (!isRunningRef.current) break;

                logToAutonomousPanel("⏸️ Cycle finished. Pausing for 15 seconds...");
                await new Promise(resolve => setTimeout(resolve, 15000));
            }

            if (!isRunningRef.current) {
                const { logToAutonomousPanel: finalLog } = autonomousLoopDependencies.current;
                finalLog("⏹️ Autonomous loop stopped.");
            }
        };

        autonomousRunner();
    // The ONLY dependency is the on/off switch, which prevents the race condition.
    }, [isAutonomousLoopRunning]);
    
    const handleToggleAutonomousLoop = () => {
        if(operatingMode !== OperatingMode.Autonomous) {
            setError("Autonomous loop can only be started in Autonomous mode.");
            return;
        }
        setIsAutonomousLoopRunning(prev => !prev);
    };

    const getUITool = (name: string) => {
        const tool = tools.find(t => t.name === name);
        if (tool && tool.category === 'UI Component') return tool;
        return {
            id: 'ui_tool_not_found', name: \`UI Tool Not Found\`, description: \`A UI tool with the name '\${name}' could not be found.\`,
            category: 'UI Component', version: 1, parameters: [],
            implementationCode: \`
              return (
                <div className="p-4 bg-red-900/50 border-2 border-dashed border-red-500 rounded-lg text-red-300">
                  <p className="font-bold">UI Tool Missing: '\${name}'</p>
                </div>
              );
            \`
        } as LLMTool;
    };

    const uiProps = {
        userInput, isLoading, error, info, showDebug, lastResponse, lastDebugInfo, tools,
        models: AVAILABLE_MODELS,
        selectedModelId,
        temperature, setTemperature,
        toolRetrievalStrategy, setToolRetrievalStrategy,
        setUserInput, handleSubmit, setShowDebug, setSelectedModelId,
        UIToolRunner,
        apiConfig, setApiConfig,
        handleResetTools,
        handleClearEmbeddingsCache,
        operatingMode, setOperatingMode,
        autonomousActionCount, autonomousActionLimit, setAutonomousActionLimit,
        proposedAction, handleApproveAction, handleRejectAction,
        isAutonomousLoopRunning, handleToggleAutonomousLoop, autonomousLog, handleClearLog,
        isTaskLoopRunning, handleStopTask,
        agentSwarm, isSwarmRunning, handleStopSwarm,
        embeddingSimilarityThreshold, setEmbeddingSimilarityThreshold,
        embeddingTopK, setEmbeddingTopK,
        robotState, environmentState,
    };

    const isHuggingFaceModel = selectedModel.provider === ModelProvider.HuggingFace;
    const showRemoteApiConfig = !isHuggingFaceModel && ['GoogleAI', 'OpenAI_API', 'Ollama'].includes(selectedModel.provider);
    const showSwarmPanel = operatingMode === OperatingMode.Swarm && agentSwarm.length > 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getUITool('Application Header')} props={uiProps} />
            
            <main className="flex-grow flex flex-col gap-8">
                <UIToolRunner tool={getUITool('Security Warning Banner')} props={uiProps} />
                <UIToolRunner tool={getUITool('System Controls')} props={uiProps} />
                <div className="w-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
                  <UIToolRunner tool={getUITool('Operating Mode Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Autonomous Resource Monitor')} props={uiProps} />
                   <UIToolRunner tool={getUITool('Autonomous Action Limiter')} props={uiProps} />
                </div>
                
                 {operatingMode === OperatingMode.Autonomous && (
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
                
                <UIToolRunner tool={getUITool('Status Messages Display')} props={uiProps} />
                <UIToolRunner tool={getUITool('Debug Panel Toggle Switch')} props={uiProps} />

                {lastResponse && <UIToolRunner tool={getUITool('Execution Result Panel')} props={{ response: lastResponse }} />}
                {showDebug && <UIToolRunner tool={getUITool('Debug Information Panel')} props={{ debugInfo: lastDebugInfo }} />}

                <UIToolRunner tool={getUITool('Tool List Display')} props={uiProps} />
            </main>

            <UIToolRunner tool={getUITool('Application Footer')} props={uiProps} />
        </div>
    );
};

export default App;