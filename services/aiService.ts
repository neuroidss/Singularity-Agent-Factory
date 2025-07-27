

import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';


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
    onProgress: (message: string) => void,
): Promise<string[]> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, temperature, apiConfig);
        case ModelProvider.OpenAI_API: {
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            const openAIResult = await openAIService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, modelIdToUse, apiConfig, temperature);
            return validateAndGetToolNames(openAIResult);
        }
        case ModelProvider.Ollama: {
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            const ollamaResult = await ollamaService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, apiConfig, temperature);
            return validateAndGetToolNames(ollamaResult);
        }
        case ModelProvider.HuggingFace: {
            const hfResult = await huggingFaceService.selectRelevantTools(userInput, allTools, retrieverSystemInstructionTemplate, model.id, apiConfig, temperature, onProgress);
            return validateAndGetToolNames(hfResult);
        }
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
    onRawResponseChunk: (chunk: string) => void,
    onProgress: (message: string) => void,
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateResponse(userInput, systemInstruction, model.id, temperature, onRawResponseChunk, apiConfig, onProgress);
        case ModelProvider.OpenAI_API: {
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.generateResponse(userInput, systemInstruction, modelIdToUse, apiConfig, temperature, onRawResponseChunk, onProgress);
        }
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            return ollamaService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk, onProgress);
        case ModelProvider.HuggingFace:
            return huggingFaceService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk, onProgress);
        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};