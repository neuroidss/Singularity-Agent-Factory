import type { ToolCreatorPayload } from '../types';

export const ROBOTICS_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Define Robot Agent',
        description: 'Defines a new robot agent with a specific behavior personality for the simulation.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To configure and instantiate individual robot agents before starting a simulation.',
        parameters: [
          { name: 'id', type: 'string', description: 'The unique identifier for the robot agent.', required: true },
          { name: 'startX', type: 'number', description: 'The starting X coordinate for the agent.', required: true },
          { name: 'startY', type: 'number', description: 'The starting Y coordinate for the agent.', required: true },
          { name: 'behaviorType', type: 'string', description: "The agent's behavior: 'patroller', 'resource_collector', or 'seek_target'.", required: true },
          { name: 'targetId', type: 'string', description: "The ID of the target object for 'seek_target' behavior (e.g., 'red_car').", required: false },
          { name: 'asset_glb', type: 'string', description: "Optional path to a GLB model for the agent's visual representation (e.g., 'assets/robot.glb').", required: false },
        ],
        implementationCode: `
            // This is a client-side tool whose logic is handled inside useAppRuntime
            // to directly update the state in useRobotManager.
            return { success: true, message: \`Personality for agent '\${args.id}' has been defined.\` };
        `
    },
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