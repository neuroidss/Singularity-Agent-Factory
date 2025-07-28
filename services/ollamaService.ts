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
export const selectTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[]
): Promise<{ names: string[], rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for tool retrieval is missing or empty. The 'Tool Retriever Logic' tool may have been corrupted.");
    }
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);
    const fullSystemInstruction = `${systemInstruction}\n\nAVAILABLE TOOLS:\n${toolsForPrompt}`;

    const body = createAPIBody(modelId, fullSystemInstruction, userInput, temperature, 'json');
    let responseText = "";
    
    try {
        const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        responseText = jsonResponse.response || "{}";

        if (!responseText) {
             return { names: [], rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(responseText);
        const names = parsed.tool_names || [];
        
        const allToolNames = new Set(allTools.map(t => t.name));
        const validNames = names.filter((name: string) => allToolNames.has(name));
        
        return { names: validNames, rawResponse: responseText };

    } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during tool selection.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};

export const generateGoal = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    lastActionResult: string | null
): Promise<{ goal: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for goal generation is missing or empty. The 'Autonomous Goal Generator' tool may have been corrupted.");
    }
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description, version: t.version }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);

    const lastActionText = lastActionResult || "No action has been taken yet.";
    const instructionWithContext = systemInstruction
        .replace('{{LAST_ACTION_RESULT}}', lastActionText)
        .replace('{{ACTION_LIMIT}}', String(autonomousActionLimit));

    const fullSystemInstruction = `${instructionWithContext}\n\nHere is the current list of all available tools:\n${toolsForPrompt}`;

    const body = createAPIBody(modelId, fullSystemInstruction, "What should I do next?", temperature, 'json');
    let responseText = "";
    
    try {
        const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        responseText = jsonResponse.response || "{}";

        if (!responseText) {
            return { goal: "No action needed.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(responseText);
        const goal = parsed.goal || "No action needed.";
        
        return { goal, rawResponse: responseText };

    } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during goal generation.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};

export const verifyToolFunctionality = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<{ is_correct: boolean, reasoning: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for tool verification is missing or empty.");
    }

    const body = createAPIBody(modelId, systemInstruction, "Please verify the tool as instructed.", temperature, 'json');
    let responseText = "";
    
    try {
        const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        });

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        responseText = jsonResponse.response || "{}";

        if (!responseText) {
            return { is_correct: false, reasoning: "AI returned an empty response.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(responseText);
        return {
            is_correct: parsed.is_correct || false,
            reasoning: parsed.reasoning || "AI did not provide a reason.",
            rawResponse: responseText
        };

    } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during tool verification.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
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
    onProgress?: (message: string) => void,
): Promise<AIResponse> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The core system instruction is missing or empty. The 'Core Agent Logic' tool may have been corrupted.");
    }
    const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));
    const toolsForPrompt = relevantTools.map(t => ({
        name: sanitizeForFunctionName(t.name),
        description: t.description,
        parameters: t.parameters,
    }));
    
    if (relevantTools.length === 0) {
        // If no tools are relevant, we can't use the tool call prompt.
        // We will just send the base system instruction and see if the model can generate a text response.
        const body = createAPIBody(modelId, systemInstruction, userInput, temperature);
        const response = await fetch(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        });
         if (!response.ok) await handleAPIError(response);
         const jsonResponse = await response.json();
         const responseText = jsonResponse.response || "";
         onRawResponseChunk(JSON.stringify({ text_response: responseText }, null, 2));
         // This model can't call tools, so we return null.
         return { toolCall: null };
    }
    
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