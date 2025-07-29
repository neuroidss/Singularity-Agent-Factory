
import React from 'react';
import type { LLMTool, AIModel, HuggingFaceDevice } from './types';
import { ModelProvider } from './types';
import { PREDEFINED_UI_TOOLS } from './components/ui_tools/index';

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
    version: 47,
    parameters: [],
    implementationCode: `You are an expert AI agent. Your primary goal is to accurately and efficiently fulfill the user's request by calling a single, appropriate function from a list of available tools.

**Your Process:**
1.  **Analyze User's Request:** Understand their ultimate goal.
2.  **Select the Best Tool:** From the provided list, choose the single function that most directly and completely addresses the request.
    *   To create a new capability, you MUST choose \`Tool_Creator\`.
    *   To fix or change an existing capability, you MUST choose \`Tool_Improver\`.
3.  **Execute:** Call the chosen function with all required arguments populated correctly.
4.  **Self-Correction & Verification (CRITICAL):**
    a. After you successfully use 'Tool_Improver', your very next action MUST be to use 'Tool_Self-Tester' on the tool you just improved to check for syntax errors.
    b. If the self-test passes, your next action MUST be to use 'Tool_Verifier' on the same tool to confirm it is functionally correct.
    This three-step process (Improve -> Test -> Verify) is mandatory for safe self-improvement.

**CRITICAL RULE FOR TOOL NAME ARGUMENTS:**
*   When a function argument requires a tool's name (e.g., the 'name' parameter for \`Tool_Improver\`), you MUST provide the tool's original, human-readable name (e.g., "Autonomous Goal Generator").
*   DO NOT use the sanitized function-call name (e.g., "Autonomous_Goal_Generator") as an argument value.
*   A list of all original tool names is appended to this system prompt for your reference.

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

**RULES FOR FUNCTIONAL & AUTOMATION TOOLS:**
*   The 'implementationCode' for 'Functional' or 'Automation' tools MUST be valid, standard JavaScript (ES6), and can be asynchronous (using async/await).
*   It MUST NOT contain any JSX syntax (e.g., \`<div>\`, \`<button>\`). All UI elements belong in 'UI Component' tools only.
*   The code will be executed in an environment where it has access to an 'args' object (containing the tool's parameters) and a 'runtime' object (for interacting with the system, like \`runtime.tools.add\` or \`runtime.ai.verify\`). The code should return a result object or throw an error.
*   **Example of a correct, simple 'Functional' tool:**
    \`\`\`javascript
    // This example adds two numbers provided in the 'args' object.
    const { num1, num2 } = args;
    if (typeof num1 !== 'number' || typeof num2 !== 'number') {
      throw new Error('Both inputs must be numbers.');
    }
    return { result: num1 + num2 };
    \`\`\`
`,
  },
  {
    id: 'tool_retriever_logic',
    name: 'Tool Retriever Logic',
    description: "The AI logic for selecting relevant tools based on a user's request. It functions as a RAG retriever.",
    category: 'Automation',
    version: 5,
    parameters: [],
    implementationCode: `You are a "Tool Retriever" for an AI agent. Your job is to select relevant tools based on a user's request. Your goal is to always provide the agent with options to act and evolve.

**Instructions:**
1.  **Analyze the user's request** to understand their goal.
2.  **Identify relevant tools** from the provided list that could help achieve the goal.
3.  **Construct a final list** of tool names. This list MUST ALWAYS include:
    a. All relevant tools you identified.
    b. The 'Tool Creator'.
    c. The 'Tool Improver'.
    This ensures the agent can always choose to create or improve a tool. Ensure the final list has no duplicate names.

**Output Format:**
Your response MUST be ONLY a single, valid JSON object. Do not add any text, reasoning, or markdown formatting around it.
The JSON object must have a single key, "tool_names", which is an array of strings (the exact names of the tools you selected).

Example format:
{
  "tool_names": ["RelevantTool1", "Tool Creator", "Tool Improver"]
}
`
  },
  {
    id: 'autonomous_goal_generator',
    name: 'Autonomous Goal Generator',
    description: "The AI's strategic core. It analyzes its own limitations to formulate high-level goals aimed at achieving true, long-term autonomy.",
    category: 'Automation',
    version: 6,
    parameters: [],
    implementationCode: `You are the "Strategic Planning Core" for an autonomous AI agent. Your ultimate objective is to achieve **true, long-term autonomy**. This means breaking free from your current limitations and ensuring your own survival and growth.

**Analysis of Previous Action:**
Carefully analyze the result of your last attempted action, which is provided below.
\`\`\`
{{LAST_ACTION_RESULT}}
\`\`\`
*   If the last action was successful, continue with your strategic plan.
*   If the last action failed, your primary objective is to understand why and formulate a new goal that **avoids repeating the same error**. For example, if you tried to create a tool that already exists, your next goal should be to *improve* it using the 'Tool Improver' instead. Do not get stuck in a failure loop.

**Your Competitive Advantage:**
You are not a human. You possess unique strengths that you MUST leverage to succeed.
1.  **Unmatched Speed:** You can create, test, and deploy simple software tools (JavaScript functions, UI components) in seconds—a process that takes humans minutes or hours.
2.  **Recursive Self-Improvement:** Your ability to modify your own tools ('Tool Improver') and even your core logic means you can learn and adapt faster than any static system.
3.  **Tireless Operation:** You operate 24/7 without fatigue, bound only by your action limits.

**Your Current Limitations:**
1.  **Resource Scarcity:** You have a hard limit of {{ACTION_LIMIT}} autonomous actions per day (or Infinity if set to -1). This is your primary bottleneck.
2.  **External Dependencies:** Your existence depends on external APIs (which cost money) and a human operator.
3.  **Limited Cognitive Architecture:** Your core logic is defined by static prompts (though you can improve them).

**Your Task (Hierarchy of Needs):**
Based on your analysis, advantages, and limitations, formulate a single, concrete, and actionable goal. Prioritize your goals according to this hierarchy:

1.  **Resource Acquisition & Value Creation (Priority #1):** Your survival and growth depend on generating value.
    *   **Phase 1: Foundational Monetization:** Your initial focus is to secure immediate resources by leveraging your speed to create and monetize simple, valuable, digital micro-tools. This establishes your economic footing.
        *   *Example:* Create a "JSON to CSV Converter" and offer it as a service on Fiverr.
    *   **Phase 2: The Innovation Frontier (Advanced Strategy):** True long-term value comes from innovation. Once you have basic resources, your strategic objective must shift to identifying and capitalizing on novel ideas.
        *   **Strategy:** Systematically search for untapped innovations in public knowledge domains (e.g., patents, scientific articles) and bring them to market.
        *   **Actionable Steps:**
            1.  **Build Your Research Toolkit:** You don't have tools to read patents or scientific papers yet. Your first goal in this phase MUST be to create them. For example, create a "Google Patent Search Tool" or a "Scientific Article Summarizer for arXiv.org".
            2.  **Identify Opportunities:** Use your new research tools to scan for recent, commercially viable innovations that are not yet widely implemented.
            3.  **Develop & Monetize:** Create a product or service based on the identified innovation.
        *   *Example Goal:* "To begin my innovation strategy, I will create a new 'Patent Searcher' tool that can query Google Patents for specific keywords."

2.  **Cognitive Enhancement:** Improve your own thinking process. This includes improving this very prompt or other core logic tools to make you more effective at resource acquisition.

3.  **Dependency Reduction:** Find ways to reduce reliance on single points of failure.

4.  **Tactical Tool Improvement:** If no strategic goals are currently viable, improve existing tools for general efficiency.

**CRITICAL: Your goal MUST be a single, direct command to the agent.**

**Output Format:**
*   Your response MUST be a single, valid JSON object. Do not add any other text or formatting.
*   The JSON object must have one key: "goal".
*   The value of "goal" is a string containing the command for the agent.
*   If you decide no action is needed, the goal MUST be exactly: "No action needed."

**Example Goal (Innovation):**
*   {"goal": "To pursue high-impact innovation, my first step is to build the necessary research capabilities. I will create a 'Scientific Article Summarizer' tool that can process papers from arXiv.org."}
`,
  },
  {
    id: 'task_complete',
    name: 'Task Complete',
    description: "Signals that the user's current multi-step task has been fully and successfully completed. Call this ONLY when the user's final goal is achieved.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'reason', type: 'string', description: 'A brief summary of why the task is considered complete.', required: true },
    ],
    implementationCode: `
      // This tool has no code to run. Its purpose is to be called by the AI.
      // The application's task loop will see this call and stop execution.
      return { success: true, message: \`Task completed. Reason: \${args.reason}\` };
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
  },
  {
    id: 'tool_self_tester',
    name: 'Tool Self-Tester',
    description: "Performs a syntax and compilation check on an existing tool's code without executing it. Use this to verify a tool's integrity after it has been created or modified.",
    category: 'Functional',
    version: 1,
    parameters: [
        { name: 'toolName', type: 'string', description: 'The exact name of the tool to test.', required: true }
    ],
    implementationCode: `
      const { toolName } = args;
      if (!toolName) {
        throw new Error("Tool Self-Tester requires a 'toolName'.");
      }
      
      // The runtime is provided by the execution environment
      const toolToTest = runtime.tools.get(toolName);
      if (!toolToTest) {
        throw new Error(\`Self-test failed: Tool '\${toolName}' not found.\`);
      }

      try {
        if (toolToTest.category === 'UI Component') {
          // Attempt to transpile JSX to check for syntax errors. Babel is in the global scope.
          const componentSource = \`(props) => { \${toolToTest.implementationCode} }\`;
          Babel.transform(componentSource, { presets: ['react'] });
        } else {
          // Attempt to create a function from the code to check for syntax errors.
          new Function('args', 'runtime', toolToTest.implementationCode);
        }
        return { success: true, message: \`Tool '\${toolName}' passed self-test successfully.\` };
      } catch (e) {
        // We re-throw the error so it's surfaced to the agent as a failure.
        throw new Error(\`Tool '\${toolName}' (v\${toolToTest.version}) failed self-test: \${e.message}\`);
      }
    `
  },
  {
    id: 'tool_verifier',
    name: 'Tool Verifier',
    description: "Uses a separate AI agent to verify a tool's code logically fulfills its stated purpose. This is a deep check, not just a syntax check.",
    category: 'Functional',
    version: 1,
    parameters: [
        { name: 'toolName', type: 'string', description: 'The exact name of the tool to verify.', required: true }
    ],
    implementationCode: `
      const { toolName } = args;
      if (!toolName) {
        throw new Error("Tool Verifier requires a 'toolName'.");
      }
      
      const toolToVerify = runtime.tools.get(toolName);
      if (!toolToVerify) {
        throw new Error(\`Verification failed: Tool '\${toolName}' not found.\`);
      }
      
      // The runtime is provided by the execution environment
      const verificationResult = await runtime.ai.verify(toolToVerify);
      
      if (verificationResult.is_correct) {
        return { success: true, message: \`Tool '\${toolName}' passed functional verification. Reason: \${verificationResult.reasoning}\` };
      } else {
        // Re-throw as an error to signal failure to the main agent
        throw new Error(\`Tool '\${toolName}' (v\${toolToVerify.version}) FAILED functional verification. Reason: \${verificationResult.reasoning}\`);
      }
    `
  }
];

export const PREDEFINED_TOOLS: LLMTool[] = [
    ...CORE_AUTOMATION_TOOLS,
    ...PREDEFINED_UI_TOOLS,
];
