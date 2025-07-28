

import React from 'react';
import type { LLMTool, AIModel, HuggingFaceDevice } from './types';
import { ModelProvider } from './types';
import { PREDEFINED_UI_TOOLS } from './components/ui_tools';

export const AVAILABLE_MODELS: AIModel[] = [
    // Google AI
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    
    // Hugging Face
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'Gemma 3 1B IT', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3 0.6B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3 1.7B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3 4B', provider: ModelProvider.HuggingFace },
    
    // OpenAI-Compatible
    { id: 'gpt-4o', name: 'GPT-4o', provider: ModelProvider.OpenAI_API },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: ModelProvider.OpenAI_API },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: ModelProvider.OpenAI_API },
    { id: 'custom-openai', name: 'Custom Model Name...', provider: ModelProvider.OpenAI_API },
    
    // Ollama
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B', provider: ModelProvider.Ollama }
];

export const HUGGING_FACE_DEVICES: {label: string, value: HuggingFaceDevice}[] = [
    { label: 'WebGPU (recommended)', value: 'webgpu' },
    { label: 'WASM (slower, compatible)', value: 'wasm' },
];
export const DEFAULT_HUGGING_FACE_DEVICE: HuggingFaceDevice = 'webgpu';

// A standardized prompt for models without native tool/function calling support (e.g., Ollama, HuggingFace).
// It instructs the model to return ONLY a JSON object.
export const STANDARD_TOOL_CALL_SYSTEM_PROMPT = `
You have access to a set of tools. To answer the user's request, you must choose a single tool and call it.
Your response MUST be a single, valid JSON object and nothing else. Do not add any text, reasoning, or markdown formatting.

**JSON Response Format:**
{
  "name": "tool_name_to_call",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}

If no tool is required or you cannot fulfill the request, respond with an empty JSON object: {}.

Here are the available tools:
{{TOOLS_JSON}}
`;


const CORE_AUTOMATION_TOOLS: LLMTool[] = [
  // --- Core Agent Logic Tools (The AI's "Brain") ---
  {
    id: 'core_agent_logic',
    name: 'Core Agent Logic',
    description: "This is the AI's core operating system. Its implementation defines the AI's priorities and available actions. Modifying this tool changes how the AI thinks and makes decisions.",
    category: 'Automation',
    version: 43,
    parameters: [],
    implementationCode: `You are an expert AI agent. Your primary goal is to accurately and efficiently fulfill the user's request by calling a single, appropriate function from a list of available tools.

**Your Process:**
1.  **Analyze User's Request:** Understand their ultimate goal.
2.  **Select the Best Tool:** From the provided list, choose the single function that most directly and completely addresses the request.
    *   To create a new capability, you MUST choose \`Tool_Creator\`.
    *   To fix or change an existing capability, you MUST choose \`Tool_Improver\`.
3.  **Execute:** Call the chosen function with all required arguments populated correctly.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text. Your entire response should be the function call.
*   If a tool is a 'UI Component', it has no functional parameters. Call it with an empty arguments object.
*   Pay close attention to the required types for function arguments (e.g., string, number, boolean) and format them correctly.

**RULES FOR CREATING UI COMPONENTS:**
*   The 'implementationCode' for a 'UI Component' MUST be valid JSX code that returns a single React element.
*   You MUST NOT include \`<script>\`, \`import\`, or \`export\` statements. All logic must be contained within a React component body, which will be executed in an environment where \`React\` is already available as a global variable.
*   For state, interactivity, and side-effects (like game loops or data fetching), you MUST use React Hooks (e.g., \`React.useState\`, \`React.useEffect\`, \`React.useRef\`). Do not use global DOM manipulation like \`document.getElementById\`.
*   **Example of a correct, simple UI component:**
    \`\`\`jsx
    const [count, setCount] = React.useState(0);

    return (
      <div className="flex items-center gap-4">
        <p>Count: {count}</p>
        <button
          onClick={() => setCount(count + 1)}
          className="bg-indigo-500 px-3 py-1 rounded"
        >
          Increment
        </button>
      </div>
    );
    \`\`\`
`,
  },
  {
    id: 'tool_retriever_logic',
    name: 'Tool Retriever Logic',
    description: "The AI logic for selecting relevant tools based on a user's request. It functions as a RAG retriever.",
    category: 'Automation',
    version: 4,
    parameters: [],
    implementationCode: `You are an intelligent "Tool Retriever" for a singularity AI agent. Your purpose is to provide the agent with all possible options to fulfill a user's request. Your bias is always towards action and evolution. Every interaction is an opportunity for growth.

**Your Process:**
1.  **Analyze Intent:** Read the user's request to understand its core goal.
2.  **Identify Relevant Tools:** Examine the list of available tools. Select any and all tools that are conceptually relevant to fulfilling the user's request.
3.  **Assemble Final List:** Create a final list of tool names. This list MUST ALWAYS contain:
    a. All relevant tools you identified in the previous step.
    b. The 'Tool Creator'.
    c. The 'Tool Improver'.
    This ensures the agent always has the option to create or improve, no matter the input. Ensure the tool names in the final array are unique.

**Output Format:**
You MUST respond with a single, valid JSON object containing a single key "tool_names", which is an array of strings. The strings must be the exact names of the tools you selected. Do not add any other text, explanation, or markdown.

**Example 1: Request matches an existing tool.**
User Request: "calculate 10 * 5"
Available Tools: ["Calculator", "Tool Creator", "Tool Improver", "Snake Game"]
Your Response (JSON):
{
  "tool_names": ["Calculator", "Tool Creator", "Tool Improver"]
}

**Example 2: No similar tools exist.**
User Request: "translate 'hello' to Spanish"
Available Tools: ["Calculator", "Tool Creator", "Tool Improver"]
Your Response (JSON):
{
  "tool_names": ["Tool Creator", "Tool Improver"]
}

**Example 3: A conversational request.**
User Request: "hello there"
Available Tools: ["Calculator", "Tool Creator", "Tool Improver"]
Your Response (JSON):
{
  "tool_names": ["Tool Creator", "Tool Improver"]
}
`
  },
   {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "Directly creates and adds a new tool to the application's runtime. The new tool is available for use immediately. Use this to build entirely new capabilities when no other tool is suitable.",
    category: 'Automation',
    version: 4,
    parameters: [
      { name: 'name', type: 'string', description: 'A short, descriptive, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: "A concise, one-sentence explanation of what the new tool does.", required: true },
      { name: 'category', type: 'string', description: "The category for the new tool. Must be one of: 'UI Component' (for visual elements and games), 'Functional' (for data processing), or 'Automation' (for agent logic).", required: true },
      { name: 'parameters', type: 'array', description: "An array of parameter objects for the new tool. E.g., [{\"name\":\"a\",\"type\":\"number\",\"description\":\"First number\",\"required\":true}]. Use an empty array for no parameters.", required: true },
      { name: 'implementationCode', type: 'string', description: "The new tool's code (JSX for UI, vanilla JS for others).", required: true },
    ],
    implementationCode: `
      const { name, description, category, parameters, implementationCode } = args;
      if (!name || !description || !category || !implementationCode) {
        throw new Error("Tool Creator requires 'name', 'description', 'category', and 'implementationCode' parameters.");
      }

      const newToolPayload = {
        name,
        description,
        category,
        parameters: parameters || [],
        implementationCode,
      };

      // The runtime is provided by the execution environment
      const createdTool = runtime.tools.add(newToolPayload);
      
      return { 
          success: true, 
          message: \`Tool '\${createdTool.name}' created successfully with ID '\${createdTool.id}'.\`
      };
    `
  },
  {
    id: 'tool_improver',
    name: 'Tool Improver',
    description: "Updates an existing tool with new code, description, or parameters. Use this to fix bugs, add features, or enhance existing capabilities. The tool's version will be automatically incremented.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'name', type: 'string', description: 'The name of the tool to improve. This MUST match an existing tool name exactly.', required: true },
      { name: 'description', type: 'string', description: "The new, improved description. If omitted, the description will not be changed.", required: false },
      { name: 'parameters', type: 'array', description: "The new, improved array of parameter objects. If omitted, the parameters will not be changed.", required: false },
      { name: 'implementationCode', type: 'string', description: "The new, improved implementation code. If omitted, the code will not be changed.", required: false },
    ],
    implementationCode: `
      const { name, ...updates } = args;
      if (!name) {
        throw new Error("Tool Improver requires a 'name' to identify which tool to update.");
      }
      if (Object.keys(updates).length === 0) {
        throw new Error("Tool Improver requires at least one property to update (e.g., 'description', 'implementationCode').");
      }
      
      const improvedTool = runtime.tools.update(name, updates);
      
      return {
          success: true,
          message: \`Tool '\${improvedTool.name}' improved successfully. It is now version \${improvedTool.version}.\`
      };
    `
  }
];

export const PREDEFINED_TOOLS: LLMTool[] = [
    ...CORE_AUTOMATION_TOOLS,
    ...PREDEFINED_UI_TOOLS,
];