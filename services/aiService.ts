import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool, type EnrichedAIResponse, AIToolCall, type RobotState, type EnvironmentObject } from '../types';
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
    userInput: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    actionContext: string | null,
    robotState: RobotState,
    environmentState: EnvironmentObject[]
): Promise<{ goal: string, rawResponse: string }> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateGoal(userInput, systemInstruction, model.id, temperature, apiConfig, allTools, autonomousActionLimit, actionContext, robotState, environmentState);
        case ModelProvider.OpenAI_API:
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.generateGoal(userInput, systemInstruction, modelIdToUse, temperature, apiConfig, allTools, autonomousActionLimit, actionContext, robotState, environmentState);
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured.");
            return ollamaService.generateGoal(userInput, systemInstruction, model.id, temperature, apiConfig, allTools, autonomousActionLimit, actionContext, robotState, environmentState);
        case ModelProvider.HuggingFace:
            const onProgressStub = (msg: string) => console.log(`[HF GoalGen]: ${msg}`);
            return huggingFaceService.generateGoal(userInput, systemInstruction, model.id, temperature, apiConfig, allTools, onProgressStub, autonomousActionLimit, actionContext, robotState, environmentState);
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

export const critiqueAction = async (
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
): Promise<{ is_optimal: boolean, suggestion: string, rawResponse: string }> => {
     switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.critiqueAction(systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.OpenAI_API:
             if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.critiqueAction(systemInstruction, modelIdToUse, temperature, apiConfig);
        case ModelProvider.Ollama:
             if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured.");
            return ollamaService.critiqueAction(systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.HuggingFace:
            const onProgressStub = (msg: string) => console.log(`[HF ActionCritique]: ${msg}`);
             return huggingFaceService.critiqueAction(systemInstruction, model.id, temperature, apiConfig, onProgressStub);
        default:
            // This provides a safe default if a new provider is added without this feature.
            console.warn(`Action Critique not implemented for ${model.provider}, defaulting to optimal.`);
            return Promise.resolve({
                is_optimal: true,
                suggestion: `Action critique is not implemented for ${model.provider}, so the action was approved by default.`,
                rawResponse: "{}",
            });
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

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    temperature: number,
    onProgress: (message: string) => void,
): Promise<string> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateText(userInput, systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.OpenAI_API: {
            if (!apiConfig.openAIBaseUrl) throw new Error("OpenAI-Compatible Base URL is not configured. Please set it below the model selector.");
            const modelIdToUse = model.id === 'custom-openai' && apiConfig.openAIModelId ? apiConfig.openAIModelId : model.id;
            return openAIService.generateText(userInput, systemInstruction, modelIdToUse, temperature, apiConfig);
        }
        case ModelProvider.Ollama:
            if (!apiConfig.ollamaHost) throw new Error("Ollama Host is not configured. Please set it below the model selector.");
            return ollamaService.generateText(userInput, systemInstruction, model.id, temperature, apiConfig);
        case ModelProvider.HuggingFace:
            return huggingFaceService.generateText(userInput, systemInstruction, model.id, temperature, apiConfig, onProgress);
        default:
            throw new Error(`generateText not supported for model provider: ${model.provider}`);
    }
};