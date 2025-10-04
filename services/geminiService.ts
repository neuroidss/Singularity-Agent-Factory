// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse, Modality } from "@google/genai";
import type { AIResponse, LLMTool, ToolParameter, AIToolCall } from "../types";

const getAIClient = (): GoogleGenAI => {
    if (typeof process === 'undefined' || !process.env || !process.env.API_KEY) {
        throw new Error("Google AI API Key not found. It must be set in the process.env.API_KEY environment variable.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

const mapTypeToGemini = (type: ToolParameter['type']): Type => {
    switch (type) {
        case 'string': return Type.STRING;
        case 'number': return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
        // Array and Object are handled separately now.
        case 'array': return Type.ARRAY;
        case 'object': return Type.OBJECT;
        default: return Type.STRING;
    }
};

const buildGeminiTools = (tools: LLMTool[]): { functionDeclarations: FunctionDeclaration[], toolNameMap: Map<string, string> } => {
    const toolNameMap = new Map<string, string>();
    const functionDeclarations = tools.map((tool): FunctionDeclaration => {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        tool.parameters.forEach(param => {
            if (param.type === 'array' || param.type === 'object') {
                // For complex types, instruct the model to provide a JSON string.
                // This avoids schema validation issues with nested, undefined structures
                // that Gemini's strict schema enforcement would reject.
                properties[param.name] = {
                    type: Type.STRING,
                    description: `${param.description} (Note: This argument must be a valid, JSON-formatted string.)`
                };
            } else {
                properties[param.name] = { type: mapTypeToGemini(param.type), description: param.description };
            }

            if (param.required) {
                required.push(param.name);
            }
        });
        
        const functionName = sanitizeForFunctionName(tool.name);
        toolNameMap.set(functionName, tool.name);

        return {
            name: functionName,
            description: tool.description,
            parameters: { type: Type.OBJECT, properties, required },
        };
    });

    return { functionDeclarations, toolNameMap };
};

const parseNativeToolCall = (response: GenerateContentResponse, toolNameMap: Map<string, string>): AIResponse => {
    const functionCallParts = response.candidates?.[0]?.content?.parts?.filter(part => 'functionCall' in part);

    if (!functionCallParts || functionCallParts.length === 0) {
        return { toolCalls: null };
    }

    const toolCalls = functionCallParts.map(part => {
        const { name, args } = part.functionCall!;
        const originalToolName = toolNameMap.get(name);
        if (!originalToolName) {
            console.warn(`AI called an unknown tool via Gemini (native): ${name}`);
            return null;
        }
        return { name: originalToolName, arguments: args || {} };
    }).filter((call): call is AIToolCall => call !== null);

    return { toolCalls: toolCalls.length > 0 ? toolCalls : null };
};

const handleAPIError = (error: unknown, requestForDebug?: any, rawResponseForDebug?: string): Error => {
    console.error("Error in Gemini Service:", error);
    if (requestForDebug) {
        try {
            // Create a debug-friendly version of the request, truncating large file data.
            const debugRequest = JSON.parse(JSON.stringify(requestForDebug)); // Deep copy
            if (debugRequest.contents && Array.isArray(debugRequest.contents)) {
                debugRequest.contents.forEach((contentItem: any) => {
                    if(contentItem.parts && Array.isArray(contentItem.parts)) {
                        contentItem.parts.forEach((part: any) => {
                            if (part.inlineData && typeof part.inlineData.data === 'string') {
                                part.inlineData.data = part.inlineData.data.substring(0, 100) + '... [TRUNCATED]';
                            }
                        });
                    }
                });
            }
            console.error("Failing Gemini Request Payload:", JSON.stringify(debugRequest, null, 2));
        } catch(e) {
            console.error("Failed to serialize the debug request payload:", e);
        }
    }

    const errorDetails = (error as any).message || (error as any).toString();
    const responseText = (error as any).response?.text;
    const finalMessage = `AI processing failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}. Check the browser console for the full request payload.`;
    
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = rawResponseForDebug || JSON.stringify(error, null, 2);
    return processingError;
};

export const generateWithNativeTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    relevantTools: LLMTool[],
    files: { name: string, type: string, data: string }[] = []
): Promise<AIResponse> => {
    const ai = getAIClient();
    const { functionDeclarations, toolNameMap } = buildGeminiTools(relevantTools);
    let rawResponseForDebug = "";

    const parts: any[] = [{ text: userInput }];
    for (const file of files) {
        parts.push({
            inlineData: {
                mimeType: file.type,
                data: file.data,
            },
        });
    }

    const requestPayload = {
        model: modelId,
        contents: { parts }, // Always use the {parts: [...]} structure
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
            tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        },
    };

    try {
        const response = await ai.models.generateContent(requestPayload);
        
        rawResponseForDebug = JSON.stringify(response, null, 2);
        return parseNativeToolCall(response, toolNameMap);
    } catch (error) {
        throw handleAPIError(error, requestPayload, rawResponseForDebug);
    }
};

export const generateText = async (
    prompt: string,
    systemInstruction: string,
    modelId: string,
    files: { name: string, type: string, data: string }[] = []
): Promise<string> => {
    const ai = getAIClient();
    
    const parts: any[] = [{ text: prompt }];
    for (const file of files) {
        parts.push({
            inlineData: {
                mimeType: file.type,
                data: file.data,
            },
        });
    }

    const requestPayload = {
        model: modelId,
        contents: { parts },
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.0,
        },
    };

    try {
        const response = await ai.models.generateContent(requestPayload);
        return response.text;
    } catch (error) {
        throw handleAPIError(error, requestPayload);
    }
};

export const generateImages = async (prompt: string, modelId: string): Promise<any> => {
    const ai = getAIClient();
    const requestPayload = {
        model: modelId,
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '16:9',
        },
    };
    try {
        const response = await ai.models.generateImages(requestPayload);
        return { generatedImages: response.generatedImages };
    } catch (error) {
        throw handleAPIError(error, requestPayload);
    }
};

export const generateImageWithFlash = async (prompt: string, modelId: string, contextImages_base64?: string[]): Promise<any> => {
    const ai = getAIClient();

    const parts: any[] = [];
    
    if (contextImages_base64 && contextImages_base64.length > 0) {
        contextImages_base64.forEach(imgBase64 => {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg', // Assuming jpeg from previous generation
                    data: imgBase64,
                },
            });
        });
    }
    
    // Always add the text prompt last
    parts.push({ text: prompt });

    const requestPayload = {
        model: modelId,
        contents: { parts },
        config: (contextImages_base64 && contextImages_base64.length > 0) ? {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        } : undefined,
    };
    try {
        const response = await ai.models.generateContent(requestPayload);
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                // Mimic the response structure of the generateImages API for compatibility
                return { generatedImages: [{ image: { imageBytes: part.inlineData.data } }] };
            }
        }
        throw new Error("Gemini Flash model did not return an image.");
    } catch (error) {
        throw handleAPIError(error, requestPayload);
    }
};

export const generateWithGoogleSearch = async (
    prompt: string,
    files: { name: string; type: string; data: string }[] = []
): Promise<{ summary: string; sources: any[] }> => {
    const ai = getAIClient();

    const parts: any[] = [{ text: prompt }];
    for (const file of files) {
        parts.push({
            inlineData: {
                mimeType: file.type,
                data: file.data,
            },
        });
    }

    const requestPayload = {
        model: "gemini-2.5-flash",
        contents: { parts }, // Always use the {parts: [...]} structure
        config: {
            tools: [{ googleSearch: {} }],
        },
    };
    
    let rawResponseForDebug = "";

    try {
        const response = await ai.models.generateContent(requestPayload);
        rawResponseForDebug = JSON.stringify(response, null, 2);

        const summary = response.text;
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web).filter(Boolean) || [];
        
        return { summary, sources };
    } catch(error) {
        throw handleAPIError(error, requestPayload, rawResponseForDebug);
    }
};

export const generateAudioStream = async (
    prompt: string,
    voice: string,
    modelId: string,
    context?: string,
    contextAudio_base64?: string,
    contextImage_base64?: string
) => {
    const ai = getAIClient();
    const config = {
        responseModalities: ['AUDIO' as const],
        speechConfig: {
           voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }
           },
        },
    };
    
    const fullPromptText = context 
        ? `Given the context "${context}", say the following line with appropriate emotion: ${prompt}`
        : prompt;
        
    const parts: any[] = [{ text: fullPromptText }];
    
    // Note: TTS models are text-in, audio-out. Multimodal context (audio/image) is not supported in the current API version.
    // The arguments are kept for future API enhancements but are not used in this request.

    const contents = [{ parts }];
    
    try {
        const response = await ai.models.generateContentStream({ model: modelId, config, contents });
        return response;
    } catch (error) {
        throw handleAPIError(error, { modelId, config, contents });
    }
};

export const connectToMusicSession = async (
    callbacks: any
) => {
    const ai = getAIClient();
    try {
        // This is a hypothetical API structure based on the user's code.
        // The user's original code had `apiVersion: "v1alpha"`, which suggests a preview API.
        // We assume `ai.live.music.connect` exists on the client object for this to work.
        const sessionPromise = await (ai.live as any).music.connect({
            model: "models/lyria-realtime-exp",
            callbacks: callbacks
        });
        return sessionPromise;
    } catch (error) {
        throw handleAPIError(error);
    }
};
