import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import type { APIConfig } from '../types';

let generator: TextGenerationPipeline | null = null;
let currentModelId: string | null = null;
let currentDevice: string | null = null;

const handleProgress = (onProgress: (message: string) => void) => {
    const reportedDownloads = new Set();
    return (progress: any) => {
        const { status, file } = progress;
        if (status === 'download' && !reportedDownloads.has(file)) {
            onProgress(`Downloading model file: ${file}...`);
            reportedDownloads.add(file);
        }
    };
};

const getPipeline = async (modelId: string, onProgress: (message: string) => void): Promise<TextGenerationPipeline> => {
    // In this simplified version, device is hardcoded, but can be expanded via a config.
    const huggingFaceDevice = 'webgpu'; 

    if (generator && currentModelId === modelId && currentDevice === huggingFaceDevice) {
        return generator;
    }

    onProgress(`🚀 Initializing model: ${modelId}. This may take a few minutes...`);
    
    if (generator) {
        await generator.dispose();
        generator = null;
    }

    (window as any).env = (window as any).env || {};
    (window as any).env.allowLocalModels = false;
    (window as any).env.useFbgemm = false;
    
    // The options for the pipeline. Using fp16 for reduced memory usage.
    const pipelineOptions = {
        device: huggingFaceDevice,
        progress_callback: handleProgress(onProgress),
        dtype: 'fp16'
    };
    
    // By casting the options argument to 'any' at the call site, we prevent TypeScript from creating
    // a massive union type from all the pipeline() overloads, which was causing a "type is too complex" error.
    // This is a necessary workaround for a known issue with the transformers.js library's complex types.
    // @ts-ignore 
    generator = await pipeline('text-generation', modelId, pipelineOptions) as TextGenerationPipeline;

    currentModelId = modelId;
    currentDevice = huggingFaceDevice;
    
    onProgress(`✅ Model ${modelId} loaded successfully.`);
    return generator;
};

const executePipe = async (pipe: TextGenerationPipeline, system: string, user:string, temp: number): Promise<string> => {
    const prompt = `<|system|>\n${system}<|end|>\n<|user|>\n${user}<|end|>\n<|assistant|>`;

    const outputs = await pipe(prompt, {
        max_new_tokens: 2048,
        temperature: temp > 0 ? temp : 0.1,
        do_sample: temp > 0,
        top_k: temp > 0 ? 50 : 1,
    });
    
    const rawText = (outputs[0] as any).generated_text;
    const assistantResponse = rawText.split('<|assistant|>').pop()?.trim();

    if (!assistantResponse) {
        throw new Error("Could not extract assistant's response from model output.");
    }
    
    return assistantResponse;
};

const generateDetailedError = (error: unknown, modelId: string, rawResponse?: string): Error => {
    let finalMessage;
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        finalMessage = `Network error: failed to download model files for ${modelId}. Check your internet connection and ad blockers.`;
    } else {
        finalMessage = `HuggingFace model error (${modelId}): ${error instanceof Error ? error.message : "An unknown error occurred"}`;
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = rawResponse || "Could not get raw response.";
    return processingError;
};

const generate = async (system: string, user: string, modelId: string, temperature: number, onProgress: (message: string) => void): Promise<string> => {
     try {
        const pipe = await getPipeline(modelId, onProgress);
        const responseText = await executePipe(pipe, system, user, temperature);
        return responseText;
    } catch (e) {
        throw generateDetailedError(e, modelId);
    }
};

export const generateJsonOutput = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    onProgress: (message: string) => void,
): Promise<string> => {
    const fullSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object and nothing else. Do not wrap the JSON in triple backticks.`;
    const responseText = await generate(fullSystemInstruction, userInput, modelId, temperature, onProgress);
    return responseText || "{}";
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    onProgress: (message: string) => void
): Promise<string> => {
    return await generate(systemInstruction, userInput, modelId, temperature, onProgress);
};