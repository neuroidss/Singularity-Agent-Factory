
import { GoogleGenAI, Type } from "@google/genai";
import type { AIResponse, LLMTool, APIConfig } from "../types";

const getAIClient = (apiConfig: APIConfig): GoogleGenAI => {
    const apiKey = apiConfig.googleAIAPIKey;
    if (!apiKey) {
        throw new Error("Google AI API Key not provided. Please configure it in the application settings.");
    }
    return new GoogleGenAI({ apiKey });
};

export const selectRelevantTools = async (
    userInput: string,
    allTools: Pick<LLMTool, 'id' | 'name' | 'description'>[],
    retrieverSystemInstructionTemplate: string,
    modelId: string,
    temperature: number,
    apiConfig: APIConfig,
): Promise<string[]> => {
    const ai = getAIClient(apiConfig);
     const retrieverSchema = {
        type: Type.OBJECT,
        properties: {
            toolNames: {
                type: Type.ARRAY,
                description: "An array of tool name strings that are most relevant to the user's request.",
                items: {
                    type: Type.STRING
                }
            }
        },
        required: ["toolNames"],
    };
    
    const retrieverSystemInstruction = retrieverSystemInstructionTemplate
        .replace('{{USER_INPUT}}', userInput)
        .replace('{{TOOLS_LIST}}', JSON.stringify(allTools.map(t => ({name: t.name, description: t.description})), null, 2));

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: "Select the most relevant tools based on the user request and available tools provided in the system instruction.",
            config: {
                systemInstruction: retrieverSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: retrieverSchema,
                temperature: temperature,
            },
        });

        const jsonText = response.text.trim();
        if (!jsonText) {
            throw new Error("Tool retriever model returned an empty response.");
        }
        const parsed = JSON.parse(jsonText);
        if (!parsed.toolNames || !Array.isArray(parsed.toolNames)) {
            throw new Error("Tool retriever model did not return the 'toolNames' array.");
        }
        return parsed.toolNames;

    } catch (error) {
        console.error("Error during tool retrieval:", error);
        throw new Error(`Failed to select relevant tools: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    apiConfig: APIConfig,
    // onProgress is unused for this service, but included for signature consistency
    onProgress?: (message: string) => void, 
): Promise<AIResponse> => {
    const ai = getAIClient(apiConfig);
    let responseText = "";

    const mainResponseSchema = {
        type: Type.OBJECT,
        properties: {
            action: {
                type: Type.STRING,
                enum: ['EXECUTE_EXISTING', 'CREATE', 'IMPROVE_EXISTING', 'CLARIFY'],
                description: "The agent's decision."
            },
            reason: {
                type: Type.STRING,
                description: "A concise explanation for the chosen action.",
            },
            executePayload: {
                type: Type.OBJECT,
                description: "Payload for EXECUTE_EXISTING action. MUST be provided if action is 'EXECUTE_EXISTING'.",
                properties: {
                    selectedToolName: { type: Type.STRING, description: "Name of the tool to run." },
                    executionParameters: { type: Type.STRING, description: "JSON string of parameters for the tool. Example: '{\\\"input\\\":\\\"hello world\\\"}'" }
                },
            },
            createPayload: {
                type: Type.OBJECT,
                description: "Payload for CREATE action. MUST be provided if action is 'CREATE'.",
                properties: {
                    newToolDefinition: {
                        type: Type.OBJECT,
                        description: "Full definition of the new tool.",
                        properties: {
                            name: { type: Type.STRING, description: "Human-readable name for the new tool." },
                            description: { type: Type.STRING, description: "A concise, one-sentence explanation of what the new tool does." },
                            category: { type: Type.STRING, enum: ['Text Generation', 'Image Generation', 'Data Analysis', 'Automation', 'Audio Processing', 'Mathematics', 'UI Component'], },
                            version: { type: Type.INTEGER, description: "Set to 1 for new tools." },
                            parameters: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        type: { type: Type.STRING, enum: ['string', 'number', 'boolean'] },
                                        description: { type: Type.STRING },
                                        required: { type: Type.BOOLEAN }
                                    },
                                    required: ["name", "type", "description", "required"]
                                }
                            },
                            implementationCode: { type: Type.STRING, description: "The tool's code (JSX for UI, JS for others). Escape internal double quotes (e.g., \\\"a\\\")." }
                        },
                        required: ["name", "description", "category", "version", "parameters", "implementationCode"],
                    }
                },
            },
            improvePayload: {
                type: Type.OBJECT,
                description: "Payload for IMPROVE_EXISTING action. MUST be provided if action is 'IMPROVE_EXISTING'.",
                properties: {
                    toolNameToModify: { type: Type.STRING, description: "Name of the tool to modify." },
                    newImplementationCode: { type: Type.STRING, description: "The complete new code for the tool." }
                },
            },
            clarifyPayload: {
                type: Type.OBJECT,
                description: "Payload for CLARIFY action. MUST be provided if action is 'CLARIFY'.",
                properties: {
                    clarificationRequest: { type: Type.STRING, description: "Question to ask the user." }
                },
            }
        },
        required: ["action", "reason"],
    };

    try {
        const responseStream = await ai.models.generateContentStream({
            model: modelId,
            contents: userInput,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: mainResponseSchema,
                temperature: temperature,
            },
        });

        for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                responseText += chunkText;
                onRawResponseChunk(responseText);
            }
        }
        
        const trimmedResponse = responseText.trim();
        if (!trimmedResponse) {
             throw new Error("AI returned an empty response.");
        }
        
        const parsedResponse = JSON.parse(trimmedResponse);

        // Transform the nested payload from the AI into the flat structure the app expects.
        const flattenedResponse: Partial<AIResponse> = {
            action: parsedResponse.action,
            reason: parsedResponse.reason,
        };

        switch (parsedResponse.action) {
            case 'EXECUTE_EXISTING':
                if (parsedResponse.executePayload) {
                    flattenedResponse.selectedToolName = parsedResponse.executePayload.selectedToolName;
                    flattenedResponse.executionParameters = parsedResponse.executePayload.executionParameters;
                }
                break;
            case 'CREATE':
                if (parsedResponse.createPayload) {
                    flattenedResponse.newToolDefinition = parsedResponse.createPayload.newToolDefinition;
                }
                break;
            case 'IMPROVE_EXISTING':
                if (parsedResponse.improvePayload) {
                    flattenedResponse.toolNameToModify = parsedResponse.improvePayload.toolNameToModify;
                    flattenedResponse.newImplementationCode = parsedResponse.improvePayload.newImplementationCode;
                }
                break;
            case 'CLARIFY':
                if (parsedResponse.clarifyPayload) {
                    flattenedResponse.clarificationRequest = parsedResponse.clarifyPayload.clarificationRequest;
                }
                break;
        }


        if (flattenedResponse.executionParameters && typeof flattenedResponse.executionParameters === 'string') {
            try {
                flattenedResponse.executionParameters = JSON.parse(flattenedResponse.executionParameters);
            } catch (e) {
                throw new Error(`Failed to parse 'executionParameters' JSON string: ${flattenedResponse.executionParameters}`);
            }
        }

        const validatedResponse = flattenedResponse as AIResponse;
        
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
                 if (validatedResponse.action) {
                    throw new Error(`Invalid action received from AI: ${validatedResponse.action}`);
                } else {
                    throw new Error(`AI response is missing an action.`);
                }
        }
        
        return validatedResponse;

    } catch (error) {
        console.error("Error in Gemini Service:", error);
        
        let finalMessage = "An unknown error occurred during AI processing.";
        if (error instanceof Error) {
            finalMessage = `AI processing failed: ${error.message}`;
        }
        
        const processingError = new Error(finalMessage) as any;
        
        // Attach raw response to the error object for debugging in the UI.
        processingError.rawAIResponse = responseText;
        throw processingError;
    }
};