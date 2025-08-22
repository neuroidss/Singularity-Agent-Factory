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
            { name: 'netLengthWeight', type: 'number', description: 'Attraction force along nets to shorten them.', required: false },
            { name: 'boardEdgeConstraint', type: 'number', description: 'Force pushing components from the board edge.', required: false },
            { name: 'distributionStrength', type: 'number', description: 'Force pushing all components away from the center to spread them out.', required: false },
            { name: 'settlingSpeed', type: 'number', description: 'Damping factor for the simulation (0.8 to 0.99). Higher is slower but more stable.', required: false },
            { name: 'repulsionRampUpTime', type: 'number', description: 'Time in simulation frames (approx 60/sec) for repulsion force to reach full strength.', required: false },
            { name: 'proximityStrength', type: 'number', description: 'Strength of the force pulling proximity groups together.', required: false },
            { name: 'symmetryStrength', type: 'number', description: 'Strength of the force mirroring component pairs.', required: false },
            { name: 'alignmentStrength', type: 'number', description: 'Strength of the force aligning components on an axis.', required: false },
            { name: 'circularStrength', type: 'number', description: 'Strength of the force arranging components in a circle.', required: false },
            { name: 'symmetricalPairStrength', type: 'number', description: 'Strength of the force for symmetrical pairs with fixed separation.', required: false },
            { name: 'absolutePositionStrength', type: 'number', description: 'Strength of the force locking a component to a specific coordinate.', required: false },
            { name: 'fixedRotationStrength', type: 'number', description: 'Strength of the torque twisting a component to a fixed rotation.', required: false },
            { name: 'symmetryRotationStrength', type: 'number', description: 'Strength of the torque for symmetrical rotation.', required: false },
            { name: 'circularRotationStrength', type: 'number', description: 'Strength of the torque for circular rotation pattern.', required: false },
        ],
        implementationCode: `
            // This is a special client-side tool. Its logic is handled inside useAppRuntime
            // to directly update the state in useKicadManager for the simulation.
            const updatedValues = Object.entries(args).filter(([, value]) => value !== undefined && value !== null).length;
            return { success: true, message: \`Updated \${updatedValues} simulation heuristics.\` };
        `
    }
];