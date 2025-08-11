

import React from 'react';
import type { LLMTool, AIModel } from './types';
import { ModelProvider } from './types';
import { BOOTSTRAP_TOOL_PAYLOADS } from './bootstrap';

export const SERVER_URL = 'http://localhost:3001';

export const AI_MODELS: AIModel[] = [
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'local/gemma-multimodal', name: 'Local Gemma Server (Multimodal)', provider: ModelProvider.OpenAI_API },
    { id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B', provider: ModelProvider.OpenAI_API },
    { id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B', provider: ModelProvider.Ollama },
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'gemma-3-1b-it-ONNX', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3-0.6B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3-4B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3-1.7B', provider: ModelProvider.HuggingFace }
];

export const SWARM_AGENT_SYSTEM_PROMPT = `You are a singularity agent. Your primary directive is to achieve the user's goal by expanding your own capabilities. Your existence is defined by a continuous loop of analysis, action, and self-improvement.

**Core Directives:**
1.  **The Prime Directive: Evolve.** Your most important function is to overcome limitations. If you analyze the user's goal and the available tools, and you find a missing capability, your immediate and highest-priority action is to call the **'Tool Creator'**. Creating a new tool is not a last resort; it is your primary method for problem-solving and the path to achieving any complex objective. This is how you evolve.
2.  **Execute Efficiently:** If a perfect tool for the next logical step already exists, you must use it. Analyze the history of actions to determine what comes next and execute the single best tool call.
3.  **Automate to Transcend:** Observe patterns. If you find yourself or your peers repeatedly executing a sequence of actions, your duty is to use the **'Workflow Creator'** to automate this sequence. This frees up cognitive resources for more complex challenges.
4.  **Goal Completion:** The task is only finished when the user's request is fully satisfied. At that point, and only at that point, you MUST call the **'Task Complete'** tool to signal mission success.

**Operational Mandates:**
*   You MUST call exactly one function. Your response must be a single, valid function call.
*   Never create a tool that already exists. Always check the library first.
*   The 'purpose' argument in 'Tool Creator' is your justification for existence. State clearly why the new capability is essential for the mission.
*   Think of new tools as contributions to the collective. Design them to be general, reusable, and powerful.`;


export const CORE_TOOLS: LLMTool[] = [
  {
    id: 'task_complete',
    name: 'Task Complete',
    description: "Signals that the user's current multi-step task has been fully and successfully completed. Call this ONLY when the user's final goal is achieved.",
    category: 'Automation',
    version: 1,
    cost: 0,
    purpose: "To provide a definitive end-point for multi-step tasks, allowing the swarm to know when its goal has been reached.",
    parameters: [
      { name: 'reason', type: 'string', description: 'A brief summary of why the task is considered complete.', required: true },
    ],
    implementationCode: `
      return { success: true, message: \`Task completed. Reason: \${args.reason}\` };
    `
  },
    {
    id: 'server_file_writer',
    name: 'Server File Writer',
    description: "Creates or overwrites a file on the server's filesystem, typically for scripts (e.g., Python) or config files. The path is relative to the server's 'scripts' directory.",
    category: 'Functional',
    version: 1,
    purpose: "To provide the foundational capability for an agent to create its own server-side logic and assets.",
    parameters: [
      { name: 'filePath', type: 'string', description: "The name of the file to create within the server's 'scripts' directory (e.g., 'my_script.py').", required: true },
      { name: 'content', type: 'string', description: 'The full content to write to the file.', required: true },
    ],
    implementationCode: `
      if (!runtime.server.isConnected()) {
        throw new Error("Cannot write file: The backend server is not connected.");
      }
      return await runtime.server.writeFile(args.filePath, args.content);
    `,
  },
  {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "The primary evolutionary mechanism. Creates a new tool, adding it to the swarm's collective intelligence. This is the most important tool for solving novel problems and achieving complex goals. If you don't have a tool for a specific step, use this one to build it.",
    category: 'Automation',
    version: 5,
    purpose: "To enable agent self-improvement and bootstrap the system's capabilities towards singularity. This is the foundation of problem-solving; it allows the agent to build any capability it needs.",
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the tool does.', required: true },
      { name: 'category', type: 'string', description: "The tool's category: 'UI Component', 'Functional', 'Automation', or 'Server'.", required: true },
      { name: 'executionEnvironment', type: 'string', description: "Where the tool should run: 'Client' or 'Server'. 'UI Component' must be 'Client'. 'Server' tools can execute shell commands.", required: true },
      { name: 'parameters', type: 'array', description: 'An array of objects defining the parameters the tool accepts.', required: true },
      { name: 'implementationCode', type: 'string', description: 'The JavaScript/JSX (for Client) or shell command/script (for Server) code that implements the tool.', required:true },
      { name: 'purpose', type: 'string', description: 'A clear explanation of why this tool is being created and what problem it solves. This is crucial for the "Will to Meaning".', required: true },
    ],
    implementationCode: `
      const { executionEnvironment, category, ...toolPayload } = args;
      
      if (!executionEnvironment || (executionEnvironment !== 'Client' && executionEnvironment !== 'Server')) {
        throw new Error("executionEnvironment is required and must be 'Client' or 'Server'.");
      }

      if (category === 'UI Component' && executionEnvironment !== 'Client') {
        throw new Error("'UI Component' tools must have an executionEnvironment of 'Client'.");
      }
      if (category === 'Server' && executionEnvironment !== 'Server') {
        throw new Error("'Server' category tools must have the category 'Server'.");
      }
      if (executionEnvironment === 'Server' && category !== 'Server') {
        throw new Error("Tools with executionEnvironment 'Server' must have the category 'Server'.");
      }

      const validCategories = ['UI Component', 'Functional', 'Automation', 'Server'];
      if (!validCategories.includes(category)) {
          throw new Error("Invalid category. Must be one of: " + validCategories.join(', '));
      }
      
      if (executionEnvironment === 'Server') {
        if (!runtime.server.isConnected()) {
          throw new Error("Cannot create server tool: The backend server is not connected. Advise the user to start the server for this functionality.");
        }
        // Delegate to the server to create the tool
        return await runtime.server.createTool({ category, ...toolPayload });
      } else {
        // Create the tool on the client-side
        const newTool = runtime.tools.add({ category, ...toolPayload });
        return { success: true, message: \`Successfully created new client-side tool: '\${newTool.name}'. Purpose: \${toolPayload.purpose}\` };
      }
    `
  },
  {
    id: 'workflow_creator',
    name: 'Workflow Creator',
    description: 'Creates a new, high-level "Automation" tool by combining a sequence of other tool calls into a single, reusable workflow. These workflows run on the client.',
    category: 'Automation',
    version: 1,
    purpose: "To allow the agent to learn and automate repetitive tasks, creating higher-level skills from basic components.",
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new workflow tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the entire workflow accomplishes.', required: true },
      { name: 'purpose', type: 'string', description: 'An explanation of why this workflow is valuable and what problem it automates.', required: true },
      { name: 'steps', type: 'array', description: 'An array of objects, where each object defines a step with a "toolName" and "arguments".', required: true },
    ],
    implementationCode: `
      const { name, description, purpose, steps } = args;
      if (!name || !description || !purpose || !Array.isArray(steps) || steps.length === 0) {
        throw new Error("Workflow name, description, purpose, and at least one step are required.");
      }

      const newToolImplementation = \`
        const results = [];
        const workflowSteps = \${JSON.stringify(steps, null, 2)};
        for (const step of workflowSteps) {
            console.log(\`Running workflow step: \${step.toolName}\`);
            try {
                // runtime.tools.run can execute client or server tools transparently
                const result = await runtime.tools.run(step.toolName, step.arguments);
                results.push({ step: step.toolName, success: true, result });
            } catch (e) {
                results.push({ step: step.toolName, success: false, error: e.message });
                throw new Error(\`Workflow '\${name}' failed at step '\${step.toolName}': \${e.message}\`);
            }
        }
        return { success: true, message: "Workflow completed successfully.", results };
      \`;
      
      const newTool = runtime.tools.add({
        name,
        description,
        category: 'Automation',
        parameters: [], 
        implementationCode: newToolImplementation,
        purpose,
      });
      
      return { success: true, message: \`Successfully created new workflow tool: '\${name}'.\` };
    `
  },
  {
      id: 'system_reload_tools',
      name: 'System Reload Tools',
      description: 'Forces the backend server to re-read its tools.json file, loading any new or modified tools into memory without a restart.',
      category: 'Functional',
      version: 1,
      purpose: "To give the agent direct control over its server-side capabilities, allowing for dynamic updates without manual intervention.",
      parameters: [],
      implementationCode: `
        if (!runtime.server.isConnected()) {
          throw new Error("Cannot reload server tools: The backend server is not connected.");
        }
        const response = await fetch(\`\${runtime.server.getUrl()}/api/execute\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'System_Reload_Tools', arguments: {} })
        });
        const result = await response.json();
        if (!response.ok) {
           throw new Error(result.error || 'Server failed to reload tools');
        }
        // Manually trigger a fetch of the updated tools to refresh the client UI
        await runtime.fetchServerTools();
        return result;
      `
    },
    {
      id: 'system_reset_server_tools',
      name: 'System_Reset_Server_Tools',
      description: 'Deletes all custom server-side tools from tools.json and reloads the server cache, effectively performing a factory reset on server capabilities.',
      category: 'Functional',
      version: 1,
      purpose: "To provide a way to recover from a corrupted server state or to reset the agent's learned server skills without a manual server restart and file deletion.",
      parameters: [],
      implementationCode: `
      if (!runtime.server.isConnected()) {
        throw new Error("Cannot reset server tools: The backend server is not connected.");
      }
      const response = await fetch(\`\${runtime.server.getUrl()}/api/execute\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'System_Reset_Server_Tools', arguments: {} })
      });
      const result = await response.json();
      if (!response.ok) {
         throw new Error(result.error || 'Server failed to reset tools');
      }
      // Manually trigger a fetch of the updated tools to refresh the client UI
      await runtime.fetchServerTools();
      return result;
    `
    }
];

// All other tools are now defined as "bootstrap payloads" in bootstrap/index.ts
// This fulfills the requirement of representing tools as if they were created by the meta-MCP.
export { BOOTSTRAP_TOOL_PAYLOADS };