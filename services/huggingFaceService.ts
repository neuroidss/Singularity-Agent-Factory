
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import type { AIResponse, APIConfig, LLMTool } from '../types';

// Cache for the pipeline
let generator: TextGenerationPipeline | null = null;
let currentModelId: string | null = null;
let currentDevice: string | null = null;

const JSON_FIX_PROMPT = `\n\nYou MUST respond with a single, valid JSON object and nothing else. Do not include any text, notes, or explanations outside of the JSON structure. Do not wrap the JSON in markdown backticks.`;

const getPipeline = async (modelId: string, apiConfig: APIConfig, onProgress: (message: string) => void): Promise<TextGenerationPipeline> => {
    const { huggingFaceDevice } = apiConfig;

    if (generator && currentModelId === modelId && currentDevice === huggingFaceDevice) {
        return generator;
    }

    onProgress(`🚀 Initializing model: ${modelId}. This may take a few minutes...`);
    
    if (generator) {
        await generator.dispose();
        generator = null;
    }

    // Set environment flags for Transformers.js
    (window as any).env = (window as any).env || {};
    (window as any).env.allowLocalModels = false; // Ensure models are fetched from HF hub
    (window as any).env.useFbgemm = false; // Fix for some WASM environments
    
    generator = await pipeline<'text-generation'>('text-generation', modelId, {
        device: huggingFaceDevice,
        progress_callback: (progress: any) => {
             const { status, file, progress: p, loaded, total } = progress;
             if (status === 'progress' && p > 0) {
                 const friendlyLoaded = (loaded / 1024 / 1024).toFixed(1);
                 const friendlyTotal = (total / 1024 / 1024).toFixed(1);
                 onProgress(`Downloading ${file}: ${Math.round(p)}% (${friendlyLoaded}MB / ${friendlyTotal}MB)`);
             } else if (status !== 'progress') {
                 onProgress(`Status: ${status}...`);
             }
        },
    });

    currentModelId = modelId;
    currentDevice = huggingFaceDevice;
    
    // Clear the progress message once loaded
    onProgress(`✅ Model ${modelId} loaded successfully.`);
    return generator;
};

const parseAndValidateAIResponse = (responseText: string): AIResponse => {
    try {
        let textToParse = responseText.trim();
        
        // Models sometimes wrap the JSON in markdown. Let's strip it.
        const match = textToParse.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        if (match && match[1]) {
            textToParse = match[1];
        } else {
             // Fallback for models that don't use markdown but add extra text.
            const firstBrace = textToParse.indexOf('{');
            const lastBrace = textToParse.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                textToParse = textToParse.substring(firstBrace, lastBrace + 1);
            }
        }

        let executionParams = {};
        const parsed = JSON.parse(textToParse);

        if (parsed.executionParameters && typeof parsed.executionParameters === 'string') {
             try {
                executionParams = JSON.parse(parsed.executionParameters);
            } catch (e) {
                // Ignore if parsing fails, it might not be a JSON string
                executionParams = parsed.executionParameters;
            }
             parsed.executionParameters = executionParams;
        }

        if (!parsed || !parsed.action) {
            throw new Error("AI response is missing the 'action' field.");
        }

        return parsed as AIResponse;
    } catch (error) {
         console.error("Error parsing or validating AI response:", error);
         const finalMessage = `AI response parsing failed: ${error instanceof Error ? error.message : String(error)}`;
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};

const executePipe = async (pipe: TextGenerationPipeline, system: string, user: string, temp: number): Promise<string> => {
     // Apply a chat template. This is a generic one that works for many models.
    const prompt = `<|system|>\n${system}<|end|>\n<|user|>\n${user}<|end|>\n<|assistant|>`;

    const outputs = await pipe(prompt, {
        max_new_tokens: 2048,
        temperature: temp > 0 ? temp : undefined, // temp 0 can cause issues, undefined uses default
        do_sample: temp > 0,
        top_k: temp > 0 ? 50 : undefined,
    });
    
    const rawText = (outputs[0] as any).generated_text;
    
    // Extract only the assistant's response
    const assistantResponse = rawText.split('<|assistant|>').pop()?.trim();
    if (!assistantResponse) {
        throw new Error("Failed to extract assistant response from model output.");
    }
    
    return assistantResponse;
}

export const selectRelevantTools = async (
    userInput: string,
    allTools: Pick<LLMTool, 'id' | 'name' | 'description'>[],
    retrieverSystemInstructionTemplate: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onProgress: (message: string) => void,
): Promise<any> => {
    try {
        const pipe = await getPipeline(modelId, apiConfig, onProgress);

        const systemInstruction = retrieverSystemInstructionTemplate
            .replace('{{USER_INPUT}}', userInput)
            .replace('{{TOOLS_LIST}}', JSON.stringify(allTools.map(t => ({ name: t.name, description: t.description })), null, 2))
            + JSON_FIX_PROMPT;

        const userPrompt = "Select the most relevant tools based on the user request and available tools provided in the system instruction.";
        
        const responseText = await executePipe(pipe, systemInstruction, userPrompt, temperature);

        return JSON.parse(responseText);

    } catch (error) {
        console.error("Error during tool retrieval with Hugging Face:", error);
        throw new Error(`Failed to select relevant tools: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    onProgress: (message: string) => void
): Promise<AIResponse> => {
     let responseText = "";
     try {
        const pipe = await getPipeline(modelId, apiConfig, onProgress);

        const fullSystemInstruction = systemInstruction + JSON_FIX_PROMPT;
        
        responseText = await executePipe(pipe, fullSystemInstruction, userInput, temperature);

        // This service does not stream, so we call the chunk handler once with the full response.
        onRawResponseChunk(responseText);
        
        return parseAndValidateAIResponse(responseText);

     } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during AI processing.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};