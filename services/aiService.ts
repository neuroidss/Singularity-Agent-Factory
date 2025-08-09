
import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';

// This prompt is now only used as a fallback for providers that don't support native tool calling.
const JSON_TOOL_CALL_SYSTEM_PROMPT = `
You have access to a set of tools. To answer the user's request, you must choose one or more tools and call them.
Your response MUST be a valid JSON object representing a single tool call, OR a JSON array of tool call objects. Do not add any text, reasoning, or markdown formatting.

**Single Tool Call Format:**
{
  "name": "tool_name_to_call",
  "arguments": { "arg1": "value1" }
}

**Multiple Tool Calls Format (for parallel execution):**
[
  { "name": "tool_1", "arguments": { "arg_a": "val_a" } },
  { "name": "tool_2", "arguments": { "arg_b": "val_b" } }
]

If no tool is required, respond with an empty JSON object: {}.

Here are the available tools:
{{TOOLS_JSON}}
`;


const parseJsonOrNull = (jsonString: string): any => {
    if (!jsonString) return null;
    let jsonText = jsonString.trim();
    if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*|```\s*$/g, '');
    }
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString, e);
        return null; // Return null if parsing fails
    }
};

const parseToolCallResponse = (responseText: string): AIResponse => {
    const parsed = parseJsonOrNull(responseText);
    if (!parsed || Object.keys(parsed).length === 0) {
        return { toolCalls: null };
    }

    // Handle both a single tool call object and an array of them
    const toolCallObjects = Array.isArray(parsed) ? parsed : [parsed];

    const validToolCalls = toolCallObjects
        .map(call => {
            if (!call || typeof call !== 'object' || !call.name) return null;
            if (typeof call.arguments === 'undefined') {
                call.arguments = {};
            }
            return { name: call.name, arguments: call.arguments };
        })
        .filter(Boolean); // filter out any nulls

    if (validToolCalls.length === 0) {
        return { toolCalls: null };
    }

    return { toolCalls: validToolCalls as any[] };
};

export const generateResponse = async (
    userInput: { text: string; files: any[] },
    systemInstruction: string,
    model: AIModel,
    apiConfig: APIConfig,
    onProgress: (message: string) => void,
    relevantTools: LLMTool[],
): Promise<AIResponse> => {
    switch (model.provider) {
        case ModelProvider.GoogleAI:
            return geminiService.generateWithNativeTools(userInput.text, systemInstruction, model.id, relevantTools, userInput.files);
        
        case ModelProvider.OpenAI_API:
             // OpenAI service currently only takes text.
             return openAIService.generateWithTools(userInput.text, systemInstruction, model.id, apiConfig, relevantTools);

        case ModelProvider.Ollama:
             // Ollama service currently only takes text.
            return ollamaService.generateWithTools(userInput.text, systemInstruction, model.id, apiConfig, relevantTools);
        
        case ModelProvider.HuggingFace: {
            // HuggingFace pipeline doesn't support native tool calling, so we fall back to JSON prompting.
            const toolsForPrompt = relevantTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
            const toolDefinitions = JSON.stringify(toolsForPrompt, null, 2);
            const fullSystemInstruction = systemInstruction + '\n\n' + JSON_TOOL_CALL_SYSTEM_PROMPT.replace('{{TOOLS_JSON}}', toolDefinitions);
            const responseText = await huggingFaceService.generateJsonOutput(userInput.text, fullSystemInstruction, model.id, 0.1, apiConfig, onProgress);
            return parseToolCallResponse(responseText);
        }

        default:
            throw new Error(`Unsupported model provider: ${model.provider}`);
    }
};

export const contextualizeWithSearch = async (userInput: { text: string, files: any[] }): Promise<{ summary: string, sources: any[] }> => {
    // For now, only Gemini supports this. We can add fallbacks for other providers later if needed.
    return geminiService.generateWithGoogleSearch(userInput.text, userInput.files);
};
