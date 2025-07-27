
import type { AIResponse, LLMTool } from "../types";

// This file contains shared logic for OpenAI-compatible and Ollama services.

const JSON_FIX_PROMPT = `\n\nYou MUST respond with a single, valid JSON object and nothing else. Do not include any text, notes, or explanations outside of the JSON structure. Do not wrap the JSON in markdown backticks.`;

const handleAPIError = async (response: Response, serviceName: string) => {
    const errorBody = await response.text();
    console.error(`Error from ${serviceName} API:`, response.status, errorBody);
    throw new Error(`[${serviceName} Error ${response.status}]: ${errorBody || response.statusText}`);
};

const validateResponse = (response: any): AIResponse => {
    if (!response || !response.action) {
         throw new Error("AI response is missing the 'action' field.");
    }
    const validatedResponse = response as AIResponse;
     switch (validatedResponse.action) {
        case 'EXECUTE_EXISTING':
            if (!validatedResponse.selectedToolName || typeof validatedResponse.executionParameters === 'undefined') throw new Error("Missing 'selectedToolName' or 'executionParameters' for EXECUTE_EXISTING.");
            break;
        case 'CREATE':
             if (!validatedResponse.newToolDefinition) throw new Error("Missing 'newToolDefinition' for CREATE.");
            break;
        case 'IMPROVE_EXISTING':
             if (!validatedResponse.toolNameToModify || !validatedResponse.newImplementationCode) throw new Error("Missing 'toolNameToModify' or 'newImplementationCode' for IMPROVE_EXISTING.");
            break;
        case 'CLARIFY':
            if (!validatedResponse.clarificationRequest) throw new Error("Missing 'clarificationRequest' for CLARIFY.");
            break;
        default:
            throw new Error(`Invalid action received from AI: ${validatedResponse.action}`);
    }
    return validatedResponse;
}

const parseAndValidateAIResponse = (responseText: string): AIResponse => {
    try {
        let executionParams = {}
        const parsed = JSON.parse(responseText);

        if (parsed.executionParameters && typeof parsed.executionParameters === 'string') {
             try {
                executionParams = JSON.parse(parsed.executionParameters);
            } catch (e) {
                throw new Error(`Failed to parse 'executionParameters' JSON string: ${parsed.executionParameters}`);
            }
             parsed.executionParameters = executionParams;
        }

        return validateResponse(parsed);
    } catch (error) {
         console.error("Error parsing or validating AI response:", error);
         const finalMessage = `AI response parsing failed: ${error instanceof Error ? error.message : String(error)}`;
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
}


export const commonSelectRelevantTools = async (
    userInput: string,
    allTools: Pick<LLMTool, 'id' | 'name' | 'description'>[],
    retrieverSystemInstructionTemplate: string,
    modelId: string,
    url: string,
    headers: Record<string, string>,
    createBody: (model: string, system: string, user: string, isJson: boolean, stream: boolean, temperature: number) => any,
    temperature: number,
): Promise<any> => {
    const systemInstruction = retrieverSystemInstructionTemplate
        .replace('{{USER_INPUT}}', userInput)
        .replace('{{TOOLS_LIST}}', JSON.stringify(allTools.map(t => ({name: t.name, description: t.description})), null, 2))
        + JSON_FIX_PROMPT;

    const userPrompt = "Select the most relevant tools based on the user request and available tools provided in the system instruction.";

    const body = createBody(modelId, systemInstruction, userPrompt, true, false, temperature);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            await handleAPIError(response, url);
        }
        
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || json.response;

        if (!content) {
             throw new Error("AI response was empty or malformed.");
        }

        return JSON.parse(content);
    } catch (error) {
        console.error("Error during tool retrieval:", error);
        throw new Error(`Failed to select relevant tools: ${error instanceof Error ? error.message : String(error)}`);
    }
};


export const commonGenerateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    url: string,
    headers: Record<string, string>,
    onRawResponseChunk: (chunk: string) => void,
    createBody: (model: string, system: string, user: string, isJson: boolean, stream: boolean, temperature: number) => any,
    streamParser: (stream: ReadableStream<Uint8Array>) => AsyncGenerator<string>,
    temperature: number,
): Promise<AIResponse> => {
    const body = createBody(modelId, systemInstruction + JSON_FIX_PROMPT, userInput, true, true, temperature);
    let responseText = "";
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            await handleAPIError(response, url);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }
        
        for await (const chunk of streamParser(response.body)) {
            responseText += chunk;
            onRawResponseChunk(responseText);
        }
        
        return parseAndValidateAIResponse(responseText);
    } catch (error) {
         const finalMessage = error instanceof Error ? error.message : "An unknown error occurred during AI processing.";
         const processingError = new Error(finalMessage) as any;
         processingError.rawAIResponse = responseText;
         throw processingError;
    }
};
