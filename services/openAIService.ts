
import type { AIResponse, LLMTool, APIConfig } from "../types";
import { commonGenerateResponse, commonSelectRelevantTools } from "./commonAIService";

const getAPIHeaders = (apiConfig: APIConfig) => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (apiConfig.openAIAPIKey) {
        headers['Authorization'] = `Bearer ${apiConfig.openAIAPIKey}`;
    }
    return headers;
};

const createAPIBody = (
    model: string,
    system: string,
    user: string,
    isJson: boolean,
    stream: boolean,
    temperature: number,
) => ({
    model,
    messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ],
    stream,
    temperature,
    ...(isJson && { response_format: { type: 'json_object' } }),
});

async function* streamTextChunks(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
    const reader = stream.getReader();
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
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        yield content;
                    }
                } catch (e) {
                    console.error("Failed to parse stream chunk:", line);
                }
            }
        }
    }
     if (buffer.startsWith('data: ')) {
        const jsonStr = buffer.substring(6);
        if (jsonStr !== '[DONE]') {
             try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            } catch (e) {
                console.error("Failed to parse final stream chunk:", buffer);
            }
        }
    }
}

export const selectRelevantTools = async (
    userInput: string,
    allTools: Pick<LLMTool, 'id' | 'name' | 'description'>[],
    retrieverSystemInstructionTemplate: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
): Promise<any> => {
    return commonSelectRelevantTools(
        userInput,
        allTools,
        retrieverSystemInstructionTemplate,
        modelId,
        apiConfig.openAIBaseUrl,
        getAPIHeaders(apiConfig),
        (model, system, user, isJson, stream, temp) => createAPIBody(model, system, user, isJson, stream, temp),
        temperature,
    );
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    onProgress?: (message: string) => void,
): Promise<AIResponse> => {
    return commonGenerateResponse(
        userInput,
        systemInstruction,
        modelId,
        apiConfig.openAIBaseUrl,
        getAPIHeaders(apiConfig),
        onRawResponseChunk,
        (model, system, user, isJson, stream, temp) => createAPIBody(model, system, user, isJson, stream, temp),
        streamTextChunks,
        temperature
    );
};