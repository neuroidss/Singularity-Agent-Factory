import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS, DEFAULT_HUGGING_FACE_DEVICE } from './constants';
import type { LLMTool, EnrichedAIResponse, DebugInfo, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, ToolSelectionCallInfo, AgentExecutionCallInfo } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider, OperatingMode, ToolRetrievalStrategy } from './types';
import { loadStateFromStorage, saveStateToStorage } from './versioning';

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
    const isRunningRef = useRef(isAutonomousLoopRunning);

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
      isRunningRef.current = isAutonomousLoopRunning;
    }, [isAutonomousLoopRunning]);

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

    const runtimeApi = useMemo(() => ({
        tools: {
            get: (name: string): LLMTool | undefined => {
                return tools.find(t => t.name === name);
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
            }
        }
    }), [tools, selectedModel, apiConfig, temperature]);

    const runToolImplementation = async (code: string, params: any, runtime: any): Promise<any> => {
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
    };
    
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

    const executeAction = useCallback(async (toolCall: AIToolCall): Promise<EnrichedAIResponse> => {
        if (!toolCall) return { toolCall: null };

        let enrichedResult: EnrichedAIResponse = { toolCall };
        let infoMessage: string | null = null;
        let executionError: string | null = null;

        const toolToExecute = findToolByName(toolCall.name);
        if (!toolToExecute) {
            throw new Error(`AI returned unknown tool name: ${toolCall.name}`);
        }

        enrichedResult.tool = toolToExecute;

        if (toolToExecute.category === 'UI Component') {
            setActiveUITool(toolToExecute);
            infoMessage = `▶️ Activating tool: "${toolToExecute.name}"`;
            enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
        } else {
            if (!toolCall.arguments) {
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
        
        if(infoMessage) setInfo(infoMessage);
        if(executionError) setError(executionError);

        setLastResponse(enrichedResult);
        setLastDebugInfo(prev => {
            if (!prev || !prev.agentExecutionCall) return prev;
            return { ...prev, agentExecutionCall: { ...prev.agentExecutionCall, processedResponse: enrichedResult } };
        });

        return enrichedResult;

    }, [findToolByName, runtimeApi]);

    const handleApproveAction = useCallback(async () => {
        if (!proposedAction) return;

        setIsLoading(true);
        setError(null);
        setLastResponse(null);
        setInfo(`⚙️ Executing approved action...`);
        
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

    const retrieveToolsByKeywordSearch = (prompt: string, allTools: LLMTool[]): LLMTool[] => {
        const keywords = prompt.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        const uniqueTools = new Set<LLMTool>();
    
        const mandatoryTools = ['Tool Creator', 'Tool Improver'];
        mandatoryTools.forEach(name => {
            const tool = findToolByName(name);
            if (tool) uniqueTools.add(tool);
        });

        if (keywords.length === 0) return Array.from(uniqueTools);

        allTools.forEach(tool => {
            const toolContent = `${tool.name.toLowerCase()} ${tool.description.toLowerCase()}`;
            if (keywords.some(keyword => toolContent.includes(keyword))) {
                uniqueTools.add(tool);
            }
        });
        
        return Array.from(uniqueTools);
    };

    const processRequest = useCallback(async (prompt: string, isAutonomous: boolean = false): Promise<EnrichedAIResponse | null> => {
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
                    setInfo("🧠 Retrieving relevant tools via keyword search...");
                    const foundTools = retrieveToolsByKeywordSearch(prompt, tools);
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

            setLastDebugInfo(prev => ({ ...prev, toolSelectionCall: toolSelectionDebug }));

            // --- STEP 2: Agent Execution ---
            setInfo("🤖 Preparing agent with selected tools...");
            const coreLogicTool = findToolByName('Core Agent Logic');
            if (!coreLogicTool) throw new Error("Critical error: 'Core Agent Logic' tool not found.");
            
            const mandatoryToolNames = ['Core Agent Logic', 'Tool Creator', 'Tool Improver', 'Tool Self-Tester', 'Tool Verifier'];
            const relevantToolNames = new Set([...selectedToolNames, ...mandatoryToolNames]);
            const relevantTools = Array.from(relevantToolNames).map(name => findToolByName(name)).filter((t): t is LLMTool => !!t);
            
            const agentSystemInstruction = coreLogicTool.implementationCode;
            const agentTools = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Tool Retriever Logic');

            // NEW: Augment the system instruction with the list of tool names
            const toolListForContext = agentTools.map(t => `- "${t.name}"`).join('\n');
            const augmentedSystemInstruction = `${agentSystemInstruction}\n\n---REFERENCE: Original Tool Names---\n${toolListForContext}`;

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
                setInfo(noToolMessage);
                if (isAutonomous) logToAutonomousPanel(`⚠️ ${noToolMessage}`);
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
                if (isAutonomous) logToAutonomousPanel(`⚙️ Executing: ${aiResponse.toolCall.name}...`);
                const executionResult = await executeAction(aiResponse.toolCall);
                 if (isAutonomous) {
                    const resultSummary = executionResult.executionError 
                        ? `❌ Execution Failed: ${executionResult.executionError}`
                        : `✅ Execution Succeeded. Result: ${JSON.stringify(executionResult.executionResult?.message || executionResult.executionResult || 'OK')}`;
                    logToAutonomousPanel(resultSummary);
                }
                return executionResult;
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(errorMessage);
            if(isAutonomous) logToAutonomousPanel(`❌ Error: ${errorMessage}`);
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
            return { toolCall: null, executionError: errorMessage };
        } finally {
            setIsLoading(false);
        }
    }, [tools, findToolByName, showDebug, selectedModel, apiConfig, temperature, runtimeApi, operatingMode, executeAction, logToAutonomousPanel, toolRetrievalStrategy]);

    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) {
            setError("Please enter a task or describe a tool to create.");
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
                setInfo(`⚡️ Direct Execution`);
                setLastDebugInfo(null);
                setUserInput('');
            } catch (err) {
                setError(err instanceof Error ? `Direct execution failed: ${err.message}` : "An unexpected error occurred during direct execution.");
            } finally {
                setIsLoading(false);
            }
        } else {
            await processRequest(userInput, false);
        }
    }, [userInput, processRequest, executeAction]);

    // New robust autonomous loop
    useEffect(() => {
        if (!isAutonomousLoopRunning) {
            return;
        }

        const autonomousRunner = async () => {
            logToAutonomousPanel("▶️ Starting autonomous loop...");
            let lastCycleResult: EnrichedAIResponse | null = lastResponse;

            while (isRunningRef.current) {
                logToAutonomousPanel("🌀 Starting new cycle...");
                
                // Check daily limit at the start of each cycle
                const today = new Date().toDateString();
                const lastDate = localStorage.getItem('lastActionDate') || '';
                let currentCount = parseInt(localStorage.getItem('autonomousActionCount') || '0', 10);
                let currentLimit = parseInt(localStorage.getItem('autonomousActionLimit') || '20', 10);
                
                if (lastDate !== today) {
                    logToAutonomousPanel("☀️ New day detected, resetting autonomous action counter.");
                    currentCount = 0;
                    setAutonomousActionCount(0);
                    setLastActionDate(today);
                }
                
                if (currentLimit !== -1 && currentCount >= currentLimit) {
                    logToAutonomousPanel(`🛑 Daily limit of ${currentLimit} actions reached. Stopping loop.`);
                    setIsAutonomousLoopRunning(false);
                    break;
                }

                try {
                    logToAutonomousPanel("🤔 Deciding next action...");
                    const goalGenTool = findToolByName('Autonomous Goal Generator');
                    if (!goalGenTool) throw new Error("Critical error: 'Autonomous Goal Generator' tool not found.");
                    
                    const lastActionResultString = lastCycleResult ? JSON.stringify({
                        toolName: lastCycleResult.toolCall?.name,
                        arguments: lastCycleResult.toolCall?.arguments,
                        result: lastCycleResult.executionResult,
                        error: lastCycleResult.executionError
                    }, null, 2) : null;
                    
                    const remainingActions = currentLimit === -1 ? Infinity : currentLimit - currentCount;

                    const { goal } = await aiService.generateGoal(
                        goalGenTool.implementationCode, selectedModel, apiConfig, temperature, tools, remainingActions, lastActionResultString
                    );
                    
                    if (goal && goal !== "No action needed.") {
                        logToAutonomousPanel(`🎯 New Goal: ${goal}`);
                        const result = await processRequest(goal, true);
                        lastCycleResult = result;
                    } else {
                        logToAutonomousPanel("🧘 No improvements found. Agent is idle.");
                    }
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred in autonomous cycle.";
                    setError(errorMessage);
                    logToAutonomousPanel(`❌ Error in autonomous cycle: ${errorMessage}`);
                }
                
                if (!isRunningRef.current) break;

                logToAutonomousPanel("⏸️ Cycle finished. Pausing for 15 seconds...");
                await new Promise(resolve => setTimeout(resolve, 15000));
            }

            if (!isRunningRef.current) {
                logToAutonomousPanel("⏹️ Autonomous loop stopped.");
            }
        };

        autonomousRunner();

    }, [isAutonomousLoopRunning, logToAutonomousPanel, lastResponse, autonomousActionLimit, findToolByName, selectedModel, apiConfig, temperature, tools, processRequest, setAutonomousActionCount, setLastActionDate, setIsAutonomousLoopRunning]);
    
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
        userInput, isLoading, error, info, showDebug, lastResponse, lastDebugInfo, tools,
        models: AVAILABLE_MODELS,
        selectedModelId,
        temperature, setTemperature,
        toolRetrievalStrategy, setToolRetrievalStrategy,
        setUserInput, handleSubmit, setShowDebug, setSelectedModelId,
        UIToolRunner,
        apiConfig, setApiConfig,
        handleResetTools,
        operatingMode, setOperatingMode,
        autonomousActionCount, autonomousActionLimit, setAutonomousActionLimit,
        proposedAction, handleApproveAction, handleRejectAction,
        isAutonomousLoopRunning, handleToggleAutonomousLoop, autonomousLog, handleClearLog,
    };

    const isHuggingFaceModel = selectedModel.provider === ModelProvider.HuggingFace;
    const showRemoteApiConfig = !isHuggingFaceModel && ['GoogleAI', 'OpenAI_API', 'Ollama'].includes(selectedModel.provider);

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

                <div className="flex flex-col gap-4 mt-8">
                  <UIToolRunner tool={getUITool('AI Model Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Tool Retrieval Strategy Selector')} props={uiProps} />
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