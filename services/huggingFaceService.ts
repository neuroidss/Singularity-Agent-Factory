
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import type { APIConfig } from '../types';

let generator: TextGenerationPipeline | null = null;
let currentModelId: string | null = null;
let currentDevice: string | null = null;

const handleProgress = (onProgress: (message: string) => void) => (progress: any) => {
     const { status, file, progress: p, loaded, total } = progress;
     if (status === 'progress' && p > 0) {
         const friendlyLoaded = (loaded / 1024 / 1024).toFixed(1);
         const friendlyTotal = (total / 1024 / 1024).toFixed(1);
         onProgress(`Загрузка ${file}: ${Math.round(p)}% (${friendlyLoaded}MB / ${friendlyTotal}MB)`);
     } else if (status !== 'progress') {
         onProgress(`Статус: ${status}...`);
     }
};

const getPipeline = async (modelId: string, onProgress: (message: string) => void): Promise<TextGenerationPipeline> => {
    // In this simplified version, device is hardcoded, but can be expanded via a config.
    const huggingFaceDevice = 'webgpu'; 

    if (generator && currentModelId === modelId && currentDevice === huggingFaceDevice) {
        return generator;
    }

    onProgress(`🚀 Инициализация модели: ${modelId}. Это может занять несколько минут...`);
    
    if (generator) {
        await generator.dispose();
        generator = null;
    }

    (window as any).env = (window as any).env || {};
    (window as any).env.allowLocalModels = false;
    (window as any).env.useFbgemm = false;
    
    // By typing options as 'any', we prevent TypeScript from creating a massive union type
    // from all the pipeline() overloads, which was causing a "type is too complex" error.
    const pipelineOptions = {
        device: huggingFaceDevice,
        progress_callback: handleProgress(onProgress),
        quantization: 'fp16'
    };
    
    generator = await pipeline('text-generation', modelId, pipelineOptions as any) as TextGenerationPipeline;

    currentModelId = modelId;
    currentDevice = huggingFaceDevice;
    
    onProgress(`✅ Модель ${modelId} успешно загружена.`);
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
        throw new Error("Не удалось извлечь ответ ассистента из вывода модели.");
    }
    
    return assistantResponse;
};

const generateDetailedError = (error: unknown, modelId: string, rawResponse?: string): Error => {
    let finalMessage;
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        finalMessage = `Сетевая ошибка: не удалось загрузить файлы модели для ${modelId}. Проверьте ваше интернет-соединение и блокировщики рекламы.`;
    } else {
        finalMessage = `Ошибка модели HuggingFace (${modelId}): ${error instanceof Error ? error.message : "Произошла неизвестная ошибка"}`;
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = rawResponse || "Не удалось получить сырой ответ.";
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
    const fullSystemInstruction = `${systemInstruction}\n\nВы ДОЛЖНЫ ответить одним, валидным JSON-объектом и ничем больше. Не оборачивайте JSON в тройные кавычки.`;
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