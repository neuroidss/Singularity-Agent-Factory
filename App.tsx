
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as aiService from './services/aiService';
import { PREDEFINED_TOOLS, AVAILABLE_MODELS } from './constants';
import type { LLMTool, EnrichedAIResponse, DebugInfo, AIResponse, APIConfig, AIModel } from './types';
import { UIToolRunner } from './components/UIToolRunner';

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
    const [tools, setTools] = useState<LLMTool[]>(PREDEFINED_TOOLS);
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
        try {
            const stored = localStorage.getItem('apiConfig');
            return stored ? JSON.parse(stored) : { openAIBaseUrl: '', openAIAPIKey: '', ollamaHost: '' };
        } catch {
            return { openAIBaseUrl: '', openAIAPIKey: '', ollamaHost: '' };
        }
    });

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
        localStorage.setItem('tools', JSON.stringify(tools));
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

    const runToolImplementation = (code: string, params: any): any => {
        let codeToRun = code;
        // This regex handles function declarations like `function myFunc(arg1, arg2) { ... }`
        // It helps run code that the AI incorrectly wraps in a function definition
        // instead of providing just the function body as requested by the prompt.
        const functionMatch = codeToRun.trim().match(/^function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);

        if (functionMatch) {
            const functionName = functionMatch[1];
            const declaredArgs = functionMatch[2].split(',').map(s => s.trim()).filter(Boolean);
            
            let callExpression;
            // Check if the function expects the whole 'args' object as its single parameter.
            if (declaredArgs.length === 1 && declaredArgs[0] === 'args') {
                callExpression = `${functionName}(args)`;
            } else {
                // Otherwise, map properties from 'args' to the function's parameters.
                const callArgsList = declaredArgs.map(arg => `args['${arg}']`).join(', ');
                callExpression = `${functionName}(${callArgsList})`;
            }
            codeToRun += `\nreturn ${callExpression};`;
        }
        
        const executor = new Function('args', codeToRun);
        return executor(params);
    };

    const handleSubmit = useCallback(async () => {
        if (!userInput.trim()) {
            setError("Please enter a task or describe a tool to create.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setInfo(null);
        setLastResponse(null);

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
                    throw new Error("UI Component tools cannot be run directly.");
                }

                const params = JSON.parse(paramsJson);

                let enrichedResult: EnrichedAIResponse = {
                    action: 'EXECUTE_EXISTING',
                    tool: toolToExecute,
                    reason: 'Direct execution via `run` command.',
                    executionParameters: params,
                };

                try {
                    const result = runToolImplementation(toolToExecute.implementationCode, params);
                    enrichedResult.executionResult = result;
                } catch (execError) {
                    enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                }

                setInfo(`⚡️ Direct Execution`);
                setLastResponse(enrichedResult);
                setLastDebugInfo({
                    userInput,
                    selectedTools: [toolToExecute],
                    augmentedUserInput: 'N/A (Direct Execution)',
                    systemInstruction: 'N/A (Direct Execution)',
                    rawAIResponse: 'N/A (Direct Execution)',
                    processedResponse: enrichedResult,
                });
                setUserInput('');
            } catch (err) {
                setError(err instanceof Error ? `Direct execution failed: ${err.message}` : "An unexpected error occurred during direct execution.");
            } finally {
                setIsLoading(false);
            }
        } else {
            // AI-driven path
            let currentDebugInfo: DebugInfo = {
                userInput,
                selectedTools: null,
                augmentedUserInput: 'Pending...',
                systemInstruction: 'Pending...',
                rawAIResponse: 'Pending...',
                processedResponse: null,
            };
            setLastDebugInfo(currentDebugInfo);
            if (!showDebug) setShowDebug(true);

            try {
                // 1. Retrieve relevant tools (RAG step)
                setInfo("🔎 Analyzing request and retrieving relevant tools...");
                const retrieverLogicTool = findToolByName('Tool Retriever Logic');
                if (!retrieverLogicTool) throw new Error("Critical error: 'Tool Retriever Logic' tool not found.");
                
                const toolsForSelection = tools.map(t => ({id: t.id, name: t.name, description: t.description}));
                
                const relevantToolNames = await aiService.selectRelevantTools(userInput, toolsForSelection, retrieverLogicTool.implementationCode, selectedModel, apiConfig, temperature);
                const relevantTools = relevantToolNames.map(name => {
                    const found = findToolByName(name);
                    if (!found) throw new Error(`Tool retriever returned a non-existent tool name: ${name}`);
                    return found;
                });
                
                currentDebugInfo = { ...currentDebugInfo, selectedTools: relevantTools };
                setLastDebugInfo(currentDebugInfo);
                setInfo("🧠 Preparing agent with selected tools...");


                // 2. Get the static system instruction from the 'core-agent-logic' tool
                const coreLogicTool = findToolByName('Core Agent Logic');
                if (!coreLogicTool) throw new Error("Critical error: 'Core Agent Logic' tool not found.");
                const systemInstruction = coreLogicTool.implementationCode;

                // 3. Create an augmented user prompt with the user's request and the AVAILABLE (retrieved) tools context
                const toolsForPrompt = relevantTools.filter(t => t.name !== 'Core Agent Logic' && t.name !== 'Tool Retriever Logic');
                const augmentedUserInput = `The user's request is: "${userInput}"

Here is the list of available tools you can use to fulfill the request. You can use an existing tool, or create a new one if none are suitable.

Available Tools:
${JSON.stringify(toolsForPrompt, ['name', 'description', 'category', 'version', 'parameters', 'implementationCode'], 2)}
`;
                
                // Update debug info with the prompts we're about to send
                currentDebugInfo = { ...currentDebugInfo, systemInstruction, augmentedUserInput };
                setLastDebugInfo(currentDebugInfo);

                // 4. Stream and Process Response from AI
                const handleRawResponseChunk = (rawResponse: string) => {
                    setLastDebugInfo(prev => prev ? { ...prev, rawAIResponse: rawResponse } : null);
                };
                
                setLastDebugInfo(prev => prev ? { ...prev, rawAIResponse: "⏳ Waiting for stream..." } : null);

                const aiResponse: AIResponse = await aiService.generateResponse(augmentedUserInput, systemInstruction, selectedModel, apiConfig, temperature, handleRawResponseChunk);
                
                let enrichedResult: EnrichedAIResponse = { ...aiResponse };
                let toolToExecute: LLMTool | undefined;
                let infoMessage: string | null = null;
                let updatedTools = [...tools];
                let shouldClearInput = true;
                
                switch (aiResponse.action) {
                    case 'CREATE': {
                        const { newToolDefinition } = aiResponse;
                        if (!newToolDefinition) throw new Error(`Missing new tool definition for '${aiResponse.action}'.`);
                        
                        const newId = generateMachineReadableId(newToolDefinition.name, updatedTools);
                        const completeTool: LLMTool = { ...newToolDefinition, id: newId };
                        updatedTools.push(completeTool);
                        
                        enrichedResult.tool = completeTool;
                        enrichedResult.executionResult = { success: true, summary: "Tool created. It can now be used." };
                        infoMessage = `✅ New tool "${completeTool.name}" created! Please submit your request again to use it.`;
                        shouldClearInput = false; // Keep user input for resubmission
                        break;
                    }
                    case 'IMPROVE_EXISTING': {
                        if (!aiResponse.toolNameToModify || !aiResponse.newImplementationCode) {
                                throw new Error("AI response for IMPROVE_EXISTING was missing 'toolNameToModify' or 'newImplementationCode'.");
                        }
                        const { toolNameToModify, newImplementationCode } = aiResponse;
                        const toolToModify = findToolByName(toolNameToModify);
                        if (!toolToModify) throw new Error(`Tool to modify ('${toolNameToModify}') not found.`);

                        setInfo(`🤖 Agent is improving tool "${toolToModify.name}"...`);

                        const newToolDefinition: LLMTool = {
                            ...toolToModify,
                            implementationCode: newImplementationCode,
                            version: toolToModify.version + 1,
                        };
                        
                        updatedTools = updatedTools.map(t => t.name === toolNameToModify ? newToolDefinition : t);
                        
                        enrichedResult.tool = newToolDefinition;
                        enrichedResult.executionResult = { success: true, newVersion: newToolDefinition.version, summary: "Tool successfully modified." };

                        infoMessage = `🤖 Agent improved tool "${newToolDefinition.name}" to version ${newToolDefinition.version}!`;
                        break;
                    }
                    case 'EXECUTE_EXISTING': {
                        if(!aiResponse.selectedToolName) throw new Error("Missing 'selectedToolName'.");
                        
                        const foundTool = findToolByName(aiResponse.selectedToolName);
                        if (!foundTool) throw new Error(`AI returned unknown tool name: ${aiResponse.selectedToolName}`);
                        if (foundTool.category === 'UI Component') throw new Error("AI tried to execute a UI Component tool.");
                        enrichedResult.tool = foundTool;
                        toolToExecute = foundTool;
                        break;
                    }
                    case 'CLARIFY': {
                        infoMessage = aiResponse.clarificationRequest || "The AI needs clarification.";
                        break;
                    }
                }

                setTools(updatedTools);
                
                if(infoMessage) setInfo(infoMessage);

                if (toolToExecute) {
                     if (!aiResponse.executionParameters) {
                         enrichedResult.executionError = "Execution failed: AI did not provide any parameters.";
                     } else {
                        try {
                            const result = runToolImplementation(toolToExecute.implementationCode, aiResponse.executionParameters);
                            enrichedResult.executionResult = result;
                        } catch (execError) {
                            enrichedResult.executionError = execError instanceof Error ? execError.message : String(execError);
                        }
                     }
                }
                
                setLastResponse(enrichedResult);
                setLastDebugInfo(prev => prev ? { ...prev, processedResponse: enrichedResult } : null);
                if (shouldClearInput) {
                    setUserInput('');
                }

            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
                setError(errorMessage);
                
                const rawAIResponse = (err as any).rawAIResponse || `No raw response received. Error: ${errorMessage}`;
                
                setLastDebugInfo(prev => {
                    if (!prev) return null;
                     return {
                        ...prev,
                        systemInstruction: prev.systemInstruction === 'Pending...' ? 'Error before generation.' : prev.systemInstruction,
                        augmentedUserInput: prev.augmentedUserInput === 'Pending...' ? 'Error before generation.' : prev.augmentedUserInput,
                        rawAIResponse,
                        processedResponse: {
                            action: 'CLARIFY',
                            reason: `Request processing failed. Error: ${errorMessage}`,
                            executionError: errorMessage,
                        } as EnrichedAIResponse
                    };
                });


            } finally {
                setIsLoading(false);
            }
        }
    }, [userInput, tools, findToolByName, showDebug, selectedModel, apiConfig, temperature]);

    const getUITool = (name: string) => {
        const tool = tools.find(t => t.name === name);
        if (tool && tool.category === 'UI Component') return tool;
        return {
            id: 'ui_tool_not_found', name: `UI Tool Not Found`, description: `A UI tool with the name '${name}' could not be found.`,
            category: 'UI Component', version: 1, parameters: [],
            implementationCode: `
              <div className="p-4 bg-red-900/50 border-2 border-dashed border-red-500 rounded-lg text-red-300">
                <p className="font-bold">UI Tool Missing: '${name}'</p>
              </div>
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
        apiConfig, setApiConfig
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getUITool('Application Header')} props={uiProps} />
            
            <main className="flex-grow flex flex-col gap-8">
                <UIToolRunner tool={getUITool('Security Warning Banner')} props={uiProps} />
                
                <div className="flex flex-col gap-4">
                  <UIToolRunner tool={getUITool('AI Model Selector')} props={uiProps} />
                  <UIToolRunner tool={getUITool('Model Parameters Configuration')} props={uiProps} />
                  <UIToolRunner tool={getUITool('API Endpoint Configuration')} props={{ ...uiProps, selectedModelProvider: selectedModel.provider }} />
                  <UIToolRunner tool={getUITool('User Input Form')} props={uiProps} />
                </div>
                
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
