import { useState, useCallback } from 'react';
import type { RobotState, EnvironmentObject, AIToolCall, EnrichedAIResponse, AgentPersonality } from '../types';

const initialEnvironmentState: EnvironmentObject[] = [
    // Arena walls
    ...Array.from({length: 25}, (_, i) => ({ x: i - 12, y: 12, type: 'wall' as const })),
    ...Array.from({length: 25}, (_, i) => ({ x: i - 12, y: -12, type: 'wall' as const })),
    ...Array.from({length: 23}, (_, i) => ({ x: -12, y: i - 11, type: 'wall' as const })),
    ...Array.from({length: 23}, (_, i) => ({ x: 12, y: i - 11, type: 'wall' as const })),
    // Foliage (trees)
    { x: -5, y: -5, type: 'tree' }, { x: -6, y: -4, type: 'tree' }, { x: -4, y: -6, type: 'tree' },
    { x: 5, y: 5, type: 'tree' }, { x: 6, y: 4, type: 'tree' }, { x: 4, y: 6, type: 'tree' },
    { x: -5, y: 5, type: 'tree' }, { x: -4, y: 4, type: 'tree' },
    { x: 5, y: -5, type: 'tree' }, { x: 4, y: -4, type: 'tree' },
    // Target ("red car")
    { x: 9, y: -9, type: 'target', id: 'red_car' },
    // Resource and collection point (for other behaviors)
    { x: 9, y: 2, type: 'resource' },
    { x: -9, y: 9, type: 'collection_point' },
];

export const useRobotManager = ({ logEvent }: { logEvent: (message: string) => void }) => {
    const [robotStates, setRobotStates] = useState<RobotState[]>([]);
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>(initialEnvironmentState);
    const [observationHistory, setObservationHistory] = useState<AIToolCall[]>([]);
    const [agentPersonalities, setAgentPersonalities] = useState<AgentPersonality[]>([]);

    const getRobotStateForRuntime = useCallback((agentId: string) => {
        const robot = robotStates.find(r => r.id === agentId);
        if (!robot) {
            // It's possible for some tools (like Define) to be called before a robot exists.
            // Return a default or empty state instead of throwing an error.
            const defaultRobot: RobotState = { id: agentId, x: 0, y: 0, rotation: 0, hasResource: false };
            return { robot: defaultRobot, environment: environmentState, personalities: agentPersonalities };
        }
        return { robot, environment: environmentState, personalities: agentPersonalities };
    }, [robotStates, environmentState, agentPersonalities]);
    
    const handleManualControl = useCallback(async (toolName: string, args: any = {}, executeActionRef: React.MutableRefObject<(toolCall: AIToolCall, agentId: string) => Promise<EnrichedAIResponse>>) => {
        logEvent(`[CONTROL] Manual command: ${toolName}`);
        
        try {
            // Manual controls from the UI don't have a specific agent ID context, so we use a placeholder.
            // The tool implementation itself will handle state changes.
            const result = await executeActionRef.current({ name: toolName, arguments: args }, 'manual_control');
             if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[CONTROL] ${result.executionResult.message}`);
            
            // Only add movement actions to the observation history for learning
            if (toolName.startsWith('Move') || toolName.startsWith('Turn')) {
                setObservationHistory(prev => [...prev, { name: toolName, arguments: args }]);
            }
        } catch(e) {
            logEvent(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [logEvent]);

    return {
        robotState: {
            robotStates,
            environmentState,
            observationHistory,
            agentPersonalities,
        },
        robotSetters: {
            setRobotStates,
            setEnvironmentState,
            setObservationHistory,
            setAgentPersonalities,
        },
        getRobotStateForRuntime,
        handleManualControl,
    };
};