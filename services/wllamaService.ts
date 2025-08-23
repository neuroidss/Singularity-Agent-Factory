import { Wllama } from '@wllama/wllama';
import type { APIConfig } from '../types';

let wllama: Wllama | null = null;
let currentModelUrl: string | null = null;

const getWllama = async (onProgress: (message: string) => void): Promise<Wllama> => {
    if (wllama) {
        return wllama;
    }
    try {
        onProgress('🚀 Initializing Wllama WebAssembly...');
        
        // Explicitly provide paths to the WASM files from a reliable CDN (jsDelivr)
        // to avoid resolution issues with esm.sh. The version is pinned for stability.
        const config = {
            wasmPaths: {
                'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.4/esm/single-thread/wllama.wasm',
                'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.4/esm/multi-thread/wllama.wasm',
            }
        };

        wllama = new Wllama(config);
        await wllama.checkCompatibility();
        onProgress('✅ Wllama initialized successfully.');
        return wllama;
    } catch (e) {
        const error = e as Error;
        onProgress(`[ERROR] ❌ Wllama compatibility check failed: ${error.message}`);
        throw new Error(`Your browser may not support WebAssembly or WebGPU, which are required for Wllama. Error: ${error.message}`);
    }
};

const loadModel = async (modelUrl: string, onProgress: (message: string) => void) => {
    const llm = await getWllama(onProgress);

    if (currentModelUrl === modelUrl && llm.isModelLoaded) {
        onProgress(`✅ Model from ${new URL(modelUrl).pathname.split('/').pop()} is already loaded.`);
        return;
    }

    if (llm.isModelLoaded) {
        onProgress('Releasing previous model...');
        await llm.unloadModel();
        currentModelUrl = null;
    }
    
    const modelName = new URL(modelUrl).pathname.split('/').pop();
    onProgress(`🚀 Loading model: ${modelName}. This may take a while...`);

    try {
        await llm.loadModelFromUrl(
            modelUrl,
            {
                progressCallback: (progress) => {
                    const percentage = (progress.loaded / progress.total * 100).toFixed(1);
                    onProgress(`Downloading ${modelName}: ${percentage}%`);
                }
            }
        );
        currentModelUrl = modelUrl;
        onProgress(`✅ Model ${modelName} loaded.`);
    } catch (e) {
         const error = e as Error;
         currentModelUrl = null; // Ensure we don't think a failed model is loaded
         throw new Error(`Failed to load model from ${modelUrl}. Error: ${error.message}`);
    }
};

const generate = async (
    userInput: string,
    systemInstruction: string,
    modelUrl: string,
    temperature: number,
    onProgress: (message: string) => void,
): Promise<string> => {
     try {
        await loadModel(modelUrl, onProgress);
        const llm = await getWllama(onProgress);

        onProgress('🤖 Generating response with Wllama...');

        const response = await llm.createChatCompletion([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInput },
        ], {
            temp: temperature > 0 ? temperature : 0.1,
            n_predict: 2048,
        });

        onProgress('✅ Response generated.');
        return response.choices[0].message.content || "";

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        onProgress(`[ERROR] ❌ Wllama generation failed: ${errorMessage}`);
        console.error("Wllama service error:", e);
        throw e;
    }
};

export const generateJsonOutput = async (
    userInput: string,
    systemInstruction: string,
    modelUrl: string,
    temperature: number,
    apiConfig: APIConfig,
    onProgress: (message: string) => void,
): Promise<string> => {
    const fullSystemInstruction = `${systemInstruction}\n\nYou MUST respond with a single, valid JSON object and nothing else. Do not wrap the JSON in triple backticks.`;
    const responseText = await generate(userInput, fullSystemInstruction, modelUrl, temperature, onProgress);
    return responseText || "{}";
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelUrl: string,
    temperature: number,
    apiConfig: APIConfig,
    onProgress: (message: string) => void
): Promise<string> => {
    return await generate(userInput, systemInstruction, modelUrl, temperature, onProgress);
};
