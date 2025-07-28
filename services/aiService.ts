import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool, type EnrichedAIResponse } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';


export const selectTools = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    allTools: LLMTool[],
    onProgress: (message: string) => void,
): Promise<{ names: string[], rawResponse: string }> => {
     switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.selectTools(userInput, systemInstruction, model.id, temperature, apiConfig, allTools);
        case ModelProvider.OpenAI_API:
             if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.selectTools(userInput, systemInstruction, modelIdToUse, temperature, apiConfig, allTools);
        case ModelProvider.Ollama:
             if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            return ollamaService.selectTools(userInput, systemInstruction, model.id, temperature, apiConfig, allTools);
        case ModelProvider.HuggingFace:
             return huggingFaceService.selectTools(userInput, systemInstruction, model.id, temperature, apiConfig, allTools, onProgress);
        default:
            throw new Error(`Tool selection not supported for model provider: ${model.provider}`);
    }
}

export const generateGoal = async (
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    lastActionResult: string | null,
): Promise<{ goal: string, rawResponse: string }> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateGoal(systemInstruction, model.id, temperature, apiConfig, allTools, autonomousActionLimit, lastActionResult);
        case ModelProvider.OpenAI_API:
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.generateGoal(systemInstruction, modelIdToUse, temperature, apiConfig, allTools, autonomousActionLimit, lastActionResult);
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured.");
            return ollamaService.generateGoal(systemInstruction, model.id, temperature, apiConfig, allTools, autonomousActionLimit, lastActionResult);
        case ModelProvider.HuggingFace:
            const onProgressStub = (msg: string) => console.log(`[HF GoalGen]: ${msg}`);
            return huggingFaceService.generateGoal(systemInstruction, model.id, temperature, apiConfig, allTools, onProgressStub, autonomousActionLimit, lastActionResult);
        default:
            throw new Error(`Goal generation not supported for model provider: ${model.provider}`);
    }
};

export const verifyToolFunctionality = async (
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
): Promise<{ is_correct: boolean, reasoning: string, rawResponse: string }> => {
     switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.verifyToolFunctionality(systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.OpenAI_API:
             if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.verifyToolFunctionality(systemInstruction, modelIdToUse, temperature, apiConfig);
        case ModelProvider.Ollama:
             if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured.");
            return ollamaService.verifyToolFunctionality(systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.HuggingFace:
            const onProgressStub = (msg: string) => console.log(`[HF ToolVerify]: ${msg}`);
             return huggingFaceService.verifyToolFunctionality(systemInstruction, model.id, temperature, apiConfig, onProgressStub);
        default:
            throw new Error(`Tool verification not supported for model provider: ${model.provider}`);
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
    relevantTools: LLMTool[],
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateResponse(userInput, systemInstruction, model.id, temperature, onRawResponseChunk, apiConfig, relevantTools, onProgress);
        case ModelProvider.OpenAI_API: {
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.generateResponse(userInput, systemInstruction, modelIdToUse, apiConfig, temperature, onRawResponseChunk, relevantTools, onProgress);
        }
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            return ollamaService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk, relevantTools, onProgress);
        case ModelProvider.HuggingFace:
            return huggingFaceService.generateResponse(userInput, systemInstruction, model.id, apiConfig, temperature, onRawResponseChunk, relevantTools, onProgress);
        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};