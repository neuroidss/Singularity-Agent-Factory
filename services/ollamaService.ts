import type { AIResponse, LLMTool, APIConfig, RobotState, EnvironmentObject } from "../types";
import { STANDARD_TOOL_CALL_SYSTEM_PROMPT } from '../constants';

// --- Constants ---
const API_HEADERS = { 'Content-Type': 'application/json' };
const OLLAMA_TIMEOUT = 600000; // 600 seconds

// --- API Helper Functions ---
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        if (e.name === 'AbortError') {
            throw new Error(`Request to Ollama timed out after ${timeout / 1000} seconds. The model may be too large for your system or the Ollama server is unresponsive.`);
        }
        throw e;
    }
};


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

const generateDetailedError = (error: unknown, host: string, rawResponse?: string): Error => {
    let finalMessage: string;
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        finalMessage = `Network Error: Could not connect to the Ollama server at ${host}. Please ensure the server is running, the host URL is correct, and there are no network issues (like firewalls or CORS policies) blocking the connection.`;
    } else {
        finalMessage = error instanceof Error ? error.message : "An unknown error occurred during Ollama communication.";
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = rawResponse || "Failed to get raw response due to a network or parsing error.";
    return processingError;
}

const parseToolCallResponse = (responseText: string, toolNameMap: Map<string, string>): AIResponse => {
    let jsonText = responseText.trim();
    if (!jsonText) {
        return { toolCall: null };
    }
    // Ollama sometimes wraps its JSON in markdown backticks
    const markdownMatch = jsonText.match(/```(?:json)?\s*({[\s\S]+?})\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        jsonText = markdownMatch[1];
    }
    
    try {
        const parsed = JSON.parse(jsonText);
        
        // Handle empty object response, which means no tool call
        if (Object.keys(parsed).length === 0) {
            return { toolCall: null };
        }

        if (!parsed.name || typeof parsed.arguments === 'undefined') {
            console.warn("Ollama response is missing 'name' or 'arguments' field.", parsed);
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


const getRobotStateString = (robotState: RobotState, environmentState: EnvironmentObject[]): string => {
    const { x, y, rotation, hasResource } = robotState;
    const resourceObj = environmentState.find(obj => obj.type === 'resource');
    const collectionPointObj = environmentState.find(obj => obj.type === 'collection_point');
    
    let direction = 'Unknown';
    if (rotation === 0) direction = 'North (Up)';
    if (rotation === 90) direction = 'East (Right)';
    if (rotation === 180) direction = 'South (Down)';
    if (rotation === 270) direction = 'West (Left)';
    
    let stateString = `Robot is at coordinates (${x}, ${y}) facing ${direction}. `;
    stateString += `Robot is ${hasResource ? 'currently carrying the resource' : 'not carrying the resource'}. `;

    if (resourceObj) {
        stateString += `The resource is at (${resourceObj.x}, ${resourceObj.y}). `;
    } else {
        if (!hasResource) {
            stateString += 'The resource has been collected or does not exist. ';
        }
    }
    
    if (collectionPointObj) {
        stateString += `The delivery collection point is at (${collectionPointObj.x}, ${collectionPointObj.y}).`;
    }

    return stateString.trim();
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
        throw new Error("The system instruction for tool retrieval is missing or empty.");
    }

    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);
    const fullSystemInstruction = `${systemInstruction}\n\nAVAILABLE TOOLS:\n${toolsForPrompt}`;
    const body = createAPIBody(modelId, fullSystemInstruction, userInput, temperature, 'json');
    let rawResponse = "";

    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;
        
        if (!rawResponse) {
             return { names: [], rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        const names = parsed.tool_names || [];
        
        const allToolNames = new Set(allTools.map(t => t.name));
        const validNames = names.filter((name: string) => allToolNames.has(name));
        
        return { names: validNames, rawResponse };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
    }
};

export const generateGoal = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
    allTools: LLMTool[],
    autonomousActionLimit: number,
    actionContext: string | null,
    robotState: RobotState,
    environmentState: EnvironmentObject[],
    agentResources: Record<string, number>
): Promise<{ goal: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for goal generation is missing or empty.");
    }
    
    const contextText = actionContext || "No action has been taken yet.";
    const robotStateString = getRobotStateString(robotState, environmentState);
    const agentResourcesString = `Agent has ${agentResources.Energy || 0} Energy.`;
    
    const instructionWithContext = systemInstruction
        .replace('{{ACTION_HISTORY}}', contextText)
        .replace('{{ACTION_LIMIT}}', String(autonomousActionLimit))
        .replace('{{ROBOT_STATE}}', robotStateString)
        .replace('{{AGENT_RESOURCES}}', agentResourcesString);

    const body = createAPIBody(modelId, instructionWithContext, userInput, temperature, 'json');
    let rawResponse = "";

    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);

        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;

        if (!rawResponse) {
            return { goal: "No action needed.", rawResponse: "{}" };
        }

        const parsed = JSON.parse(rawResponse);
        const goal = parsed.goal || "No action needed.";

        return { goal, rawResponse };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
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
    let rawResponse = "";

    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;
        
        if (!rawResponse) {
            return { is_correct: false, reasoning: "AI returned an empty response.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        return {
            is_correct: parsed.is_correct || false,
            reasoning: parsed.reasoning || "AI did not provide a reason.",
            rawResponse: rawResponse
        };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
    }
};

export const critiqueAction = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<{ is_optimal: boolean, suggestion: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for action critique is missing or empty.");
    }

    const body = createAPIBody(modelId, systemInstruction, "Please critique the proposed action as instructed.", temperature, 'json');
    let rawResponse = "";

    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;
        
        if (!rawResponse) {
            return { is_optimal: false, suggestion: "AI returned an empty response during critique.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        return {
            is_optimal: parsed.is_optimal || false,
            suggestion: parsed.suggestion || "AI did not provide a suggestion.",
            rawResponse: rawResponse
        };

    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
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
    
    const sanitizeForFunctionName = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, '_');
    const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));
    
    const toolsForPrompt = relevantTools.map(t => ({
        name: sanitizeForFunctionName(t.name),
        description: t.description,
        parameters: t.parameters,
    }));

    const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
    const fullSystemInstruction = systemInstruction + '\n\n' + STANDARD_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
    const body = createAPIBody(modelId, fullSystemInstruction, userInput, temperature, 'json');
    let rawResponse = "";
    
    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);

        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;
        onRawResponseChunk(rawResponse);

        return parseToolCallResponse(rawResponse, toolNameMap);

    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
    }
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig
): Promise<string> => {
    const body = createAPIBody(modelId, systemInstruction, userInput, temperature);
    let rawResponse = "";
    
    try {
        const response = await fetchWithTimeout(`${apiConfig.ollamaHost}/api/generate`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(body),
        }, OLLAMA_TIMEOUT);

        if (!response.ok) await handleAPIError(response);
        
        const jsonResponse = await response.json();
        rawResponse = jsonResponse.response;
        return rawResponse || "";
        
    } catch (error) {
        throw generateDetailedError(error, apiConfig.ollamaHost, rawResponse);
    }
};

export const generateHeuristic = async (
    systemInstruction: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig
): Promise<string> => {
    return generateText(
        "Based on the provided game history, generate one new strategic heuristic for the agent to follow in the future.",
        systemInstruction,
        modelId,
        temperature,
        apiConfig
    );
};
