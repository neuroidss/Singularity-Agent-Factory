
import type { APIConfig, LLMTool, AIResponse, AIToolCall } from "../types";

const OLLAMA_TIMEOUT = 600000; // 10 минут

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
            throw new Error(`Запрос к Ollama превысил время ожидания ${timeout / 1000} секунд. Модель может быть слишком большой для вашей системы, или сервер Ollama не отвечает.`);
        }
        throw e;
    }
};

const handleAPIError = async (response: Response) => {
    try {
        const errorBody = await response.text();
        console.error('Ошибка от Ollama API:', response.status, errorBody);
        throw new Error(`[Ollama Error ${response.status}]: ${errorBody || response.statusText}`);
    } catch (e: any) {
         throw new Error(`[Ollama Error ${response.status}]: Не удалось разобрать ответ об ошибке.`);
    }
};

const generateDetailedError = (error: unknown, host: string): Error => {
    let finalMessage: string;
    if (error instanceof Error) {
        const lowerCaseMessage = error.message.toLowerCase();
        if (lowerCaseMessage.includes('failed to fetch') || lowerCaseMessage.includes('networkerror') || lowerCaseMessage.includes('could not connect')) {
            finalMessage = `Сетевая ошибка: не удалось подключиться к серверу Ollama по адресу ${host}. Убедитесь, что сервер запущен, URL хоста указан верно, и нет сетевых проблем (например, брандмауэров или политик CORS), блокирующих соединение.`;
        } else {
             finalMessage = `[Ollama Service Error] ${error.message}`;
        }
    } else {
        finalMessage = "Произошла неизвестная ошибка во время связи с Ollama.";
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = "Не удалось получить сырой ответ из-за ошибки.";
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
                    const typeMapping = { 'string': 'string', 'number': 'number', 'boolean': 'boolean', 'object': 'object', 'array': 'array' };
                    obj[param.name] = { type: typeMapping[param.type] || 'string', description: param.description };
                    if (param.type === 'array') {
                       obj[param.name].items = { type: 'string' };
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
                return {
                    name: originalName,
                    arguments: toolCall.arguments || {}
                };
            });
            return { toolCalls };
        }
        
        return { toolCalls: null };

    } catch (e) {
        throw generateDetailedError(e, ollamaHost);
    }
};
