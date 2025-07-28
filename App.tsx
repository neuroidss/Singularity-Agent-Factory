import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS, DEFAULT_HUGGING_FACE_DEVICE } from './constants';
import type { LLMTool, EnrichedAIResponse, DebugInfo, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, ToolSelectionCallInfo, AgentExecutionCallInfo } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider, OperatingMode } from './types';
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
    // New state for operating mode and resource limits
    const [operatingMode, setOperatingMode] = useState<OperatingMode>(
      () => (localStorage.getItem('operatingMode') as OperatingMode) || OperatingMode.Command
    );
    const [autonomousActionLimit] = useState<number>(20); // Daily limit for autonomous actions
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
    const [autonomousStatus, setAutonomousStatus] = useState<string | null>(null);
    const autonomousIntervalRef = useRef<number | null>(null);

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
        localStorage.setItem('lastActionDate', lastActionDate);
    }, [lastActionDate]);

    const findToolByName = useCallback((toolName: string): LLMTool | undefined => {
        return tools.find(t => t.name === toolName);
    }, [tools]);

    const runtimeApi = useMemo(() => ({
        tools: {
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

                const updatedTool: LLMTool = {
                    ...toolToUpdate,
                    ...updates,
                    version: toolToUpdate.version + 1,
                    updatedAt: new Date().toISOString(),
                };

                setTools(prevTools => prevTools.map(t => t.id === updatedTool.id ? updatedTool : t));
                return updatedTool;
            }
        }
    }), [tools]);

    const runToolImplementation = (code: string, params: any, runtime: any): any => {
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
        
        const executor = new Function('args', 'runtime', codeToRun);
        return executor(params, runtime);
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

    const executeAction = useCallback(async (toolCall: AIToolCall) => {
        if (!toolCall) return;

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
                    const result = runToolImplementation(toolToExecute.implementationCode, toolCall.arguments, runtimeApi);
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

    const processRequest = useCallback(async (prompt: string, isAutonomous: boolean = false) => {
        setIsLoading(true);
        setError(null);
        setInfo(null);
        setLastResponse(null);
        if (!isAutonomous) {
            setActiveUITool(null);
            setProposedAction(null);
        }

        // AI-driven path
        let debugInfoForRun: DebugInfo = {
            userInput: prompt,
            modelId: selectedModel.id,
            temperature,
        };
        setLastDebugInfo(debugInfoForRun);
        if (!showDebug) setShowDebug(true);

        try {
            // Increment autonomous action counter if applicable
            if (isAutonomous) {
                setAutonomousActionCount(prev => prev + 1);
            }

            // --- STEP 1: Tool Retrieval ---
            setInfo("🧠 Retrieving relevant tools...");
            const retrieverLogicTool = findToolByName('Tool Retriever Logic');
            if (!retrieverLogicTool) throw new Error("Critical error: 'Tool Retriever Logic' tool not found.");
            
            const selectionSystemInstruction = retrieverLogicTool.implementationCode;
            const allToolsForPrompt = tools.map(t => ({ name: t.name, description: t.description }));
            
            const toolSelectionCall: ToolSelectionCallInfo = {
                systemInstruction: selectionSystemInstruction,
                userPrompt: prompt,
                availableTools: allToolsForPrompt,
                rawResponse: '⏳ Pending...',
            };
            debugInfoForRun = { ...debugInfoForRun, toolSelectionCall };
            setLastDebugInfo(debugInfoForRun);

            const { names: selectedToolNames, rawResponse: selectionRawResponse } = await aiService.selectTools(
                prompt, selectionSystemInstruction, selectedModel, apiConfig, temperature, tools, setInfo
            );
            
            setLastDebugInfo(prev => ({
                ...prev,
                toolSelectionCall: { ...prev!.toolSelectionCall!, rawResponse: selectionRawResponse, selectedToolNames }
            }));

            // --- STEP 2: Agent Execution ---
            setInfo("🧠 Preparing agent with selected tools...");
            const coreLogicTool = findToolByName('Core Agent Logic');
            if (!coreLogicTool) throw new Error("Critical error: 'Core Agent Logic' tool not found.");
            
            const mandatoryToolNames = ['Core Agent Logic', 'Tool Creator', 'Tool Improver'];
            const relevantToolNames = new Set([...selectedToolNames, ...mandatoryToolNames]);
            const relevantTools = Array.from(relevantToolNames).map(name => findToolByName(name)).filter((t): t is LLMTool => !!t);
            
            const agentSystemInstruction = coreLogicTool.implementationCode;
            const agentTools = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Tool Retriever Logic');

            const agentExecutionCall: AgentExecutionCallInfo = {
                systemInstruction: agentSystemInstruction,
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
            
            const aiResponse: AIResponse = await aiService.generateResponse(prompt, agentSystemInstruction, selectedModel, apiConfig, temperature, handleRawResponseChunk, setInfo, agentTools);
            
            if (!isAutonomous) {
                setUserInput(''); // Clear input only for user-submitted prompts
            }

            if(!aiResponse.toolCall) {
                const noToolMessage = "The AI did not select a tool to execute. Please try rephrasing your request.";
                setInfo(noToolMessage);
                if (isAutonomous) setAutonomousStatus(noToolMessage);
            } else if (operatingMode === OperatingMode.Assist && !isAutonomous) {
                // --- Assist Mode: Propose and wait (only for user actions) ---
                setProposedAction(aiResponse.toolCall);
                setInfo("The agent has a suggestion. Please review and approve or reject it.");
                const proposalResponse: EnrichedAIResponse = { ...aiResponse, executionResult: { status: "AWAITING_USER_APPROVAL" } };
                setLastDebugInfo(prev => {
                    if (!prev || !prev.agentExecutionCall) return prev;
                    return { ...prev, agentExecutionCall: { ...prev.agentExecutionCall, processedResponse: proposalResponse } };
                });

            } else {
                // --- Command/Autonomous Mode: Execute immediately ---
                if (isAutonomous) setAutonomousStatus(`Executing: ${aiResponse.toolCall.name}`);
                await executeAction(aiResponse.toolCall);
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(errorMessage);
            if(isAutonomous) setAutonomousStatus(`Error: ${errorMessage}`);
            const rawAIResponse = (err as any).rawAIResponse;

            setLastDebugInfo(prev => {
                const newDebug = { ...prev! };
                if (newDebug.agentExecutionCall) { // Error happened during execution
                    newDebug.agentExecutionCall.error = errorMessage;
                    newDebug.agentExecutionCall.rawResponse = rawAIResponse || newDebug.agentExecutionCall.rawResponse;
                } else if (newDebug.toolSelectionCall) { // Error happened during selection
                    newDebug.toolSelectionCall.error = errorMessage;
                    newDebug.toolSelectionCall.rawResponse = rawAIResponse || newDebug.toolSelectionCall.rawResponse;
                }
                return newDebug;
            });
        } finally {
            setIsLoading(false);
        }
    }, [tools, findToolByName, showDebug, selectedModel, apiConfig, temperature, runtimeApi, operatingMode, executeAction]);

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
    
    const runAutonomousCycle = useCallback(async () => {
        // Daily reset and limit check
        const today = new Date().toDateString();
        let currentCount = autonomousActionCount;
        if (lastActionDate !== today) {
            console.log("New day detected, resetting autonomous action counter.");
            currentCount = 0;
            setAutonomousActionCount(0);
            setLastActionDate(today);
        }

        if (currentCount >= autonomousActionLimit) {
            setAutonomousStatus(`Daily limit of ${autonomousActionLimit} reached. Stopping loop.`);
            setIsAutonomousLoopRunning(false);
            return;
        }

        try {
            setAutonomousStatus("Deciding next action...");
            const goalGenTool = findToolByName('Autonomous Goal Generator');
            if (!goalGenTool) throw new Error("Critical error: 'Autonomous Goal Generator' tool not found.");
            
            const { goal, rawResponse } = await aiService.generateGoal(
                goalGenTool.implementationCode, selectedModel, apiConfig, temperature, tools, autonomousActionLimit
            );
            
            if (goal && goal !== "No action needed.") {
                setAutonomousStatus(`New Goal: ${goal}`);
                // Give user a moment to see the goal before processing
                await new Promise(resolve => setTimeout(resolve, 2000));
                await processRequest(goal, true);
            } else {
                setAutonomousStatus("No improvements found. Will check again soon.");
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred in autonomous cycle.";
            setError(errorMessage);
            setAutonomousStatus(`Error in autonomous cycle: ${errorMessage}`);
        } finally {
            // Schedule the next run if the loop is still active
            if (autonomousIntervalRef.current !== -1) { // Check if loop hasn't been stopped
                 autonomousIntervalRef.current = window.setTimeout(runAutonomousCycle, 15000);
            }
        }
    }, [autonomousActionCount, autonomousActionLimit, lastActionDate, tools, selectedModel, apiConfig, temperature, findToolByName, processRequest]);

    useEffect(() => {
        if (isAutonomousLoopRunning && operatingMode === OperatingMode.Autonomous) {
            autonomousIntervalRef.current = 1; // Mark as running
            runAutonomousCycle();
        }

        return () => {
            if (autonomousIntervalRef.current) {
                clearTimeout(autonomousIntervalRef.current);
                autonomousIntervalRef.current = -1; // Mark as stopped
            }
        };
    }, [isAutonomousLoopRunning, operatingMode, runAutonomousCycle]);

    const handleToggleAutonomousLoop = () => {
        if(operatingMode !== OperatingMode.Autonomous) {
            setError("Autonomous loop can only be started in Autonomous mode.");
            return;
        }
        setIsAutonomousLoopRunning(prev => !prev);
        if(isAutonomousLoopRunning) {
            setAutonomousStatus("Autonomous loop stopped by user.");
        } else {
            setAutonomousStatus("Starting autonomous loop...");
        }
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
        setUserInput, handleSubmit, setShowDebug, setSelectedModelId,
        UIToolRunner,
        apiConfig, setApiConfig,
        handleResetTools,
        operatingMode, setOperatingMode,
        autonomousActionCount, autonomousActionLimit,
        proposedAction, handleApproveAction, handleRejectAction,
        isAutonomousLoopRunning, handleToggleAutonomousLoop, autonomousStatus,
    };

    const isHuggingFaceModel = selectedModel.provider === ModelProvider.HuggingFace;
    const showRemoteApiConfig = !isHuggingFaceModel && ['GoogleAI', 'OpenAI_API', 'Ollama'].includes(selectedModel.provider);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getUITool('Application Header')} props={uiProps} />
            
            <main className="flex-grow flex flex-col gap-8">
                <UIToolRunner tool={getUITool('Security Warning Banner')} props={uiProps} />
                <UIToolRunner tool={getUITool('System Controls')} props={uiProps} />
                <div className="w-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                  <UIToolRunner tool={getUITool('Operating Mode Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Autonomous Resource Monitor')} props={uiProps} />
                </div>
                
                <div className="flex flex-col gap-4">
                  <UIToolRunner tool={getUITool('AI Model Selector')} props={uiProps} />
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