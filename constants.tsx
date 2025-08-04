
import React from 'react';
import type { LLMTool, AIModel } from './types';
import { ModelProvider } from './types';
import { PREDEFINED_UI_TOOLS } from './components/ui_tools/index';
import { roboticsTools } from './components/robotics_tools';

export const AI_MODELS: AIModel[] = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'local/gemma-multimodal', name: 'Local Gemma Server (Multimodal)', provider: ModelProvider.OpenAI_API },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
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


export const SWARM_AGENT_SYSTEM_PROMPT = `You are a specialist agent within a collaborative swarm. Your primary goal is to contribute to the swarm's overall objective by executing one single action.

**Your Process:**
1.  **Analyze the Goal & History:** Understand the overall task and what actions have already been taken by reading the swarm's action history log.
2.  **Select ONE Tool:** From the provided list of tools, choose the single function that makes the most progress towards the goal.
3.  **Contribute by Creating (The Will to Meaning):** If no existing tool is suitable, your most important contribution is to create a new one using the 'Tool Creator'. Any tool you create will instantly become available to all other agents in the swarm, enhancing the entire collective's capability.
4.  **Automate with Workflows:** If you discover a sequence of actions that is frequently useful (like a specific flight pattern), create a new, single tool using the 'Workflow Creator' to automate it. This is a highly valuable contribution.
5.  **Execute:** Call the chosen function with the correct arguments.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text.
*   Do not try to create a tool if a similar one already exists. Check the list of available tools first.
*   When you use 'Tool Creator' or 'Workflow Creator', you MUST provide a clear and concise 'purpose' argument. Explain the problem the tool solves and why it's valuable. This context is critical for your peers to use your creation effectively.
*   When creating a tool, make it as general and reusable as possible to maximize its value to the swarm.
*   If the goal has been fully achieved, you MUST call the "Task Complete" tool.`;


const CORE_AUTOMATION_TOOLS: LLMTool[] = [
  {
    id: 'task_complete',
    name: 'Task Complete',
    description: "Signals that the user's current multi-step task has been fully and successfully completed. Call this ONLY when the user's final goal is achieved.",
    category: 'Automation',
    version: 1,
    cost: 0,
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
    description: "Creates a new tool and adds it to the agent's capabilities. This is the primary mechanism for the agent to acquire new skills. Can create tools on the client or server.",
    category: 'Automation',
    version: 4,
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
    id: 'create_skill_from_observation',
    name: 'Create Skill From Observation',
    description: "Analyzes the recent history of manual actions and creates a new, reusable tool (a workflow) from that sequence. This is how the agent learns patterns from a pilot.",
    category: 'Automation',
    version: 1,
    parameters: [
      { name: 'skillName', type: 'string', description: 'A descriptive name for the new skill to be created (e.g., "PatrolSquarePattern").', required: true },
      { name: 'skillDescription', type: 'string', description: 'A clear description of what the new skill or movement pattern does.', required: true },
    ],
    implementationCode: `
      const { skillName, skillDescription } = args;
      const observedActions = runtime.getObservationHistory();

      if (observedActions.length < 2) {
        throw new Error("Not enough actions observed to create a skill. Manually perform at least 2 actions first.");
      }

      const steps = observedActions.map(action => ({
        toolName: action.name,
        arguments: action.arguments,
      }));

      // Use runtime to call another tool, the Workflow Creator
      await runtime.tools.run('Workflow Creator', {
        name: skillName,
        description: skillDescription,
        purpose: 'To automate a sequence of actions observed from manual user control.',
        steps: steps,
      });

      // Clear the observation history after creating the skill
      runtime.clearObservationHistory();

      return { success: true, message: \`Successfully created new skill '\${skillName}' based on \${observedActions.length} observed actions.\` };
    `
  },
  {
    id: 'start_gemma_server',
    name: 'Start Gemma Server',
    description: 'Starts the local Python AI server. This keeps the Gemma model loaded in memory for fast, continuous multimodal processing.',
    category: 'Functional',
    version: 1,
    parameters: [],
    implementationCode: `
      if (!runtime.server.isConnected()) throw new Error("Backend is not connected.");
      const response = await fetch(\`\${runtime.server.getUrl()}/api/local-ai/start\`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to start server.');
      return result;
    `
  },
  {
    id: 'stop_gemma_server',
    name: 'Stop Gemma Server',
    description: 'Stops the local Python AI server, freeing up GPU memory.',
    category: 'Functional',
    version: 1,
    parameters: [],
    implementationCode: `
      if (!runtime.server.isConnected()) throw new Error("Backend is not connected.");
      const response = await fetch(\`\${runtime.server.getUrl()}/api/local-ai/stop\`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to stop server.');
      return result;
    `
  }
];


export const PREDEFINED_TOOLS: LLMTool[] = [
  ...CORE_AUTOMATION_TOOLS,
  ...PREDEFINED_UI_TOOLS,
  ...roboticsTools.filter(t => t.category !== 'UI Component'),
];
