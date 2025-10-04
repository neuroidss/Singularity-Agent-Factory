// bootstrap/supply_chain_tools.ts
import type { ToolCreatorPayload } from '../types';
import { SUPPLY_CHAIN_SCRIPT } from './sim/supply_chain_script';

const SUPPLY_CHAIN_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Query Supplier Stock',
        description: 'Simulates a query to a real-world electronics supplier database to check for component availability. This is the backend for the in-game "Scrying" mechanic.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To bridge the in-game resource gathering with a simulation of real-world supply chain logistics.',
        parameters: [
            { name: 'partNumber', type: 'string', description: 'The manufacturer part number to search for (e.g., "ADS131M08").', required: true },
        ],
        implementationCode: `python scripts/supply_chain_query.py --part-number \${args.partNumber}`
    },
];

const SUPPLY_CHAIN_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Supply Chain Suite',
    description: 'A one-time setup action that installs all necessary tools and data for simulating supply chain queries.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's ability to interact with a simulated component supply chain, enabling the core 'grinding as querying' gameplay loop.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Supply Chain Suite...');

        // --- Step 1: Write the Python script to the server ---
        if (runtime.isServerConnected()) {
            try {
                // Write the Python query script
                await runtime.tools.run('Server File Writer', { 
                    filePath: 'supply_chain_query.py', 
                    content: ${JSON.stringify(SUPPLY_CHAIN_SCRIPT)},
                    baseDir: 'scripts'
                });
                runtime.logEvent('[INFO] Supply chain query script written successfully.');

            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to write supply chain script to server: \${e.message}\`);
            }
        } else {
            runtime.logEvent('[INFO] Server not connected. Skipping supply chain script creation. Query tools will be simulated.');
        }

        // --- Step 2: Create the tool definition ---
        const allTools = runtime.tools.list();
        const existingToolNames = new Set(allTools.map(t => t.name));

        for (const payload of ${JSON.stringify(SUPPLY_CHAIN_TOOL_DEFINITIONS)}) {
            if (existingToolNames.has(payload.name)) {
                runtime.logEvent(\`[INFO] Tool '\${payload.name}' already exists. Skipping installation.\`);
                continue;
            }
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to create new tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'Supply Chain Suite and all associated tools installed successfully.' };
    `
};

export const SUPPLY_CHAIN_TOOLS: ToolCreatorPayload[] = [
    SUPPLY_CHAIN_INSTALLER_TOOL,
];