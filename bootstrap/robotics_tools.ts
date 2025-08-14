
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
        description: 'Moves the robot one step forward in its current direction.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for robot locomotion.',
        parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to move.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Move forward command issued." };
        `
    },
    {
        name: 'Turn Left',
        description: 'Turns the robot 90 degrees to its left.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for robot orientation.',
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
        description: 'Turns the robot 90 degrees to its right.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a primitive action for robot orientation.',
         parameters: [
            { name: 'agentId', type: 'string', description: 'The ID of the robot to turn.', required: true }
        ],
        implementationCode: `
            // Implemented directly in useAppRuntime for state management.
            return { success: true, message: "Turn right command issued." };
        `
    }
];