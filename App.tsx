import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS, DEFAULT_HUGGING_FACE_DEVICE } from './constants';
import type { LLMTool, EnrichedAIResponse, DebugInfo, AIResponse, APIConfig, AIModel, NewToolPayload, AIToolCall, FinalAgentCallInfo, MissionPlanningInfo } from './types';
import { UIToolRunner } from './components/UIToolRunner';
import { ModelProvider } from './types';

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


const App: React.FC = () => {
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [tools, setTools] = useState<LLMTool[]>([]);
    const [lastResponse, setLastResponse] = useState<EnrichedAIResponse | null>(null);
    const [showDebug, setShowDebug] = useState<boolean>(false);
    const [lastDebugInfo, setLastDebugInfo] = useState<DebugInfo | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>(
        () => localStorage.getItem('selectedModelId') || AVAILABLE_MODELS[0].id
    );
    const [temperature, setTemperature] = useState<number>(
      () => parseFloat(localStorage.getItem('modelTemperature') || '0.0')
    );
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
        try {
            const storedToolsJson = localStorage.getItem('tools');
            if (storedToolsJson) {
                const storedTools = JSON.parse(storedToolsJson) as LLMTool[];
                setTools(storedTools);
            } else {
                setTools(PREDEFINED_TOOLS);
            }
        } catch (e) {
            console.error("Failed to load tools from localStorage", e);
            setTools(PREDEFINED_TOOLS);
        }
    }, []);

    useEffect(() => {
        if (tools.length > 0) {
            localStorage.setItem('tools', JSON.stringify(tools));
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
                const completeTool: LLMTool = { 
                    ...newToolPayload, 
                    id: newId, 
                    version: 1 
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
            // First, clear the item from storage to prevent race conditions on reload
            localStorage.removeItem('tools');
            // Then, update the state to immediately reflect the change in the UI
            setTools(PREDEFINED_TOOLS);
            // Finally, provide clear feedback to the user
            setInfo("System reset complete. All custom tools have been deleted and original tools have been restored.");
            setError(null);
            setLastResponse(null);
            setActiveUITool(null);
        }
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) {
            setError("Please enter a task or describe a tool to create.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setInfo(null);
        setLastResponse(null);
        setActiveUITool(null); 

        const directExecutionRegex = /^run\s+"([^"]+)"\s+with\s+(.*)$/s;
        const match = userInput.trim().match(directExecutionRegex);

        if (match) {
            // Direct execution path (bypassing AI)
            try {
                const [, toolName, paramsJson] = match;
                const toolToExecute = findToolByName(toolName);

                if (!toolToExecute) {
                    throw new Error(`Tool with name "${toolName}" not found.`);
                }
                if (toolToExecute.category === 'UI Component') {
                    setActiveUITool(toolToExecute);
                    setInfo(`▶️ Activating tool: "${toolToExecute.name}"`);
                    setUserInput('');
                    setIsLoading(false);
                    return;
                }

                const params = JSON.parse(paramsJson);
                const toolCall: AIToolCall = { name: toolToExecute.name, arguments: params };

                let enrichedResult: EnrichedAIResponse = {
                    toolCall: toolCall,
                    tool: toolToExecute,
                };

                try {
                    const result = runToolImplementation(toolToExecute.implementationCode, params, runtimeApi);
                    enrichedResult.executionResult = result;
                } catch (execError) {
                    enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                }

                setInfo(`⚡️ Direct Execution`);
                setLastResponse(enrichedResult);
                // No debug info for direct execution
                setLastDebugInfo(null);
                setUserInput('');
            } catch (err) {
                setError(err instanceof Error ? `Direct execution failed: ${err.message}` : "An unexpected error occurred during direct execution.");
            } finally {
                setIsLoading(false);
            }
        } else {
            // AI-driven path
            let debugInfoForRun: DebugInfo = {
                userInput,
                modelId: selectedModel.id,
                temperature,
            };
            setLastDebugInfo(debugInfoForRun);
            if (!showDebug) setShowDebug(true);

            try {
                // Step 1: Plan Mission & Select Tools in a single call
                setInfo("🎯 Planning mission and selecting tools...");
                const plannerLogicTool = findToolByName('Mission & Tool Selection Logic');
                if (!plannerLogicTool) throw new Error("Critical error: 'Mission & Tool Selection Logic' tool not found.");
                
                const toolsForSelection = tools.map(t => ({id: t.id, name: t.name, description: t.description}));
                const plannerSystemInstruction = plannerLogicTool.implementationCode
                    .replace('{{USER_INPUT}}', userInput)
                    .replace('{{TOOLS_LIST}}', JSON.stringify(toolsForSelection.map(t => ({name: t.name, description: t.description})), null, 2));

                const missionPlan = await aiService.planMissionAndSelectTools(
                    userInput,
                    plannerSystemInstruction,
                    selectedModel,
                    apiConfig,
                    temperature,
                    setInfo
                );
                const { mission: reframedPrompt, toolNames } = missionPlan;

                const missionPlanningInfo: MissionPlanningInfo = {
                    systemInstruction: plannerSystemInstruction,
                    response: missionPlan,
                };
                debugInfoForRun = { ...debugInfoForRun, missionPlanning: missionPlanningInfo };
                setLastDebugInfo(debugInfoForRun);

                
                // Step 2: Prepare and execute the main agent call with the *reframed mission*.
                setInfo("🧠 Preparing agent with selected tools...");
                
                const uniqueToolNames = [...new Set(toolNames)];
                const existingToolsMap = new Map(tools.map(t => [t.name, t]));
                const relevantTools = uniqueToolNames
                    .map(name => existingToolsMap.get(name))
                    .filter((tool): tool is LLMTool => tool !== undefined);
                
                const coreLogicTool = findToolByName('Core Agent Logic');
                if (!coreLogicTool) throw new Error("Critical error: 'Core Agent Logic' tool not found.");
                const systemInstruction = coreLogicTool.implementationCode;

                const toolsForPrompt = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Mission & Tool Selection Logic');
                
                const finalAgentCallInfo: FinalAgentCallInfo = {
                    systemInstruction,
                    userPrompt: reframedPrompt,
                    toolsProvided: toolsForPrompt,
                    rawResponse: '⏳ Waiting for stream...',
                    processedResponse: null,
                };
                debugInfoForRun = { ...debugInfoForRun, finalAgentCall: finalAgentCallInfo };
                setLastDebugInfo(debugInfoForRun);

                const handleRawResponseChunk = (rawResponse: string) => {
                    setLastDebugInfo(prev => {
                        if (!prev || !prev.finalAgentCall || 'error' in prev.finalAgentCall) return prev;
                        return { ...prev, finalAgentCall: { ...prev.finalAgentCall, rawResponse } };
                    });
                };

                const aiResponse: AIResponse = await aiService.generateResponse(reframedPrompt, systemInstruction, selectedModel, apiConfig, temperature, handleRawResponseChunk, setInfo, toolsForPrompt);
                
                let enrichedResult: EnrichedAIResponse = { ...aiResponse };
                let infoMessage: string | null = null;
                
                if(!aiResponse.toolCall) {
                    infoMessage = `The AI did not select a tool to execute. Please try rephrasing your request.`;
                    setInfo(infoMessage);
                    setUserInput('');
                    setIsLoading(false);
                    setLastResponse(enrichedResult);
                    setLastDebugInfo(prev => {
                        if (!prev || !prev.finalAgentCall || 'error' in prev.finalAgentCall) return prev;
                        return { ...prev, finalAgentCall: { ...prev.finalAgentCall, processedResponse: enrichedResult } };
                    });
                    return;
                }
                
                const toolToExecute = findToolByName(aiResponse.toolCall.name);
                if (!toolToExecute) throw new Error(`AI returned unknown tool name: ${aiResponse.toolCall.name}`);
                
                enrichedResult.tool = toolToExecute;
                
                if (toolToExecute.category === 'UI Component') {
                    setActiveUITool(toolToExecute);
                    infoMessage = `▶️ Activating tool: "${toolToExecute.name}"`;
                    enrichedResult.executionResult = { success: true, summary: `Displayed UI tool '${toolToExecute.name}'.` };
                } else {
                     if (!aiResponse.toolCall.arguments) {
                         enrichedResult.executionError = "Execution failed: AI did not provide any arguments for the tool call.";
                     } else {
                        try {
                            const result = runToolImplementation(toolToExecute.implementationCode, aiResponse.toolCall.arguments, runtimeApi);
                            enrichedResult.executionResult = result;
                            if (result?.message) {
                                infoMessage = `✅ ${result.message}`;
                            } else {
                                infoMessage = `✅ Tool "${toolToExecute.name}" executed.`;
                            }
                        } catch (execError) {
                            enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                        }
                     }
                }
                
                if(infoMessage) setInfo(infoMessage);
                setLastResponse(enrichedResult);
                setLastDebugInfo(prev => {
                    if (!prev || !prev.finalAgentCall || 'error' in prev.finalAgentCall) return prev;
                    return { ...prev, finalAgentCall: { ...prev.finalAgentCall, processedResponse: enrichedResult } };
                });
                setUserInput('');

            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
                setError(errorMessage);
                
                const rawAIResponse = (err as any).rawAIResponse;
                
                setLastDebugInfo(prev => {
                    const newDebug = { ...prev, processError: errorMessage };
                    if (prev?.finalAgentCall && !('error' in prev.finalAgentCall)) {
                        newDebug.finalAgentCall = {
                            ...prev.finalAgentCall,
                            rawResponse: rawAIResponse || prev.finalAgentCall.rawResponse,
                            processedResponse: { toolCall: null, executionError: errorMessage }
                        };
                    }
                    return newDebug;
                });

            } finally {
                setIsLoading(false);
            }
        }
    }, [userInput, tools, findToolByName, showDebug, selectedModel, apiConfig, temperature, runtimeApi]);

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
    };

    const isHuggingFaceModel = selectedModel.provider === ModelProvider.HuggingFace;
    const showRemoteApiConfig = !isHuggingFaceModel && ['GoogleAI', 'OpenAI_API', 'Ollama'].includes(selectedModel.provider);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getUITool('Application Header')} props={uiProps} />
            
            <main className="flex-grow flex flex-col gap-8">
                <UIToolRunner tool={getUITool('Security Warning Banner')} props={uiProps} />
                <UIToolRunner tool={getUITool('System Controls')} props={uiProps} />
                
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