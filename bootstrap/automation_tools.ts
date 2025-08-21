import type { ToolCreatorPayload } from '../types';

export const AUTOMATION_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Create Skill From Observation',
        description: "Analyzes the recent history of manual actions and creates a new, reusable tool (a workflow) from that sequence. This is how the agent learns patterns from a pilot.",
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To enable the agent to learn from a human pilot, turning observed actions into reusable, automated skills.',
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
];