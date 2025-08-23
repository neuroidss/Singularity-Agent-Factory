

import type { APIConfig, LLMTool, AIResponse, AIToolCall } from "../types";

const OPENAI_TIMEOUT = 600000; // 10 минут

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
            throw new Error(`Request to OpenAI timed out after ${timeout / 1000}s.`);
        }
        throw e;
    }
};

const handleAPIError = async (response: Response, baseUrl: string) => {
    let errorBody;
    try {
        errorBody = await response.json();
    } catch (e) {
        errorBody = await response.text();
    }
    console.error('Error from OpenAI-compatible API:', response.status, errorBody);
    
    let message = `[OpenAI Error ${response.status}]`;
    if (response.status === 401) {
        message += ` Authentication failed. Check your API Key.`;
    } else if (response.status === 404) {
        message += ` Model not found or invalid API endpoint. Check your Base URL: ${baseUrl}`;
    } else if (typeof errorBody === 'object' && errorBody?.error?.message) {
        message += ` ${errorBody.error.message}`;
    } else if (typeof errorBody === 'string') {
        message += ` ${errorBody}`;
    } else {
        message += ` ${response.statusText}`;
    }
    throw new Error(message);
};

const buildOpenAITools = (tools: LLMTool[]) => {
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
    const { openAIAPIKey, openAIBaseUrl } = apiConfig;

    if (!openAIAPIKey) throw new Error("OpenAI API Key is missing.");
    if (!openAIBaseUrl) throw new Error("OpenAI Base URL is missing.");
    
    const openAITools = buildOpenAITools(tools);
    const toolNameMap = new Map(tools.map(t => [t.name.replace(/[^a-zA-Z0-9_]/g, '_'), t.name]));

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput }
        ],
        temperature: 0.1,
        tools: openAITools.length > 0 ? openAITools : undefined,
        tool_choice: openAITools.length > 0 ? "auto" : undefined,
    };
    
    try {
        const response = await fetchWithTimeout(
            `${openAIBaseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}` },
                body: JSON.stringify(body)
            },
            OPENAI_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response, openAIBaseUrl);
            return { toolCalls: null }; // Should not be reached
        }

        const data = await response.json();
        const toolCallsData = data.choices?.[0]?.message?.tool_calls;
        
        if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            try {
                const toolCalls: AIToolCall[] = toolCallsData.map(tc => {
                    const toolCall = tc.function;
                    const originalName = toolNameMap.get(toolCall.name) || toolCall.name;
                    
                    // Robust argument parsing: handles both stringified JSON and objects.
                    const args = toolCall.arguments;
                    let parsedArgs = {};
                    if (typeof args === 'string') {
                        try {
                            parsedArgs = JSON.parse(args || '{}');
                        } catch (e) {
                             console.error(`[OpenAI Service] Failed to parse arguments string for tool ${originalName}:`, e);
                             // Return empty args if parsing fails
                        }
                    } else if (typeof args === 'object' && args !== null) {
                        parsedArgs = args;
                    }

                    return {
                        name: originalName,
                        arguments: parsedArgs
                    };
                });
                return { toolCalls };
            } catch (e) {
                throw new Error(`Failed to process arguments from AI tool call: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        
        return { toolCalls: null };

    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes('failed to fetch')) {
             throw new Error(`Network Error: Could not connect to OpenAI-compatible API at ${openAIBaseUrl}. Check the URL and your network connection.`);
        }
        throw e;
    }
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig
): Promise<string> => {
    const { openAIAPIKey, openAIBaseUrl } = apiConfig;

    if (!openAIAPIKey) throw new Error("OpenAI API Key is missing.");
    if (!openAIBaseUrl) throw new Error("OpenAI Base URL is missing.");
    
    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput }
        ],
        temperature: 0.0,
    };
    
    try {
        const response = await fetchWithTimeout(
            `${openAIBaseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}` },
                body: JSON.stringify(body)
            },
            OPENAI_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response, openAIBaseUrl);
            return ""; // Should not be reached
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes('failed to fetch')) {
             throw new Error(`Network Error: Could not connect to OpenAI-compatible API at ${openAIBaseUrl}. Check the URL and your network connection.`);
        }
        throw e;
    }
};
