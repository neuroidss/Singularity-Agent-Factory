import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import type { AIResponse, APIConfig, LLMTool } from '../types';
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';


// --- Constants & Caching ---
let generator: TextGenerationPipeline | null = null;
let currentModelId: string | null = null;
let currentDevice: string | null = null;

const JSON_FIX_PROMPT = `\n\nYou MUST respond with a single, valid JSON object and nothing else. Do not include any text, notes, or explanations outside of the JSON structure. Do not wrap the JSON in markdown backticks.`;

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

// --- Pipeline & Execution ---
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

    (window as any).env = (window as any).env || {};
    (window as any).env.allowLocalModels = false;
    (window as any).env.useFbgemm = false;
    
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
    
    onProgress(`✅ Model ${modelId} loaded successfully.`);
    return generator;
};

const executePipe = async (pipe: TextGenerationPipeline, system: string, user: string, temp: number): Promise<string> => {
    const prompt = `<|system|>\n${system}<|end|>\n<|user|>\n${user}<|end|>\n<|assistant|>`;

    const outputs = await pipe(prompt, {
        max_new_tokens: 2048,
        temperature: temp > 0 ? temp : 0.1, // Ensure some variance if temp is 0
        do_sample: temp > 0, // only sample if temperature is gt 0
        top_k: temp > 0 ? 50 : 1,
    });
    
    const rawText = (outputs[0] as any).generated_text;
    const assistantResponse = rawText.split('<|assistant|>').pop()?.trim();

    if (!assistantResponse) {
        throw new Error("Failed to extract assistant response from model output.");
    }
    
    return assistantResponse;
}


// --- Response Parsing ---
const parseToolCallResponse = (responseText: string, toolNameMap: Map<string, string>): AIResponse => {
    let jsonText = responseText.trim();

    // Models can sometimes wrap their JSON in markdown, so we extract it.
    const markdownMatch = jsonText.match(/```(?:json)?\s*({[\s\S]+?})\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        jsonText = markdownMatch[1];
    }

    if (!jsonText) {
        return { toolCall: null };
    }
    
    try {
        const parsed = JSON.parse(jsonText);

        // Handle the case of {} for no tool
        if (!parsed.name || typeof parsed.arguments === 'undefined') {
            return { toolCall: null };
        }
        
        const { name, arguments: args } = parsed;
        const originalToolName = toolNameMap.get(name);
        
        if (!originalToolName) {
            console.warn(`AI called an unknown tool via HuggingFace: ${name}`);
            return { toolCall: null };
        }
        
        return {
            toolCall: { name: originalToolName, arguments: args || {} }
        };

    } catch (error) {
        const finalMessage = `HuggingFace response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        console.error(finalMessage, { responseText });
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = responseText;
        throw processingError;
    }
};

// --- Service Implementations ---
export const planMissionAndSelectTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onProgress: (message: string) => void,
): Promise<any> => {
    try {
        const pipe = await getPipeline(modelId, apiConfig, onProgress);
        
        // This system prompt already asks for JSON, so we just pass it through.
        const responseText = await executePipe(pipe, systemInstruction, userInput, temperature);
        
        let textToParse = responseText.trim();
        const jsonMatch = textToParse.match(/```(?:json)?\s*({[\s\S]+?})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            textToParse = jsonMatch[1];
        }

        return JSON.parse(textToParse);

    } catch (error) {
        console.error("Error during mission planning with Hugging Face:", error);
        throw new Error(`Failed to plan mission: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    relevantTools: LLMTool[],
    onProgress: (message: string) => void
): Promise<AIResponse> => {
     let responseText = "";
     try {
        const pipe = await getPipeline(modelId, apiConfig, onProgress);
        
        const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));
        const toolsForPrompt = relevantTools.map(t => ({
            name: sanitizeForFunctionName(t.name),
            description: t.description,
            parameters: t.parameters,
        }));
    
        const toolDefinitions = JSON.stringify(toolsForPrompt, ['name', 'description', 'parameters'], 2);
        const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
        
        responseText = await executePipe(pipe, fullSystemInstruction, userInput, temperature);

        onRawResponseChunk(responseText);
        
        return parseToolCallResponse(responseText, toolNameMap);

     } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during AI processing.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};