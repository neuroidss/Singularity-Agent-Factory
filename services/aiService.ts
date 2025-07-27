
import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';


const validateAndGetToolNames = (parsed: any): string[] => {
    const toolNames = parsed.toolNames;
    if (!toolNames || !Array.isArray(toolNames) || !toolNames.every(name => typeof name === 'string')) {
        throw new Error("AI response for tool retrieval was malformed. Expected a 'toolNames' array of strings.");
    }
    return toolNames;
};

export const selectRelevantTools = async (
    userInput: string,
    allTools: Pick<LLMTool, 'id' | 'name' | 'description'>[],
    retrieverSystemInstructionTemplate: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
): Promise<string[]> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, temperature);
        case ModelProvider.OpenAI_API:
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const openAIResult = await openAIService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, apiConfig, temperature);
            return validateAndGetToolNames(openAIResult);
        case ModelProvider.Ollama:
             if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            const ollamaResult = await ollamaService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, apiConfig, temperature);
            return validateAndGetToolNames(ollamaResult);
        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateResponse(userInput, systemInstruction, model.id, temperature, onRawResponseChunk);
        case ModelProvider.OpenAI_API:
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            return openAIService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk);
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            return ollamaService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk);
        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};
