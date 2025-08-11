

import { ModelProvider, type AIModel, type APIConfig, type AIResponse, type LLMTool } from '../types';
import * as geminiService from './geminiService';
import * as openAIService from './openAIService';
import * as ollamaService from './ollamaService';
import * as huggingFaceService from './huggingFaceService';

// This prompt is now only used as a fallback for providers that don't support native tool calling.
const JSON_TOOL_CALL_SYSTEM_PROMPT = `
You are a tool-calling AI. Your only purpose is to respond with a JSON object or a JSON array of objects representing tool calls.

**Response Requirements:**
*   Your response MUST be valid JSON.
*   Your response MUST NOT be wrapped in markdown (e.g., \`\`\`json ... \`\`\`).
*   Your response MUST NOT contain any text, explanations, or comments outside of the JSON structure.

**Formats:**
1.  **Single Tool Call (JSON Object):**
    \`\`\`json
    {
      "name": "tool_name",
      "arguments": { "arg1": "value1" }
    }
    \`\`\`

2.  **Multiple Tool Calls (JSON Array):**
    \`\`\`json
    [
      { "name": "tool_one", "arguments": { "arg_a": "val_a" } },
      { "name": "tool_two", "arguments": { "arg_b": "val_b" } }
    ]
    \`\`\`

3.  **No Action:**
    If no tool is suitable, respond with an empty JSON object: \`{}\`.

The list of available tools is provided below.
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