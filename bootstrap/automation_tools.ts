
import type { ToolCreatorPayload } from '../types';
import { GEMMA_SERVER_SCRIPT, LOCAL_AI_PANEL_TOOL_PAYLOAD } from './local_ai_tools';

export const AUTOMATION_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Install Local Multimodal AI Demo',
        description: 'Installs the complete local AI server feature. This includes writing the Python server script to the backend and creating the necessary server-side control tools and the client-side UI panel.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To demonstrate the agent\'s ability to dynamically add complex, multimodal capabilities to itself and the swarm.',
        parameters: [],
        implementationCode: `
            const scriptContent = ${JSON.stringify(GEMMA_SERVER_SCRIPT)};
            const panelPayload = ${JSON.stringify(LOCAL_AI_PANEL_TOOL_PAYLOAD)};
            
            // Payloads for the new server-side tools
            const startServerToolPayload = {
                name: 'Start Local AI Server',
                description: 'Starts the python gemma_server.py process on the backend.',
                category: 'Server',
                parameters: [],
                implementationCode: 'start_local_ai', // Special keyword for server
                purpose: 'To activate the local multimodal AI model.'
            };
            const stopServerToolPayload = {
                name: 'Stop Local AI Server',
                description: 'Stops the python gemma_server.py process on the backend.',
                category: 'Server',
                parameters: [],
                implementationCode: 'stop_local_ai', // Special keyword for server
                purpose: 'To deactivate the local multimodal AI model and free resources.'
            };
            const statusServerToolPayload = {
                name: 'Get Local AI Server Status',
                description: 'Gets the status and logs of the local AI server process from the backend.',
                category: 'Server',
                parameters: [],
                implementationCode: 'status_local_ai', // Special keyword for server
                purpose: 'To monitor the local multimodal AI model.'
            };

            // Step 1: Write the Python script to the server's filesystem
            await runtime.tools.run('Server File Writer', {
                filePath: 'gemma_server.py',
                content: scriptContent
            });
            
            // Step 2: Create the server-side control tools by calling the Tool Creator
            await runtime.tools.run('Tool Creator', { ...startServerToolPayload, executionEnvironment: 'Server' });
            await runtime.tools.run('Tool Creator', { ...stopServerToolPayload, executionEnvironment: 'Server' });
            await runtime.tools.run('Tool Creator', { ...statusServerToolPayload, executionEnvironment: 'Server' });

            // Step 3: Create the client-side UI panel
            await runtime.tools.run('Tool Creator', { ...panelPayload, executionEnvironment: 'Client' });
            
            // Step 4: Manually trigger a fetch of server tools to update the client UI immediately
            await runtime.fetchServerTools();

            return { success: true, message: 'Local AI Demo installed. The control tools and UI panel are now available.' };
        `
    },
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
]
