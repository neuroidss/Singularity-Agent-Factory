import type { AIResponse, LLMTool, APIConfig, ToolParameter } from "../types";

// --- Dynamic Tool Generation for OpenAI ---

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

const buildOpenAITools = (tools: LLMTool[]) => {
    return tools.map(tool => {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        tool.parameters.forEach(param => {
            properties[param.name] = {
                type: param.type,
                description: param.description,
            };
            if (param.required) {
                required.push(param.name);
            }
        });
        
        const functionName = sanitizeForFunctionName(tool.name);

        return {
            type: 'function',
            function: {
                name: functionName,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties,
                    required,
                },
            },
        };
    });
};


// --- API Helper Functions ---
const getAPIHeaders = (apiConfig: APIConfig) => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (apiConfig.openAIAPIKey) {
        headers['Authorization'] = `Bearer ${apiConfig.openAIAPIKey}`;
    }
    return headers;
};

const handleAPIError = async (response: Response) => {
    const errorBody = await response.text();
    console.error('Error from OpenAI-compatible API:', response.status, errorBody);
    throw new Error(`[API Error ${response.status}]: ${errorBody || response.statusText}`);
};

// --- Service Implementations ---

export const selectTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[]
): Promise<{ names: string[], rawResponse: string }> => {
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);
    const fullSystemInstruction = `${systemInstruction}\n\nAVAILABLE TOOLS:\n${toolsForPrompt}`;

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: fullSystemInstruction },
            { role: 'user', content: userInput },
        ],
        temperature,
        response_format: { type: "json_object" },
    };

    try {
        const response = await fetch(`${apiConfig.openAIBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: getAPIHeaders(apiConfig),
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        const rawResponse = jsonResponse.choices[0].message.content;
        
        if (!rawResponse) {
             return { names: [], rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        const names = parsed.tool_names || [];
        
        const allToolNames = new Set(allTools.map(t => t.name));
        const validNames = names.filter((name: string) => allToolNames.has(name));
        
        return { names: validNames, rawResponse };

    } catch (error) {
        const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during tool selection.";
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = "Failed to get raw response from OpenAI-compatible API.";
        throw processingError;
    }
};

export const generateGoal = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    lastActionResult: string | null
): Promise<{ goal: string, rawResponse: string }> => {
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description, version: t.version }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);

    const lastActionText = lastActionResult || "No action has been taken yet.";
    const instructionWithContext = systemInstruction
        .replace('{{LAST_ACTION_RESULT}}', lastActionText)
        .replace('{{ACTION_LIMIT}}', String(autonomousActionLimit));

    const fullSystemInstruction = `${instructionWithContext}\n\nHere is the current list of all available tools:\n${toolsForPrompt}`;

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: fullSystemInstruction },
            { role: 'user', content: "What should I do next?" },
        ],
        temperature,
        response_format: { type: "json_object" },
    };

    try {
        const response = await fetch(`${apiConfig.openAIBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: getAPIHeaders(apiConfig),
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);

        const jsonResponse = await response.json();
        const rawResponse = jsonResponse.choices[0].message.content;

        if (!rawResponse) {
            return { goal: "No action needed.", rawResponse: "{}" };
        }

        const parsed = JSON.parse(rawResponse);
        const goal = parsed.goal || "No action needed.";

        return { goal, rawResponse };

    } catch (error) {
        const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during goal generation.";
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = "Failed to get raw response from OpenAI-compatible API.";
        throw processingError;
    }
};


export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    relevantTools: LLMTool[],
    onProgress?: (message: string) => void,
): Promise<AIResponse> => {
    const agentTools = buildOpenAITools(relevantTools);
    const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));

    const body: any = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput },
        ],
        temperature,
        stream: true,
    };
    
    if (agentTools.length > 0) {
        body.tools = agentTools;
        body.tool_choice = "auto";
    }

    let accumulatedToolCalls: any[] = [];

    try {
        const response = await fetch(`${apiConfig.openAIBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: getAPIHeaders(apiConfig),
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        if (!response.body) throw new Error("Response body is null");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const delta = parsed.choices?.[0]?.delta;
                        
                        // We no longer accumulate text content, only tool calls.
                        // if (delta?.content) { ... }
                        
                        if (delta?.tool_calls) {
                             delta.tool_calls.forEach((toolCallDelta: any) => {
                                if (accumulatedToolCalls[toolCallDelta.index]) {
                                    // Append arguments to existing tool call
                                    accumulatedToolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
                                } else {
                                    // Start a new tool call
                                    accumulatedToolCalls[toolCallDelta.index] = {
                                        ...toolCallDelta,
                                        function: {
                                            name: toolCallDelta.function.name,
                                            arguments: toolCallDelta.function.arguments
                                        }
                                    };
                                }
                            });
                        }
                        
                        // Update raw response for debug view
                        onRawResponseChunk(JSON.stringify({ tool_calls: accumulatedToolCalls }, null, 2));

                    } catch (e) {
                        console.error("Failed to parse stream chunk:", line);
                    }
                }
            }
        }
        
        if (accumulatedToolCalls.length === 0) {
           return { toolCall: null };
        }
        
        const firstToolCall = accumulatedToolCalls[0];
        const sanitizedFunctionName = firstToolCall.function.name;
        
        const originalToolName = toolNameMap.get(sanitizedFunctionName);
        if (!originalToolName) {
            throw new Error(`AI called an unknown or disallowed tool: ${sanitizedFunctionName}`);
        }
        
        const functionArgs = JSON.parse(firstToolCall.function.arguments);
        
        return {
            toolCall: {
                name: originalToolName,
                arguments: functionArgs,
            },
        };

    } catch (error) {
        const finalMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = JSON.stringify({ tool_calls: accumulatedToolCalls }, null, 2);
        throw processingError;
    }
};