import type { AIResponse, LLMTool, APIConfig, ToolParameter, RobotState, EnvironmentObject } from "../types";

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
            if (param.type === 'array' && (param.name === 'parameters' || param.name === 'steps' || param.name === 'proposed_action')) {
                properties[param.name].items = { type: 'object' };
            }
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

const generateDetailedError = (error: unknown, url: string): Error => {
    let finalMessage: string;
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        finalMessage = `Network Error: Could not connect to the API at ${url}. Please ensure the server is running, the Base URL is correct, and there are no network issues (like firewalls or CORS policies) blocking the connection.`;
    } else {
        finalMessage = error instanceof Error ? error.message : "An unknown error occurred during API communication.";
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = "Failed to get raw response due to a network or parsing error.";
    return processingError;
}

const getRobotStateString = (robotState: RobotState, environmentState: EnvironmentObject[]): string => {
    const { x, y, rotation, hasResource } = robotState;
    const resourceObj = environmentState.find(obj => obj.type === 'resource');
    const collectionPointObj = environmentState.find(obj => obj.type === 'collection_point');
    
    let direction = 'Unknown';
    if (rotation === 0) direction = 'North (Up)';
    if (rotation === 90) direction = 'East (Right)';
    if (rotation === 180) direction = 'South (Down)';
    if (rotation === 270) direction = 'West (Left)';
    
    let stateString = `Robot is at coordinates (${x}, ${y}) facing ${direction}. `;
    stateString += `Robot is ${hasResource ? 'currently carrying the resource' : 'not carrying the resource'}. `;

    if (resourceObj) {
        stateString += `The resource is at (${resourceObj.x}, ${resourceObj.y}). `;
    } else {
        if (!hasResource) {
            stateString += 'The resource has been collected or does not exist. ';
        }
    }
    
    if (collectionPointObj) {
        stateString += `The delivery collection point is at (${collectionPointObj.x}, ${collectionPointObj.y}).`;
    }

    return stateString.trim();
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
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for tool retrieval is missing or empty. The 'Tool Retriever Logic' tool may have been corrupted.");
    }

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
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
    }
};

export const generateGoal = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    actionContext: string | null,
    robotState: RobotState,
    environmentState: EnvironmentObject[],
    agentResources: Record<string, number>
): Promise<{ goal: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for goal generation is missing or empty. The 'Autonomous Goal Generator' tool may have been corrupted.");
    }

    const contextText = actionContext || "No action has been taken yet.";
    const robotStateString = getRobotStateString(robotState, environmentState);
    const agentResourcesString = `Agent has ${agentResources.Energy || 0} Energy.`;
    
    const instructionWithContext = systemInstruction
        .replace('{{ACTION_HISTORY}}', contextText)
        .replace('{{ACTION_LIMIT}}', String(autonomousActionLimit))
        .replace('{{ROBOT_STATE}}', robotStateString)
        .replace('{{AGENT_RESOURCES}}', agentResourcesString);

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: instructionWithContext },
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
            return { goal: "No action needed.", rawResponse: "{}" };
        }

        const parsed = JSON.parse(rawResponse);
        const goal = parsed.goal || "No action needed.";

        return { goal, rawResponse };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
    }
};

export const verifyToolFunctionality = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<{ is_correct: boolean, reasoning: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for tool verification is missing or empty.");
    }

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: "Please verify the tool as instructed." },
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
            return { is_correct: false, reasoning: "AI returned an empty response.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        return {
            is_correct: parsed.is_correct || false,
            reasoning: parsed.reasoning || "AI did not provide a reason.",
            rawResponse: rawResponse
        };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
    }
};

export const critiqueAction = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<{ is_optimal: boolean, suggestion: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for action critique is missing or empty.");
    }

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: "Please critique the proposed action as instructed." },
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
            return { is_optimal: false, suggestion: "AI returned an empty response during critique.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        return {
            is_optimal: parsed.is_optimal || false,
            suggestion: parsed.suggestion || "AI did not provide a suggestion.",
            rawResponse: rawResponse
        };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
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
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The core system instruction is missing or empty. The 'Core Agent Logic' tool may have been corrupted.");
    }
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
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
    }
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig
): Promise<string> => {
    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput },
        ],
        temperature,
    };

    try {
        const response = await fetch(`${apiConfig.openAIBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: getAPIHeaders(apiConfig),
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        const textResponse = jsonResponse.choices[0].message.content;
        
        return textResponse || "";
    } catch (error) {
        throw generateDetailedError(error, apiConfig.openAIBaseUrl);
    }
};

export const generateHeuristic = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig
): Promise<string> => {
    return generateText(
        "Based on the provided game history, generate one new strategic heuristic for the agent to follow in the future.",
        systemInstruction,
        modelId,
        temperature,
        apiConfig
    );
};
