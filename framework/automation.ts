// framework/automation.ts
import type { ToolCreatorPayload } from '../types';

export const AUTOMATION_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Propose Skill From Observation',
        description: "Analyzes the recent history of the user's actions, infers the high-level intent behind them, and proposes the creation of a new, reusable tool (a workflow or a more complex functional tool) to automate that task. This is the primary mechanism for the agent to learn from its human partner.",
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To enable the agent to learn from a human pilot by turning observed complex actions into new, generalized, and reusable skills, rather than just replaying a sequence of clicks.',
        parameters: [
          { name: 'skillName', type: 'string', description: 'A descriptive name for the new skill to be created (e.g., "ApplyDecouplingCapacitorPattern").', required: true },
          { name: 'skillDescription', type: 'string', description: 'A clear description of what the new skill or tool will accomplish.', required: true },
          { name: 'skillPurpose', type: 'string', description: 'A clear explanation of why this new skill is valuable and what problem it solves.', required: true },
        ],
        implementationCode: `
          const { skillName, skillDescription, skillPurpose } = args;
          const observedActions = runtime.getObservationHistory();
    
          if (observedActions.length < 2) {
            throw new Error("Not enough actions observed to create a skill. Manually perform at least 2 actions first.");
          }
    
          // 1. Analyze the sequence of actions with an LLM to generate implementation code.
          const systemPrompt = "You are an expert software engineer AI. Your task is to analyze a sequence of tool calls performed by a user and generate the 'implementationCode' for a new, reusable, higher-level tool that automates this workflow. The code should be a JavaScript async function body that uses the 'runtime' object to call other tools. It should be parameterized based on the arguments from the observed actions.";
          const prompt = \`
            I am creating a new tool called '\${skillName}'.
            Based on the following sequence of observed user actions, please generate the JavaScript 'implementationCode' for this new tool.
            The code should be general enough to be reused. Identify which arguments should be parameters for the new tool.

            Observed Actions:
            \${JSON.stringify(observedActions, null, 2)}
          \`;

          const implementationCode = await runtime.ai.generateText(prompt, systemPrompt);

          // 2. Propose the creation of the new tool to the user by calling Tool Creator.
          // In a real scenario, we might add a user confirmation step here.
          await runtime.tools.run('Tool Creator', {
            name: skillName,
            description: skillDescription,
            category: 'Automation', // New skills are typically automation
            executionEnvironment: 'Client',
            parameters: [
                // TODO: The AI should also generate the parameter definitions.
                // For now, we'll make it a parameterless tool for simplicity.
            ],
            implementationCode: implementationCode,
            purpose: skillPurpose,
          });
    
          // 3. Clear the observation history after the skill has been proposed/created.
          runtime.clearObservationHistory();
    
          return { success: true, message: \`Successfully proposed and created new skill '\${skillName}' based on \${observedActions.length} observed actions.\` };
        `
    },
];
`