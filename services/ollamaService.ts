
import type { AIResponse, LLMTool, APIConfig } from "../types";
import { commonGenerateResponse, commonSelectRelevantTools } from "./commonAIService";

const API_HEADERS = { 'Content-Type': 'application/json' };

const createAPIBody = (
    model: string,
    system: string,
    user: string,
    isJson: boolean,
    stream: boolean,
    temperature: number
) => ({
    model,
    system,
    prompt: user,
    stream,
    ...(isJson && { format: 'json' }),
    options: {
        temperature,
    },
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
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        yield parsed.response;
                    }
                } catch (e) {
                    console.error("Failed to parse stream chunk:", line);
                }
            }
        }
    }
     if (buffer.trim()) {
        try {
            const parsed = JSON.parse(buffer);
            if (parsed.response) {
                yield parsed.response;
            }
        } catch (e) {
            console.error("Failed to parse final stream chunk:", buffer);
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
    const url = `${apiConfig.ollamaHost}/api/generate`;
    return commonSelectRelevantTools(
        userInput,
        allTools,
        retrieverSystemInstructionTemplate,
        modelId,
        url,
        API_HEADERS,
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
    const url = `${apiConfig.ollamaHost}/api/generate`;
    return commonGenerateResponse(
        userInput,
        systemInstruction,
        modelId,
        url,
        API_HEADERS,
        onRawResponseChunk,
        (model, system, user, isJson, stream, temp) => createAPIBody(model, system, user, isJson, stream, temp),
        streamTextChunks,
        temperature
    );
};