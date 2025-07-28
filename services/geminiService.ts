import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import type { AIResponse, LLMTool, APIConfig, ToolParameter, EnrichedAIResponse } from "../types";

const getAIClient = (apiConfig: APIConfig): GoogleGenAI => {
    // Prioritize the key from the UI configuration.
    let apiKey = apiConfig.googleAIAPIKey;

    // Fallback to environment variable if the UI key is not provided.
    if (!apiKey) {
        try {
            // Safely access process.env to avoid breaking in pure browser environments.
            if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                apiKey = process.env.API_KEY;
            }
        } catch (e) {
            // In some sandboxed environments, accessing 'process' can throw an error.
            // We can ignore this and proceed without the environment variable.
            console.warn("Could not access process.env to check for API_KEY.");
        }
    }

    if (!apiKey) {
        throw new Error("Google AI API Key not found. Please set it in the app's API Configuration or create a API_KEY environment variable.");
    }
    return new GoogleGenAI({ apiKey });
};


// --- Dynamic Tool Generation for Gemini API ---

const sanitizeForFunctionName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

const mapTypeToGemini = (type: ToolParameter['type']): Type => {
    switch (type) {
        case 'string': return Type.STRING;
        case 'number': return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
        case 'array': return Type.ARRAY;
        case 'object': return Type.OBJECT;
        default: return Type.STRING;
    }
};

const buildGeminiTools = (tools: LLMTool[]): { functionDeclarations: FunctionDeclaration[] } => {
    const functionDeclarations = tools.map((tool): FunctionDeclaration => {
        // The properties need to be of a more complex type to support array items
        const properties: Record<string, any> = {};
        const required: string[] = [];

        tool.parameters.forEach(param => {
            if (param.type === 'array') {
                // This is the special case that fixes the bug.
                // The API requires a schema for items within an array.
                // We'll define the schema for the 'parameters' argument used in Tool Creator/Improver.
                if (param.name === 'parameters') {
                    properties[param.name] = {
                        type: Type.ARRAY,
                        description: param.description,
                        items: {
                            type: Type.OBJECT,
                            description: "Schema for a single tool parameter.",
                            properties: {
                                name: { type: Type.STRING, description: "The parameter's name." },
                                type: { type: Type.STRING, description: "The parameter's type: 'string', 'number', 'boolean', etc." },
                                description: { type: Type.STRING, description: 'A concise description of the parameter.' },
                                required: { type: Type.BOOLEAN, description: 'Whether the parameter is required.' }
                            },
                            required: ['name', 'type', 'description', 'required']
                        }
                    };
                } else {
                    // A default for other arrays, assuming they contain strings.
                    // This can be expanded if other tools use arrays of objects.
                    properties[param.name] = {
                        type: Type.ARRAY,
                        description: param.description,
                        items: { type: Type.STRING }
                    };
                }
            } else {
                properties[param.name] = {
                    type: mapTypeToGemini(param.type),
                    description: param.description,
                };
            }

            if (param.required) {
                required.push(param.name);
            }
        });
        
        // Sanitize the tool name to be a valid function name for the API
        const functionName = sanitizeForFunctionName(tool.name);

        return {
            name: functionName,
            description: tool.description,
            parameters: {
                type: Type.OBJECT,
                properties,
                required,
            },
        };
    });

    return { functionDeclarations };
};

const parseNativeToolCall = (response: GenerateContentResponse, toolNameMap: Map<string, string>): AIResponse => {
    // Standard path: Look for a functionCall part
    const functionCallPart = response.candidates?.[0]?.content?.parts?.find(part => 'functionCall' in part);

    if (functionCallPart && functionCallPart.functionCall) {
        const { name, args } = functionCallPart.functionCall;
        const originalToolName = toolNameMap.get(name);

        if (!originalToolName) {
            console.warn(`AI called an unknown tool via Gemini (native): ${name}`);
            return { toolCall: null };
        }
        return {
            toolCall: { name: originalToolName, arguments: args || {} }
        };
    }

    // Fallback path: Look for a text part with the non-standard 'print' format
    const textPart = response.candidates?.[0]?.content?.parts?.find(part => 'text' in part);
    if (textPart && textPart.text) {
        let textContent = textPart.text.trim();
        
        // Remove markdown backticks if present
        const markdownMatch = textContent.match(/```(?:tool_code|tool_call)?\s*([\s\S]+?)\s*```/);
        if (markdownMatch && markdownMatch[1]) {
            textContent = markdownMatch[1].trim();
        }

        const printRegex = /print\(default_api\.([a-zA-Z0-9_]+)\(([\s\S]*)\)\)/;
        const match = textContent.match(printRegex);

        if (match) {
            const sanitizedName = match[1];
            const argsString = match[2];
            const originalToolName = toolNameMap.get(sanitizedName);

            if (!originalToolName) {
                console.warn(`AI called an unknown tool via Gemini (fallback parser): ${sanitizedName}`);
                return { toolCall: null };
            }
            
            try {
                // The AI can return python-style kwargs with raw string literals (e.g., '\\n' for newlines).
                // When building the source for `new Function`, this `\` gets interpreted as an escape for `n`,
                // creating a literal newline in the code, which is a syntax error inside a string.
                // We must escape all backslashes in the arguments string before parsing.
                const jsSafeArgsString = argsString.replace(/\\/g, '\\\\');
                
                // This replaces python-style kwargs assignment with JS-style object properties.
                // e.g., "name='foo', code='bar'" becomes "name:'foo', code:'bar'"
                const jsObjectContent = jsSafeArgsString.replace(/([a-zA-Z0-9_]+)=/g, '$1:');
                const argsParser = new Function(`return {${jsObjectContent}}`);
                const args = argsParser();

                return {
                    toolCall: { name: originalToolName, arguments: args || {} }
                };
            } catch (e) {
                console.error("Fallback parser failed to evaluate arguments string:", e, { argsString });
                return { toolCall: null };
            }
        }
    }

    // If no parsable tool call is found
    return { toolCall: null };
};

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

    const ai = getAIClient(apiConfig);
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);

    const fullSystemInstruction = `${systemInstruction}\n\nAVAILABLE TOOLS:\n${toolsForPrompt}`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            tool_names: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING,
                    description: "The exact name of a relevant tool."
                }
            }
        },
        required: ['tool_names']
    };

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: userInput,
            config: {
                systemInstruction: fullSystemInstruction,
                temperature: temperature,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const rawResponse = response.text;
        if (!rawResponse) {
             return { names: [], rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        const names = parsed.tool_names || [];
        
        const allToolNames = new Set(allTools.map(t => t.name));
        const validNames = names.filter((name: string) => allToolNames.has(name));
        
        return { names: validNames, rawResponse };

    } catch (error) {
        console.error("Error in Gemini Service (selectTools):", error);
        const errorDetails = (error as any).message || (error as any).toString();
        const responseText = (error as any).response?.text?.();
        const finalMessage = `AI tool selection failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}`;
        
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = JSON.stringify(error, null, 2);
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
    lastActionResult: string | null,
): Promise<{ goal: string, rawResponse: string }> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The system instruction for goal generation is missing or empty. The 'Autonomous Goal Generator' tool may have been corrupted.");
    }
    const ai = getAIClient(apiConfig);
    const lightweightTools = allTools.map(t => ({ name: t.name, description: t.description, version: t.version }));
    const toolsForPrompt = JSON.stringify(lightweightTools, null, 2);

    const lastActionText = lastActionResult || "No action has been taken yet.";
    const instructionWithContext = systemInstruction
        .replace('{{LAST_ACTION_RESULT}}', lastActionText)
        .replace('{{ACTION_LIMIT}}', String(autonomousActionLimit));

    const fullSystemInstruction = `${instructionWithContext}\n\nHere is the current list of all available tools:\n${toolsForPrompt}`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            goal: {
                type: Type.STRING,
                description: "The self-generated goal for the agent."
            }
        },
        required: ['goal']
    };

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            // No user prompt, the system instruction has everything.
            contents: "What should I do next?", 
            config: {
                systemInstruction: fullSystemInstruction,
                temperature: temperature,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const rawResponse = response.text;
        if (!rawResponse) {
             return { goal: "No action needed.", rawResponse: "{}" };
        }
        
        const parsed = JSON.parse(rawResponse);
        const goal = parsed.goal || "No action needed.";
        
        return { goal, rawResponse };

    } catch (error) {
        console.error("Error in Gemini Service (generateGoal):", error);
        const errorDetails = (error as any).message || (error as any).toString();
        const responseText = (error as any).response?.text?.();
        const finalMessage = `AI goal generation failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}`;
        
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = JSON.stringify(error, null, 2);
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
    const ai = getAIClient(apiConfig);

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            is_correct: {
                type: Type.BOOLEAN,
                description: "True if the code correctly implements the description, false otherwise."
            },
            reasoning: {
                type: Type.STRING,
                description: "A brief explanation for the decision."
            }
        },
        required: ['is_correct', 'reasoning']
    };

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: "Please verify the tool as instructed.", 
            config: {
                systemInstruction: systemInstruction,
                temperature: temperature,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const rawResponse = response.text;
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
        console.error("Error in Gemini Service (verifyToolFunctionality):", error);
        const errorDetails = (error as any).message || (error as any).toString();
        const responseText = (error as any).response?.text?.();
        const finalMessage = `AI tool verification failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}`;
        
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = JSON.stringify(error, null, 2);
        throw processingError;
    }
};


export const generateResponse = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    temperature: number,
    onRawResponseChunk: (chunk: string) => void,
    apiConfig: APIConfig,
    relevantTools: LLMTool[],
    // onProgress is unused for this service, but included for signature consistency
    onProgress?: (message: string) => void, 
): Promise<AIResponse> => {
    if (typeof systemInstruction !== 'string' || !systemInstruction.trim()) {
        throw new Error("The core system instruction is missing or empty. The 'Core Agent Logic' tool may have been corrupted.");
    }
    const ai = getAIClient(apiConfig);
    
    // Create a map from sanitized name -> original name
    const toolNameMap = new Map(relevantTools.map(t => [sanitizeForFunctionName(t.name), t.name]));
    
    // Build the tool declarations for the Gemini API
    const { functionDeclarations } = buildGeminiTools(relevantTools);
    
    let rawResponseForDebug = "";

    try {
        // Use the native tool-calling feature
        const response = await ai.models.generateContent({
            model: modelId,
            contents: userInput,
            config: {
                systemInstruction: systemInstruction,
                temperature: temperature,
                tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
            },
        });
        
        // For debugging, we show the entire raw response object from the API.
        rawResponseForDebug = JSON.stringify(response, null, 2);
        onRawResponseChunk(rawResponseForDebug);

        return parseNativeToolCall(response, toolNameMap);

    } catch (error) {
        console.error("Error in Gemini Service (native tool mode):", error);
        // Try to get a more specific error message from the response if it exists
        const errorDetails = (error as any).message || (error as any).toString();
        const responseText = (error as any).response?.text?.();
        const finalMessage = `AI processing failed: ${errorDetails}${responseText ? `\nResponse: ${responseText}` : ''}`;
        
        const processingError = new Error(finalMessage) as any;
        processingError.rawAIResponse = rawResponseForDebug || JSON.stringify(error, null, 2);
        throw processingError;
    }
};