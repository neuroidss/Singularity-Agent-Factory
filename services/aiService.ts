
import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';

const parseJsonOrNull = (jsonString: string): any => {
    if (!jsonString) return null;
    let jsonText = jsonString.trim();
    if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*|```\s*$/g, '');
    }
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString, e);
        return null; // Return null if parsing fails
    }
};

const parseToolCallResponse = (responseText: string): AIResponse => {
    const parsed = parseJsonOrNull(responseText);
    if (!parsed || Object.keys(parsed).length === 0 || !parsed.name) {
        return { toolCall: null };
    }
    if (typeof parsed.arguments === 'undefined') {
        parsed.arguments = {};
    }
    return { toolCall: { name: parsed.name, arguments: parsed.arguments } };
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    onProgress: (message: string) => void,
    relevantTools: LLMTool[],
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateWithNativeTools(userInput, systemInstruction, model.id, apiConfig, relevantTools);
        
        case ModelProvider.OpenAI_API: {
            const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
            const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
            const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
            const responseText = await openAIService.generateJsonOutput(userInput, fullSystemInstruction, model.id, apiConfig);
            return parseToolCallResponse(responseText);
        }

        case ModelProvider.Ollama: {
            const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
            const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
            const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
            const responseText = await ollamaService.generateJsonOutput(userInput, fullSystemInstruction, model.id, 0.1, apiConfig);
            return parseToolCallResponse(responseText);
        }
        
        case ModelProvider.HuggingFace: {
            const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
            const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
            const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
            const responseText = await huggingFaceService.generateJsonOutput(userInput, fullSystemInstruction, model.id, 0.1, apiConfig, onProgress);
            return parseToolCallResponse(responseText);
        }

        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};