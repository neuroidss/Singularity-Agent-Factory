
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import type { AIResponse, LLMTool, APIConfig, ToolParameter } from "../types";

const getAIClient = (apiConfig: APIConfig): GoogleGenAI => {
    const { googleAIAPIKey } = apiConfig;
    if (!googleAIAPIKey) {
        try {
            if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                return new GoogleGenAI({ apiKey: process.env.API_KEY });
            }
        } catch (e) {
            console.warn("Could not access process.env to check for API_KEY.");
        }
        throw new Error("Google AI API Key not found. Please set it in the app's API Configuration.");
    }
    return new GoogleGenAI({ apiKey: googleAIAPIKey });
};

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

const mapTypeToGemini = (type: ToolParameter['type']): Type => {
    switch (type) {
        case 'string': return Type.STRING;
        case 'number': return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
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
            if (param.type === 'array') {
                properties[param.name] = { type: Type.ARRAY, description: param.description, items: { type: Type.OBJECT } };
            } else if (param.type === 'object') {
                 properties[param.name] = { type: Type.OBJECT, description: param.description };
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
    const functionCallPart = response.candidates?.[0]?.content?.parts?.find(part => 'functionCall' in part);
    if (functionCallPart && functionCallPart.functionCall) {
        const { name, args } = functionCallPart.functionCall;
        const originalToolName = toolNameMap.get(name);
        if (!originalToolName) {
            console.warn(`AI called an unknown tool via Gemini (native): ${name}`);
            return { toolCall: null };
        }
        return { toolCall: { name: originalToolName, arguments: args || {} } };
    }
    return { toolCall: null };
};

const handleAPIError = (error: unknown, rawResponseForDebug?: string): Error => {
    console.error("Error in Gemini Service:", error);
    const errorDetails = (error as any).message || (error as any).toString();
    const responseText = (error as any).response?.text;
    const finalMessage = `AI processing failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}`;
    
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = rawResponseForDebug || JSON.stringify(error, null, 2);
    return processingError;
};

export const generateWithNativeTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    relevantTools: LLMTool[],
): Promise<AIResponse> => {
    const ai = getAIClient(apiConfig);
    const { functionDeclarations, toolNameMap } = buildGeminiTools(relevantTools);
    let rawResponseForDebug = "";

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: userInput,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1,
                tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
            },
        });
        
        rawResponseForDebug = JSON.stringify(response, null, 2);
        return parseNativeToolCall(response, toolNameMap);
    } catch (error) {
        throw handleAPIError(error, rawResponseForDebug);
    }
};
