import type { AIResponse, LLMTool, APIConfig } from "../types";
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';

// --- Constants ---
const API_HEADERS = { 'Content-Type': 'application/json' };

// --- API Helper Functions ---
const createAPIBody = (
    model: string,
    system: string,
    user: string,
    temperature: number,
    format?: 'json'
) => ({
    model,
    system,
    prompt: user,
    stream: false, // Non-streaming for this simplified JSON approach
    format,
    options: {
        temperature,
    },
});

const handleAPIError = async (response: Response) => {
    const errorBody = await response.text();
    console.error('Error from Ollama API:', response.status, errorBody);
    throw new Error(`[Ollama Error ${response.status}]: ${errorBody || response.statusText}`);
};

const parseToolCallResponse = (responseText: string, toolNameMap: Map<string, string>): AIResponse => {
    const trimmedResponse = responseText.trim();
    if (!trimmedResponse) {
        return { toolCall: null };
    }
    
    try {
        const parsed = JSON.parse(trimmedResponse);

        // Handle the case of {} for no tool
        if (!parsed.name || typeof parsed.arguments === 'undefined') {
            return { toolCall: null };
        }
        
        const { name, arguments: args } = parsed;
        const originalToolName = toolNameMap.get(name);
        
        if (!originalToolName) {
            console.warn(`AI called an unknown tool via Ollama: ${name}`);
            return { toolCall: null };
        }
        
        return {
            toolCall: { name: originalToolName, arguments: args || {} }
        };

    } catch (error) {
        const finalMessage = `Ollama response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        console.error(finalMessage, { responseText });
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = responseText;
        throw processingError;
    }
};

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};


// --- Service Implementations ---
export const planMissionAndSelectTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
): Promise<any> => {

    const body = {
        model: modelId,
        system: systemInstruction,
        prompt: userInput,
        stream: false,
        format: 'json',
        options: { temperature }
    };

    const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(body)
    });

    if (!response.ok) await handleAPIError(response);
    
    const json = await response.json();
    if (!json.response) {
        throw new Error("AI response for mission planning was empty or malformed.");
    }
    return JSON.parse(json.response);
};

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    relevantTools: LLMTool[],
    onProgress?: (message: string) => void,
): Promise<AIResponse> => {
    const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));
    const toolsForPrompt = relevantTools.map(t => ({
        name: sanitizeForFunctionName(t.name),
        description: t.description,
        parameters: t.parameters,
    }));
    
    const toolDefinitions = JSON.stringify(toolsForPrompt, ['name', 'description', 'parameters'], 2);
    // Combine the main agent logic with the standardized tool-calling instructions.
    const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
    
    // Force JSON format for the main response.
    const body = createAPIBody(modelId, fullSystemInstruction, userInput, temperature, 'json');
    let responseText = "";

    try {
        const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        // Since stream is false, we get the full response at once.
        const jsonResponse = await response.json();
        responseText = jsonResponse.response || "{}";
        onRawResponseChunk(responseText);
        
        return parseToolCallResponse(responseText, toolNameMap);

    } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during AI processing.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};