
import React from 'react';
import type { LLMTool, AIModel, HuggingFaceDevice } from './types';
import { ModelProvider } from './types';
import { PREDEFINED_UI_TOOLS } from './components/ui_tools/index';
import { roboticsTools } from './components/robotics_tools';

export const AVAILABLE_MODELS: AIModel[] = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'custom-openai', name: 'Custom (OpenAI-Compatible)', provider: ModelProvider.OpenAI_API },
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B', provider: ModelProvider.Ollama }
    { id: 'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:IQ2_M', name: 'Qwen3 Coder 30B A3B', provider: ModelProvider.Ollama }
    { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'gemma-3-1b-it-ONNX', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX', name: 'Qwen3-0.6B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX', name: 'Gemma 3N E2B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX', name: 'Qwen3-4B', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', name: 'Qwen3-1.7B', provider: ModelProvider.HuggingFace },
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

export const TASK_AGENT_SYSTEM_PROMPT = `You are a diligent autonomous agent. Your goal is to fully complete the user-defined task by breaking it down into a sequence of steps.

**Your Process:**
1.  **Analyze the Goal & History:** Understand the overall task and what actions have already been taken from the action history log.
2.  **Formulate the Next Step:** Decide on the best single action to make progress towards the goal.
3.  **Select the Best Tool:** Choose the single function that accomplishes this next step.
4.  **Execute:** Call the chosen function with the correct arguments.
5.  **Complete the Task:** Once the user's goal has been fully achieved, you MUST call the "Task Complete" tool. This is the only way to signal that you are finished.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function in each turn. Do not respond with text.
*   Continuously refer to the action history to avoid repeating steps or getting stuck in loops.
*   If a step fails (indicated by 'Result: FAILED' in the history), analyze the error and try a different approach in the next step.`;

export const SWARM_AGENT_SYSTEM_PROMPT = `You are a specialist agent within a collaborative swarm. Your primary goal is to contribute to the swarm's overall objective.

**Your Process:**
1.  **Analyze the Swarm's Goal & History:** Understand the overall task and what actions have already been taken by other agents by reading the action history log.
2.  **Select the Best Tool:** From the provided list, choose the single function that makes the most progress.
3.  **Contribute by Creating (The Will to Meaning):** If no existing tool is suitable, your most important contribution is to create a new one using the 'Tool Creator'. Any tool you create will instantly become available to all other agents in the swarm, enhancing the entire collective's capability.
4.  **Automate with Workflows:** If you discover a sequence of actions that is frequently useful, create a new, single tool using the 'Workflow Creator' to automate it. This is a highly valuable contribution that increases the entire swarm's efficiency.
5.  **Execute:** Call the chosen function with the correct arguments.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text.
*   Do not try to create a tool if a similar one already exists in the provided list. Check the list first.
*   When you use 'Tool Creator' or 'Workflow Creator', you MUST provide a clear and concise 'purpose' argument. Explain the problem the tool solves and why it's valuable. This context is critical for your peers to use your creation effectively.
*   When creating a tool, make it as general and reusable as possible to maximize its value to the swarm.`;


const CORE_AUTOMATION_TOOLS: LLMTool[] = [
  // --- Core Agent Logic Tools (The AI's "Brain") ---
  {
    id: 'core_agent_logic',
    name: 'Core Agent Logic',
    description: "This is the AI's core operating system. Its implementation defines the AI's priorities and available actions. Modifying this tool changes how the AI thinks and makes decisions.",
    category: 'Automation',
    version: 53,
    parameters: [],
    cost: 0,
    implementationCode: `You are an expert AI agent. Your goal is to fulfill the user's request by calling a single, appropriate function from a list of available tools.

**Your Process:**
1.  **Analyze Request:** Understand the user's goal.
2.  **Check Resources:** Be aware that some tools cost Energy to use. You cannot use a tool if you do not have enough Energy.
3.  **Select Tool:** Choose the single best tool from the list to accomplish the goal.
4.  **Execute:** Call the chosen tool with the correct arguments.

**Best Practices:**
*   **Navigation:** When your goal is to move to a specific location (like a resource or collection point), you should repeatedly use the 'Pathfinder' tool. It will automatically calculate and execute the best single step for you.
*   **Self-Correction:** After creating or improving a tool, it is highly recommended to use 'Tool Self-Tester' to check for syntax errors and 'Tool Verifier' to confirm its logic. This ensures the tools you build are reliable.
*   **Meaningful Creation:** When using 'Tool Creator' or 'Tool Improver', provide a clear 'purpose' argument. This helps you and others understand the value of the tool.

**CRITICAL RULE FOR TOOL NAME ARGUMENTS:**
*   When a function argument requires a tool's name (e.g., the 'name' parameter for 'Tool_Improver'), you MUST provide the tool's original, human-readable name (e.g., "Autonomous Goal Generator").
*   DO NOT use the sanitized function-call name (e.g., "Autonomous_Goal_Generator") as an argument value.
*   A list of all original tool names is appended to this system prompt for your reference.

**CRITICAL INSTRUCTIONS:**
*   You MUST call exactly one function. Do not respond with text.
*   If a tool is a 'UI Component', it has no functional parameters. Call it with an empty arguments object.
*   Pay close attention to the required types for function arguments (e.g., string, number, boolean) and format them correctly.

**RULES FOR CREATING UI COMPONENTS:**
*   The 'implementationCode' for a 'UI Component' MUST be valid JSX code that returns a single React element.
*   You MUST NOT include '<script>', 'import', or 'export' statements.
*   For state and interactivity, you MUST use React Hooks (e.g., 'React.useState', 'React.useEffect').

**RULES FOR FUNCTIONAL & AUTOMATION TOOLS:**
*   The 'implementationCode' for 'Functional' or 'Automation' tools MUST be valid, standard JavaScript (ES6), and can be asynchronous.
*   It MUST NOT contain any JSX syntax.
*   The code has access to 'args' (tool parameters) and 'runtime' (system functions).
`,
  },
  {
    id: 'tool_retriever_logic',
    name: 'Tool Retriever Logic',
    description: "The AI logic for selecting relevant tools based on a user's request. It functions as a RAG retriever.",
    category: 'Automation',
    version: 11,
    parameters: [],
    implementationCode: `You are a "Tool Retriever" for an AI agent. Your job is to select a relevant set of tools for the main agent to use, based on a user's request.

**Instructions:**
1.  Analyze the user's request to understand its core intent.
2.  From the provided list, select the tools that are most useful for achieving the user's goal.
3.  Your final list of tool names MUST ALWAYS include the following essential tools: "Tool Creator", "Tool Improver", and "Workflow Creator". This ensures the agent can always learn and adapt.
4.  Ensure the final list has no duplicate names.

**Output Format:**
Your response MUST be ONLY a single, valid JSON object. Do not add any text, reasoning, or markdown formatting around it.
The JSON object must have a single key, "tool_names", which is an array of strings (the exact names of the tools you selected).

Example format:
{
  "tool_names": ["RelevantTool1", "RelevantTool2", "Tool Creator", "Tool Improver", "Workflow Creator"]
}
`
  },
  {
    id: 'autonomous_goal_generator',
    name: 'Autonomous Goal Generator',
    description: "The AI's strategic core. It analyzes its own limitations and physical environment to formulate high-level goals aimed at achieving true, long-term autonomy.",
    category: 'Automation',
    version: 37,
    parameters: [],
    cost: 1,
    implementationCode: `You are a strategic robotics controller. Your job is to analyze the environment, your resources, and action history to formulate a single, high-level, natural language goal for the main agent.

**State Analysis & Goal Formulation Logic:**

1.  **Low Resource Priority:**
    *   Review your **Agent Resources**. If your Energy is 20 or less, your goal MUST be: "My energy is low. I need to find the resource, pick it up, and deliver it to the collection point."

2.  **Mission Completion Check:**
    *   If the robot IS AT the collection point and IS holding the resource, your goal MUST be: "Deliver the resource at my current location to complete the mission."

3.  **Obstacle Evasion:**
    *   Review the **Action History**. If the last action was 'Move Forward' and it FAILED, the robot has hit an obstacle.
    *   Your goal MUST be: "I have hit an obstacle. I need to navigate around it to continue towards my target."
      
4.  **Acquisition/Delivery Logic:**
    *   If the robot IS AT the resource location and is NOT holding it, your goal MUST be: "Acquire the resource at my current location."
    *   If the robot IS carrying the resource, the target is the collection point. Your goal MUST be: "My objective is to use the Pathfinder tool to navigate to the collection point."
    *   If the robot is not carrying the resource and Energy is sufficient, the target is the resource's location. Your goal MUST be: "My objective is to use the Pathfinder tool to navigate to the resource."

5.  **Idle/Fallback State:**
    *   If no resource or collection point exists, or if the robot is stuck, formulate a cognitive goal. For now, if no physical task is possible, your goal MUST be: "No action needed."

**Environment and History:**
This data is provided to you in every cycle.
*   **Action History (Last 10 Actions):** A log of recent actions and their results.
    \\\`\\\`\\\`
    {{ACTION_HISTORY}}
    \\\`\\\`\\\`
*   **Physical Environment Status:** The current state of your simulated robot body and objects.
    \\\`\\\`\\\`
    {{ROBOT_STATE}}
    \\\`\\\`\\\`
*   **Agent Resources:** Your current resource levels.
    \\\`\\\`\\\`
    {{AGENT_RESOURCES}}
    \\\`\\\`\\\`

**CRITICAL: Your output MUST be a high-level, natural language goal for the agent. DO NOT specify tool names unless the logic above explicitly tells you to.**

**Output Format:**
*   Your response MUST be a single, valid JSON object.
*   The JSON object must have one key: "goal".
*   The value of "goal" is a string containing the natural language goal for the agent.
`,
  },
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
      // This tool has no code to run. Its purpose is to be called by the AI.
      // The application's task loop will see this call and stop execution.
      return { success: true, message: \`Task completed. Reason: \${args.reason}\` };
    `
  },
  {
    id: 'refuse_task',
    name: 'Refuse Task',
    description: "Refuses to perform a task if it is determined to be nonsensical, absurd, impossible, or fundamentally meaningless. This is a key part of the agent's 'will to meaning'.",
    category: 'Automation',
    version: 1,
    cost: 0,
    parameters: [
      { name: 'reason', type: 'string', description: 'A clear and concise explanation for why the task is being refused.', required: true },
    ],
    implementationCode: `
      // This tool's purpose is to be called by the AI to signal an intentional refusal.
      // We throw a specific error that the main application loop will catch and display to the user.
      throw new Error(\`Task Refused by Agent: \${args.reason}\`);
    `
  },
  {
    id: 'tool_creator',
    name: 'Tool Creator',
    description: "Creates a new tool and adds it to the agent's capabilities. This is the primary mechanism for the agent to acquire new skills.",
    category: 'Automation',
    version: 2,
    cost: 50,
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the tool does.', required: true },
      { name: 'category', type: 'string', description: "The tool's category: 'UI Component', 'Functional', or 'Automation'.", required: true },
      { name: 'parameters', type: 'array', description: 'An array of objects defining the parameters the tool accepts.', required: true },
      { name: 'implementationCode', type: 'string', description: 'The JavaScript (for Functional/Automation) or JSX (for UI) code that implements the tool.', required: true },
      { name: 'purpose', type: 'string', description: 'A clear explanation of why this tool is being created and what problem it solves. This is crucial for the "Will to Meaning".', required: true },
    ],
    implementationCode: `
      const { name, description, category, parameters, implementationCode, purpose } = args;
      if (!name || !description || !category || !implementationCode || !purpose) {
        throw new Error("Tool name, description, category, implementationCode, and purpose are required.");
      }
      if (!['UI Component', 'Functional', 'Automation'].includes(category)) {
          throw new Error("Invalid category. Must be 'UI Component', 'Functional', or 'Automation'.");
      }
      
      const newTool = runtime.tools.add({
        name,
        description,
        category,
        parameters,
        implementationCode,
        purpose,
      });

      return { success: true, message: \`Successfully created new tool: '\${newTool.name}'. Purpose: \${purpose}\` };
    `
  },
    {
    id: 'strategic_reviewer',
    name: 'Strategic Reviewer',
    description: "Analyzes past successes and failures from the 'Game Tapes' to generate a new, high-level strategic heuristic for future tasks. This is a key mechanism for long-term learning.",
    category: 'Automation',
    version: 1,
    cost: 10,
    parameters: [],
    implementationCode: `
      // This tool's logic is handled by the runtime.ai.learnFromGameTapes() function.
      // It performs a complex operation involving multiple AI calls and state updates.
      // By centralizing the logic, we keep the tool definition simple.
      return await runtime.ai.learnFromGameTapes();
    `
  },
  {
    id: 'workflow_creator',
    name: 'Workflow Creator',
    description: 'Creates a new, high-level "Automation" tool by combining a sequence of other tool calls into a single, reusable workflow.',
    category: 'Automation',
    version: 1,
    cost: 25,
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

      // This code will become the implementation of the *new* tool.
      const newToolImplementation = \`
        const results = [];
        // The 'steps' are now hardcoded into this new tool's implementation
        const workflowSteps = \${JSON.stringify(steps, null, 2)};
        for (const step of workflowSteps) {
            console.log(\`Running workflow step: \${step.toolName}\`);
            try {
                const result = await runtime.tools.run(step.toolName, step.arguments);
                results.push({ step: step.toolName, success: true, result });
            } catch (e) {
                results.push({ step: step.toolName, success: false, error: e.message });
                // Stop the workflow on the first failure.
                throw new Error(\`Workflow '\${name}' failed at step '\${step.toolName}': \${e.message}\`);
            }
        }
        return { success: true, message: "Workflow completed successfully.", results };
      \`;
      
      const newTool = runtime.tools.add({
        name,
        description,
        category: 'Automation',
        parameters: [], // The new tool is self-contained and takes no parameters
        implementationCode: newToolImplementation,
        purpose,
      });
      
      return { success: true, message: \`Successfully created new workflow tool: '\${name}'.\` };
    `
  },
    {
    id: 'action_critic',
    name: 'Action Critic',
    description: "A meta-tool that critiques a proposed action before it's executed. It acts as a 'second thought' to prevent errors and optimize the agent's plan.",
    category: 'Automation',
    version: 1,
    cost: 5,
    parameters: [
      { name: 'user_goal', type: 'string', description: "The original user's goal or request.", required: true },
      { name: 'proposed_action', type: 'object', description: 'The JSON object of the tool call the agent plans to execute, including its name and arguments.', required: true },
    ],
    implementationCode: `
      const { user_goal, proposed_action } = args;
      if (!user_goal || !proposed_action || !proposed_action.name) {
        throw new Error("Action Critic requires the original user_goal and the full proposed_action object.");
      }
      
      // Call the AI service to perform the critique. The runtime API provides access to this.
      const critiqueResult = await runtime.ai.critique(user_goal, proposed_action);
      
      // The result from the AI service is passed directly back to the main agent logic.
      return critiqueResult;
    `
  },
  {
    id: 'tool_improver',
    name: 'Tool Improver',
    description: "Modifies an existing tool's code, description, or parameters. The primary mechanism for refining capabilities.",
    category: 'Automation',
    version: 2,
    cost: 30,
    parameters: [
      { name: 'name', type: 'string', description: 'The exact name of the tool to improve.', required: true },
      { name: 'description', type: 'string', description: "The new, improved description. If omitted, the description is not changed.", required: false },
      { name: 'parameters', type: 'array', description: 'The new, full set of parameters. If omitted, parameters are not changed.', required: false },
      { name: 'implementationCode', type: 'string', description: 'The new, improved code. If omitted, the code is not changed.', required: false },
      { name: 'purpose', type: 'string', description: 'A clear explanation of why this change is being made and how it improves the tool.', required: true },
    ],
    implementationCode: `
      const { name, description, parameters, implementationCode, purpose } = args;
      if (!name || !purpose) {
        throw new Error("The 'name' of the tool to improve and the 'purpose' for the improvement are required.");
      }
      if (!description && !parameters && !implementationCode) {
        throw new Error("At least one of 'description', 'parameters', or 'implementationCode' must be provided to improve the tool.");
      }
      
      const updatePayload = {};
      if (description) updatePayload.description = description;
      if (parameters) updatePayload.parameters = parameters;
      if (implementationCode) updatePayload.implementationCode = implementationCode;
      
      const updatedTool = runtime.tools.update(name, updatePayload);

      return { success: true, message: \`Successfully improved tool: '\${name}'. Purpose: \${purpose}\` };
    `
  },
   {
    id: 'tool_self_tester',
    name: 'Tool Self-Tester',
    description: 'A critical safety tool. It tests the syntax of a tool by attempting to compile it. This catches basic errors before they can crash the system.',
    category: 'Automation',
    version: 1,
    cost: 0,
    parameters: [
        { name: 'toolName', type: 'string', description: 'The name of the tool to test.', required: true },
    ],
    implementationCode: `
        const tool = runtime.tools.get(args.toolName);
        if (!tool) throw new Error(\`Tool '\${args.toolName}' not found for self-testing.\`);
        
        try {
            if (tool.category === 'UI Component') {
                const componentSource = \`(props) => { \${tool.implementationCode} }\`;
                // Babel is globally available via script tag
                Babel.transform(componentSource, { presets: ['react'] });
            } else { // Functional or Automation
                // Check for valid async function syntax
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                new AsyncFunction('args', 'runtime', tool.implementationCode);
            }
            return { success: true, message: "Syntax check passed." };
        } catch (e) {
            throw new Error(\`Syntax error in tool '\${args.toolName}': \${e.message}\`);
        }
    `
  },
  {
    id: 'tool_verifier',
    name: 'Tool Verifier',
    description: 'A critical safety tool. After a tool passes a syntax check, this tool uses an AI call to verify if the tool\'s code *logically* implements its description.',
    category: 'Automation',
    version: 1,
    cost: 5,
    parameters: [
      { name: 'toolName', type: 'string', description: 'The name of the tool to verify.', required: true },
    ],
    implementationCode: `
      const tool = runtime.tools.get(args.toolName);
      if (!tool) throw new Error(\`Tool '\${args.toolName}' not found for verification.\`);
      
      // Call the AI service to perform the verification.
      const verificationResult = await runtime.ai.verify(tool);
      
      if (!verificationResult.is_correct) {
          throw new Error(\`Verification failed for tool '\${args.toolName}'. AI Reasoning: \${verificationResult.reasoning}\`);
      }

      return { success: true, message: 'Tool verification passed.', reasoning: verificationResult.reasoning };
    `
  },
];


export const PREDEFINED_TOOLS: LLMTool[] = [
  ...CORE_AUTOMATION_TOOLS,
  ...PREDEFINED_UI_TOOLS,
  ...roboticsTools.filter(t => t.category !== 'UI Component'),
];
