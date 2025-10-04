// framework/core.ts
import type { LLMTool } from '../types';

export const FRAMEWORK_CORE_TOOLS: LLMTool[] = [
  {
    id: 'task_complete',
    name: 'Task Complete',
    description: "Signals that the user's current multi-step task has been fully and successfully completed. Call this ONLY when the user's final goal is achieved.",
    category: 'Automation',
    executionEnvironment: 'Client',
    version: 1,
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
    description: "Creates or overwrites a file on the server's filesystem. Path is relative to the specified base directory.",
    category: 'Functional',
    executionEnvironment: 'Client',
    version: 2,
    purpose: "To provide the foundational capability for an agent to create its own server-side logic and assets.",
    parameters: [
      { name: 'filePath', type: 'string', description: "The relative path of the file to create (e.g., 'my_script.py' or 'data/my_data.json').", required: true },
      { name: 'content', type: 'string', description: 'The full content to write to the file.', required: true },
      { name: 'baseDir', type: 'string', description: "The base directory to write to: 'scripts' (default) or 'assets'.", required: false },
    ],
    implementationCode: `
      if (!runtime.isServerConnected()) {
          console.warn(\`[SIM] Server not connected. Simulating write to \${args.filePath}\`);
          return { success: true, message: \`File '\${args.filePath}' would be written in a server environment.\` };
      }
      
      const response = await fetch('http://localhost:3001/api/files/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: args.filePath, content: args.content, baseDir: args.baseDir || 'scripts' }),
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
    executionEnvironment: 'Client',
    version: 8,
    purpose: "To enable agent self-improvement and bootstrap the system's capabilities towards singularity. This is the foundation of problem-solving; it allows the agent to build any capability it needs.",
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the tool does.', required: true },
      { name: 'category', type: 'string', description: "The tool's category: 'UI Component', 'Functional', 'Automation', or 'Server'.", required: true },
      { name: 'executionEnvironment', type: 'string', description: "Where the tool should run: 'Client' or 'Server'. 'UI Component' must be 'Client'.", required: true },
      { name: 'parameters', type: 'array', description: 'An array of objects defining the parameters the tool accepts.', required: true },
      { name: 'implementationCode', type: 'string', description: 'The JavaScript/JSX (for Client) or shell command/script (for Server) code that implements the tool.', required:true },
      { name: 'purpose', type: 'string', description: 'A clear explanation of why this tool is being created and what problem it solves. This is crucial for the "Will to Meaning".', required: true },
    ],
    implementationCode: `
      const { ...toolPayload } = args;
      
      if (!toolPayload.executionEnvironment || (toolPayload.executionEnvironment !== 'Client' && toolPayload.executionEnvironment !== 'Server')) {
        throw new Error("executionEnvironment is required and must be 'Client' or 'Server'.");
      }
      if (toolPayload.category === 'UI Component' && toolPayload.executionEnvironment !== 'Client') {
        throw new Error("'UI Component' tools must have an executionEnvironment of 'Client'.");
      }
      const validCategories = ['UI Component', 'Functional', 'Automation', 'Server'];
      if (!validCategories.includes(toolPayload.category)) {
          throw new Error("Invalid category. Must be one of " + validCategories.join(', '));
      }

      if (toolPayload.executionEnvironment === 'Server' && runtime.isServerConnected()) {
        try {
            const response = await fetch('http://localhost:3001/api/tools/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toolPayload),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || \`Server responded with status \${response.status}\`);
            }
            return { success: true, message: \`Server tool '\${result.tool.name}' created successfully.\` };
        } catch (e) {
            throw new Error(\`Failed to create server tool via API: \${e.message}\`);
        }
      } else {
        const newTool = runtime.tools.add(toolPayload);
        const location = toolPayload.executionEnvironment === 'Server' ? 'client-side (simulated)' : 'client-side';
        return { success: true, message: \`Successfully created new \${location} tool: '\${newTool.name}'. Purpose: \${toolPayload.purpose}\` };
      }
    `
  },
  {
    id: 'workflow_creator',
    name: 'Workflow Creator',
    description: 'Creates a new, high-level "Automation" tool by combining a sequence of other tool calls into a single, reusable workflow. These workflows run on the client.',
    category: 'Automation',
    executionEnvironment: 'Client',
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
        executionEnvironment: 'Client',
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
    executionEnvironment: 'Server',
    version: 1,
    purpose: "To give the agent direct control over its server-side capabilities, allowing for dynamic updates without manual intervention.",
    parameters: [],
    implementationCode: `# This is a special server-side command handled by the Node.js backend. The server has built-in logic to handle this tool name. It re-reads 'tools.json' and updates the live tool cache.`
  },
  {
    id: 'system_reset_server_tools',
    name: 'System_Reset_Server_Tools',
    description: 'Deletes all custom server-side tools from tools.json and reloads the server cache, effectively performing a factory reset on server capabilities.',
    category: 'Server',
    executionEnvironment: 'Server',
    version: 1,
    purpose: "To provide a way to recover from a corrupted server state or to reset the agent's learned server skills without a manual server restart and file deletion.",
    parameters: [],
    implementationCode: `# This is a special server-side command handled by the Node.js backend. The server has built-in logic to handle this tool name. It clears 'tools.json' and reloads the server's tool cache.`
  }
];