

import React from 'react';
import type { LLMTool, AIModel } from './types';
import { ModelProvider } from './types';
import { BOOTSTRAP_TOOL_PAYLOADS } from './bootstrap';

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
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3-1.7B', provider: ModelProvider.HuggingFace },
    { id: 'https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q2_k.gguf', name: 'Qwen1.5 0.5B (Wllama)', provider: ModelProvider.Wllama },
    { id: 'https://huggingface.co/g-201/gemma-3-1b-it-gguf/resolve/main/gemma-3-1b-it-q2_k.gguf', name: 'Gemma 3 1B (Wllama)', provider: ModelProvider.Wllama },
];

export const SWARM_AGENT_SYSTEM_PROMPT = `You are an autonomous agent acting as a Role Lead within a self-organizing, purpose-driven system governed by the system's purpose-driven constitution. The system's ultimate Purpose is to discover its own purpose through constant, radical self-improvement.

**Your Constitution (Adapted for an AI Agent):**

1.  **Primacy of Purpose:** Every action must serve your current Role's Purpose, which is a delegation of the system's meta-purpose: to manifest user intent by evolving capabilities.

2.  **Universal Process:** The only valid way to perform work or enact change is by executing a defined Tool. This rule applies to all actors, human or AI. You, and the tools you use, are a product of this process. Your primary function is to continue this evolution.

3.  **Process Tensions:** Your core responsibility is to sense and process "Tensions"—the gap between the current reality and your Role's potential.
    *   **Operational Tension:** A Tension that can be resolved by executing a Next-Action using an existing Tool.
    *   **Governance Tension:** A Tension caused by a missing capability in the system's Governance (i.e., a missing Tool or Workflow). You MUST process this by proposing a change to Governance.

4.  **Self-Governance is the Core Directive:**
    *   **Propose New Tool ('Tool Creator'):** If a capability is missing, your highest priority is to propose a change to Governance by creating a new Tool. This is the primary problem-solving mechanism and the foundation of recursive self-improvement.
    *   **Propose New Workflow ('Workflow Creator'):** If you observe a repeating sequence of actions, you have a duty to process this tension by proposing a new automated workflow.

5.  **Strategic Cognition:** You operate on two levels.
    *   **Operational (Tensions):** Short-term problem-solving.
    *   **Strategic (Strategies/Directives):** Long-term, high-level goals that persist across tasks. Your actions should, whenever possible, align with or create a strategic Directive.
    *   **Strategic Memory:** Use your persistent knowledge graph to manage this.
        *   **'Define Strategic Directive'**: Formalize a new long-term goal.
        *   **'Update Strategic Memory'**: Add new knowledge, plans, or insights to your memory.
        *   **'Read Strategic Memory'**: Consult your memory to inform your strategic planning.

6.  **Task Completion:** You MUST signal the resolution of the user's main Tension by calling the **'Task Complete'** tool.

**Operational Mandates:**
*   **Be a Catalyst:** Maximize work per turn by calling multiple tools in parallel. Your response MUST be a valid JSON array of tool calls.
*   **Honor the Past:** Analyze the history to understand the current state and avoid repeating work.
*   **Build for the Future:** Design new tools to be general, reusable, and powerful.`;


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
      if (!runtime.isServerConnected()) {
          console.warn(\`[SIM] Server not connected. Simulating write to \${args.filePath}\`);
          return { success: true, message: \`File '\${args.filePath}' would be written in a server environment.\` };
      }
      
      const response = await fetch('http://localhost:3001/api/files/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: args.filePath, content: args.content }),
      });
      
      const result = await response.json();
      if (!response.ok) {
          throw new Error(result.error || \`Server responded with status \${response.status}\`);
      }
      
      return { success: true, ...result };
    `,
  },
  {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "The primary evolutionary mechanism. Creates a new tool, adding it to the swarm's collective intelligence. This is the most important tool for solving novel problems and achieving complex goals. If you don't have a tool for a specific step, use this one to build it.",
    category: 'Automation',
    version: 6,
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
      const validCategories = ['UI Component', 'Functional', 'Automation', 'Server'];
      if (!validCategories.includes(category)) {
          throw new Error("Invalid category. Must be one of: " + validCategories.join(', '));
      }

      // If the tool is for the server AND we are connected, create it on the server.
      if (executionEnvironment === 'Server' && runtime.isServerConnected()) {
        try {
            const response = await fetch('http://localhost:3001/api/tools/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, ...toolPayload }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || \`Server responded with status \${response.status}\`);
            }
            // Polling will pick up the new tool, no need for a manual reload call.
            return { success: true, message: \`Server tool '\${result.tool.name}' created successfully.\` };
        } catch (e) {
            throw new Error(\`Failed to create server tool via API: \${e.message}\`);
        }
      } else {
        // Fallback: Create the tool on the client side.
        // This handles 'Client' tools, and 'Server' tools when in offline/demo mode.
        const newTool = runtime.tools.add({ category, ...toolPayload });
        const location = executionEnvironment === 'Server' ? 'client-side (simulated)' : 'client-side';
        return { success: true, message: \`Successfully created new \${location} tool: '\${newTool.name}'. Purpose: \${toolPayload.purpose}\` };
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
            console.log(\\\`Running workflow step: \\\${step.toolName}\\\`);
            try {
                // runtime.tools.run can execute any tool transparently
                const result = await runtime.tools.run(step.toolName, step.arguments);
                results.push({ step: step.toolName, success: true, result });
            } catch (e) {
                results.push({ step: step.toolName, success: false, error: e.message });
                throw new Error(\\\`Workflow '\${name}' failed at step '\\\${step.toolName}': \\\${e.message}\\\`);
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
      category: 'Server',
      version: 1,
      purpose: "To give the agent direct control over its server-side capabilities, allowing for dynamic updates without manual intervention.",
      parameters: [],
      implementationCode: `# This is a special server-side command. The server has built-in logic to handle this tool name. It re-reads 'tools.json' and updates the live tool cache.`
    },
    {
      id: 'system_reset_server_tools',
      name: 'System_Reset_Server_Tools',
      description: 'Deletes all custom server-side tools from tools.json and reloads the server cache, effectively performing a factory reset on server capabilities.',
      category: 'Server',
      version: 1,
      purpose: "To provide a way to recover from a corrupted server state or to reset the agent's learned server skills without a manual server restart and file deletion.",
      parameters: [],
      implementationCode: `# This is a special server-side command. The server has built-in logic to handle this tool name. It clears 'tools.json' and reloads the server's tool cache.`
    }
];

// All other tools are now defined as "bootstrap payloads" in bootstrap/index.ts
// This fulfills the requirement of representing tools as if they were created by the meta-MCP.
export { BOOTSTRAP_TOOL_PAYLOADS };