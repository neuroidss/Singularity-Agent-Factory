

import type { APIConfig, LLMTool, AIResponse, AIToolCall } from "../types";

const OLLAMA_TIMEOUT = 600000; // 10 minutes

const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e: any) {
        clearTimeout(id);
        if (e.name === 'AbortError') {
            throw new Error(`Request to Ollama timed out after ${timeout / 1000} seconds. The model might be too large for your system, or the Ollama server is not responding.`);
        }
        throw e;
    }
};

const handleAPIError = async (response: Response) => {
    try {
        const errorBody = await response.text();
        console.error('Error from Ollama API:', response.status, errorBody);
        throw new Error(`[Ollama Error ${response.status}]: ${errorBody || response.statusText}`);
    } catch (e: any) {
         throw new Error(`[Ollama Error ${response.status}]: Could not parse error response.`);
    }
};

const generateDetailedError = (error: unknown, host: string): Error => {
    let finalMessage: string;
    if (error instanceof Error) {
        const lowerCaseMessage = error.message.toLowerCase();
        if (lowerCaseMessage.includes('failed to fetch') || lowerCaseMessage.includes('networkerror') || lowerCaseMessage.includes('could not connect')) {
            finalMessage = `Network Error: Failed to connect to Ollama server at ${host}. Please ensure the server is running, the host URL is correct, and there are no network issues (e.g., firewalls or CORS policies) blocking the connection.`;
        } else {
             finalMessage = `[Ollama Service Error] ${error.message}`;
        }
    } else {
        finalMessage = "An unknown error occurred while communicating with Ollama.";
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = "Could not get raw response due to an error.";
    return processingError;
};

const buildOllamaTools = (tools: LLMTool[]) => {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name.replace(/[^a-zA-Z0-9_]/g, '_'),
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.reduce((obj, param) => {
                    if (param.type === 'array' || param.type === 'object') {
                        // For complex types, tell the model to expect a string, which we will treat as JSON.
                        obj[param.name] = { type: 'string', description: `${param.description} (This argument must be a valid, JSON-formatted string.)` };
                    } else {
                        const typeMapping = { 'string': 'string', 'number': 'number', 'boolean': 'boolean' };
                        obj[param.name] = { type: typeMapping[param.type] || 'string', description: param.description };
                    }
                    return obj;
                }, {} as Record<string, any>),
                required: tool.parameters.filter(p => p.required).map(p => p.name),
            },
        },
    }));
};


export const generateWithTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    tools: LLMTool[]
): Promise<AIResponse> => {
    const { ollamaHost } = apiConfig;
    if (!ollamaHost) {
        throw new Error("Ollama Host URL is not configured. Please set it in the API Configuration.");
    }
    
    const ollamaTools = buildOllamaTools(tools);
    const toolNameMap = new Map(tools.map(t => [t.name.replace(/[^a-zA-Z0-9_]/g, '_'), t.name]));

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput }
        ],
        stream: false,
        tools: ollamaTools.length > 0 ? ollamaTools : undefined,
        options: {
            temperature: 0.1,
        },
    };

    try {
        const response = await fetchWithTimeout(
            `${ollamaHost.replace(/\/+$/, '')}/api/chat`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
            OLLAMA_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response);
            return { toolCalls: null }; // Should not be reached
        }

        const data = await response.json();
        const toolCallsData = data.message?.tool_calls;
        
        if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            const toolCalls: AIToolCall[] = toolCallsData.map(tc => {
                const toolCall = tc.function;
                const originalName = toolNameMap.get(toolCall.name) || toolCall.name;
                
                // Robust argument parsing
                const args = toolCall.arguments;
                let parsedArgs = {};
                 if (typeof args === 'object' && args !== null) {
                    parsedArgs = args;
                } else if (typeof args === 'string') {
                    try {
                        parsedArgs = JSON.parse(args || '{}');
                    } catch (e) {
                        console.error(`[Ollama Service] Failed to parse arguments string for tool ${originalName}:`, e);
                        // Return empty args if parsing fails
                    }
                }

                return {
                    name: originalName,
                    arguments: parsedArgs
                };
            }).filter(Boolean); // Filter out any potential nulls from parsing errors
            return { toolCalls };
        }
        
        return { toolCalls: null };

    } catch (e) {
        throw generateDetailedError(e, ollamaHost);
    }
};