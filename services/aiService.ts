import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool, type MissionPlanningInfo } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';


const validateMissionPlan = (parsed: any): MissionPlanningInfo['response'] => {
    const { mission, toolNames } = parsed;
    if (typeof mission !== 'string') {
        throw new Error("AI response for mission planning was malformed. Expected a 'mission' string.");
    }
    if (!toolNames || !Array.isArray(toolNames) || !toolNames.every(name => typeof name === 'string')) {
        throw new Error("AI response for mission planning was malformed. Expected a 'toolNames' array of strings.");
    }
    return { mission, toolNames };
};

export const planMissionAndSelectTools = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    onProgress: (message: string) => void,
): Promise<MissionPlanningInfo['response']> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.planMissionAndSelectTools(userInput, systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.OpenAI_API: {
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            const openAIResult = await openAIService.planMissionAndSelectTools(userInput, systemInstruction, modelIdToUse, apiConfig, temperature);
            return validateMissionPlan(openAIResult);
        }
        case ModelProvider.Ollama: {
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            const ollamaResult = await ollamaService.planMissionAndSelectTools(userInput, systemInstruction, model.id, apiConfig, temperature);
            return validateMissionPlan(ollamaResult);
        }
        case ModelProvider.HuggingFace: {
            const hfResult = await huggingFaceService.planMissionAndSelectTools(userInput, systemInstruction, model.id, apiConfig, temperature, onProgress);
            return validateMissionPlan(hfResult);
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