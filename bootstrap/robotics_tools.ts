import type { ToolCreatorPayload } from '../types';

export const ROBOTICS_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Start Robot Simulation',
        description: 'Starts the robotics simulation, creating all defined agents on the field.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To initialize and begin the robotics simulation.',
        parameters: [],
        implementationCode: `
            // Logic is handled in useAppRuntime to set the robot states based on personalities.
            return { success: true, message: 'Robot simulation started.' };
        `
    },
    {
        name: 'Step Robot Simulation',
        description: 'Advances the simulation by one time step, causing all agents to perform an action.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To execute one tick of the simulation, updating agent states based on their behavior.',
        parameters: [],
        implementationCode: `
            // The core logic for agent behaviors (patrolling, seeking, etc.) would be implemented here,
            // likely by iterating through agents and calling other primitive tools (Move, Turn) based on their state and goals.
            // For now, it's a placeholder for the LLM to expand upon.
            return { success: true, message: 'Advanced simulation by one step for all agents.' };
        `
    },
    {
        name: 'Stop Robot Simulation',
        description: 'Stops the robotics simulation and removes all agents from the field.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To terminate and reset the robotics simulation environment.',
        parameters: [],
        implementationCode: `
            // Logic is handled in useAppRuntime to clear robot states and personalities.
            return { success: true, message: 'Robot simulation stopped and cleared.' };
        `
    },
    {
        name: 'Move Forward',
        description: 'A fundamental robotic action for navigation. Moves the specified agent one unit forward in its current direction. Use this as part of a sequence to patrol, explore, or approach a target.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for agent locomotion, forming the basis for all higher-level movement skills like pathfinding and exploration.',
        parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to move.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Move forward command issued." };
        `
    },
    {
        name: 'Move Backward',
        description: 'A fundamental robotic action for navigation. Moves the specified agent one unit backward from its current direction. Useful for maneuvering in tight spaces or retreating.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for agent locomotion, allowing for reverse movement as part of complex navigation skills.',
        parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to move.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Move backward command issued." };
        `
    },
    {
        name: 'Turn Left',
        description: 'A fundamental robotic action for orientation. Rotates the specified agent 90 degrees to its left (counter-clockwise). Essential for changing direction during navigation and exploration.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for changing an agent\'s orientation, enabling pathfinding and target acquisition.',
         parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to turn.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Turn left command issued." };
        `
    },
    {
        name: 'Turn Right',
        description: 'A fundamental robotic action for orientation. Rotates the specified agent 90 degrees to its right (clockwise). Essential for changing direction during navigation and exploration.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for changing an agent\'s orientation, enabling pathfinding and target acquisition.',
         parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to turn.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Turn right command issued." };
        `
    }
];


export const ROBOTICS_TOOLS: ToolCreatorPayload[] = [
    ...ROBOTICS_TOOL_DEFINITIONS,
];