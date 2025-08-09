import { useState, useCallback } from 'react';
import type { RobotState, EnvironmentObject, AIToolCall, EnrichedAIResponse } from '../types';

const initialEnvironmentState: EnvironmentObject[] = [
    ...Array.from({length: 12}, (_, i) => ({ x: i, y: 0, type: 'wall' as const })),
    ...Array.from({length: 12}, (_, i) => ({ x: i, y: 11, type: 'wall' as const })),
    ...Array.from({length: 10}, (_, i) => ({ x: 0, y: i + 1, type: 'wall' as const })),
    ...Array.from({length: 10}, (_, i) => ({ x: 11, y: i + 1, type: 'wall' as const })),
    { x: 5, y: 1, type: 'tree' }, { x: 5, y: 2, type: 'tree' }, { x: 5, y: 3, type: 'tree' },
    { x: 5, y: 4, type: 'tree' }, { x: 5, y: 5, type: 'tree' }, { x: 5, y: 6, type: 'tree' },
    { x: 9, y: 2, type: 'resource' },
    { x: 2, y: 9, type: 'collection_point' },
];

export const useRobotManager = ({ logEvent }: { logEvent: (message: string) => void }) => {
    const [robotStates, setRobotStates] = useState<RobotState[]>([]);
    const [environmentState, setEnvironmentState] = useState<EnvironmentObject[]>(initialEnvironmentState);
    const [observationHistory, setObservationHistory] = useState<AIToolCall[]>([]);

    const getRobotStateForRuntime = useCallback((agentId: string) => {
        const robot = robotStates.find(r => r.id === agentId);
        if (!robot) {
            throw new Error(`Pathfinder cannot find robot state for agent ${agentId}.`);
        }
        return { robot, environment: environmentState };
    }, [robotStates, environmentState]);
    
    const handleManualControl = useCallback(async (toolName: string, args: any = {}, executeActionRef: React.MutableRefObject<(toolCall: AIToolCall, agentId: string) => Promise<EnrichedAIResponse>>) => {
        logEvent(`[PILOT] Manual command: ${toolName}`);
        const leadAgentId = 'agent-1';
        
        try {
            const result = await executeActionRef.current({ name: toolName, arguments: args }, leadAgentId);
             if(result.executionError) {
                throw new Error(result.executionError);
            }
            logEvent(`[PILOT] ${result.executionResult.message}`);
            setObservationHistory(prev => [...prev, { name: toolName, arguments: args }]);
        } catch(e) {
            logEvent(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [logEvent]);

    return {
        robotState: {
            robotStates,
            environmentState,
            observationHistory,
        },
        robotSetters: {
            setRobotStates,
            setEnvironmentState,
            setObservationHistory,
        },
        getRobotStateForRuntime,
        handleManualControl,
    };
};
