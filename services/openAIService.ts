import type { APIConfig } from "../types";

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

const generate = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig
): Promise<string> => {
    const { openAIAPIKey, openAIBaseUrl } = apiConfig;

    if (!openAIAPIKey) {
        throw new Error("OpenAI API Key is missing. Please set it in the API Configuration.");
    }
    if (!openAIBaseUrl) {
        throw new Error("OpenAI Base URL is missing. Please set it in the API Configuration.");
    }
    
    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
    };
    
    try {
        const response = await fetchWithTimeout(
            `${openAIBaseUrl.replace(/\/+$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAIAPIKey}`
                },
                body: JSON.stringify(body)
            },
            OPENAI_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response, openAIBaseUrl);
            return '{}'; // Should not be reached
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '{}';

    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes('failed to fetch')) {
             throw new Error(`Network Error: Could not connect to OpenAI-compatible API at ${openAIBaseUrl}. Check the URL and your network connection.`);
        }
        throw e;
    }
};

export const generateJsonOutput = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
): Promise<string> => {
    return generate(userInput, systemInstruction, modelId, apiConfig);
};
