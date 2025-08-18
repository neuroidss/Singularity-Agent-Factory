
// bootstrap/simulation_tools.ts
import type { ToolCreatorPayload } from '../types';

export const SIMULATION_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Set Simulation Heuristics',
        description: 'Configures the global forces and physics parameters for the layout simulation engine.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To tune the behavior of the autonomous layout engine by adjusting core physics parameters like repulsion, attraction, and damping.',
        parameters: [
            { name: 'componentSpacing', type: 'number', description: 'Repulsion force between components.', required: false },
            { name: 'netLengthWeight', type: 'number', description: 'Attraction force along nets.', required: false },
            { name: 'boardEdgeConstraint', type: 'number', description: 'Force pushing components from the edge.', required: false },
            { name: 'settlingSpeed', type: 'number', description: 'Damping factor for the simulation (0.8 to 0.99).', required: false },
        ],
        implementationCode: `
            // This is a special client-side tool. Its logic is handled inside useAppRuntime
            // to directly update the state in useKicadManager for the simulation.
            const updatedValues = Object.entries(args).filter(([, value]) => value !== undefined && value !== null).length;
            return { success: true, message: \`Updated \${updatedValues} simulation heuristics.\` };
        `
    }
];
