
import type { APIConfig } from "../types";

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

const createAPIBody = (model: string, system: string, user: string, temperature: number, format?: 'json') => ({
    model,
    system,
    prompt: user,
    stream: false,
    format,
    options: {
        temperature,
    },
});

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

const generate = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    format?: 'json'
): Promise<string> => {
    const { ollamaHost } = apiConfig;
    if (!ollamaHost) {
        throw new Error("Ollama Host URL is not configured. Please set it in the API Configuration.");
    }

    try {
        const body = createAPIBody(modelId, systemInstruction, userInput, temperature, format);
        const response = await fetchWithTimeout(
            `${ollamaHost}/api/generate`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
            OLLAMA_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response);
            return format === 'json' ? '{}' : ''; // Should not be reached
        }

        const data = await response.json();
        return data.response || (format === 'json' ? '{}' : '');
    } catch (e) {
        throw generateDetailedError(e, ollamaHost);
    }
};

export const generateJsonOutput = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<string> => {
    return generate(userInput, systemInstruction, modelId, temperature, apiConfig, 'json');
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig
): Promise<string> => {
    return generate(userInput, systemInstruction, modelId, temperature, apiConfig, undefined);
};