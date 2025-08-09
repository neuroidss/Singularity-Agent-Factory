import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SWARM_AGENT_SYSTEM_PROMPT } from '../constants';
import * as aiService from '../services/aiService';
import type { AgentWorker, EnrichedAIResponse, AgentStatus, RobotState, LLMTool, AIModel, APIConfig, AIResponse } from '../types';

type UseSwarmManagerProps = {
    logEvent: (message: string) => void;
    setUserInput: (input: string) => void;
    setEventLog: (callback: (prev: string[]) => string[]) => void;
};

// This hook now also needs access to AI service dependencies to process requests
type SwarmDependencies = {
    allToolsRef: React.MutableRefObject<LLMTool[]>;
    selectedModel: AIModel;
    apiConfig: APIConfig;
    executeActionRef: React.MutableRefObject<(toolCall: any, agentId: string) => Promise<EnrichedAIResponse>>;
};

export const useSwarmManager = (props: UseSwarmManagerProps) => {
    const { logEvent, setUserInput, setEventLog } = props;

    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const [currentUserTask, setCurrentUserTask] = useState<string>('');
    const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>(SWARM_AGENT_SYSTEM_PROMPT);
    
    const swarmIterationCounter = useRef(0);
    const swarmAgentIdCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    isRunningRef.current = isSwarmRunning;
    const agentSwarmRef = useRef(agentSwarm);
    agentSwarmRef.current = agentSwarm;

    const handleStopSwarm = useCallback(() => {
        setIsSwarmRunning(false);
        logEvent("[INFO] 🛑 Swarm task stopped by user.");
    }, [logEvent]);
    
    const runSwarmCycle = useCallback(async (
        processRequest: (prompt: string, systemInstruction: string, agentId: string) => Promise<EnrichedAIResponse[] | null>
    ) => {
        if (!isRunningRef.current) {
            logEvent("[SUCCESS] Swarm task concluded.");
            return;
        }
        if (swarmIterationCounter.current >= 50) {
            logEvent("[WARN] ⚠️ Swarm reached max iterations.");
            setIsSwarmRunning(false);
            return;
        }

        const currentAgentSwarm = agentSwarmRef.current;
        const agentIndex = currentAgentSwarm.findIndex(a => ['idle', 'succeeded', 'failed'].includes(a.status));
        if (agentIndex === -1) {
            setTimeout(() => { if(isRunningRef.current) runSwarmCycle(processRequest) }, 2000);
            return;
        }
        const agent = currentAgentSwarm[agentIndex];
        swarmIterationCounter.current++;

        try {
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
            const historyString = swarmHistoryRef.current.length > 0
                ? `The swarm has already performed these actions:\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message || r.executionResult?.stdout)})`}`).join('\n')}`
                : "The swarm has not performed any actions yet.";
            const promptForAgent = `The swarm's overall goal is: "${currentUserTask}".\n\n${historyString}\n\nBased on this, what is the single next action? If the goal is complete, call "Task Complete".`;
            
            const results = await processRequest(promptForAgent, currentSystemPrompt, agent.id);

            if (!isRunningRef.current) return;

            if (results && results.length > 0) {
                swarmHistoryRef.current.push(...results);
                
                const actionSummary = results.length > 1
                    ? `Called ${results.length} tools: ${results.map(r => `'${r.toolCall?.name}'`).join(', ')}`
                    : `Called '${results[0].toolCall?.name}'`;

                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'succeeded', lastAction: actionSummary, result: results.map(r => r.executionResult) } : a));
                
                const taskCompleteResult = results.find(r => r.toolCall?.name === 'Task Complete');
                if (taskCompleteResult) {
                    logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${taskCompleteResult.executionResult?.message || 'Finished!'}`);
                    setIsSwarmRunning(false);
                    return;
                }
            } else {
                 setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Did not choose any action.' } : a));
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
             setAgentSwarm(prev => {
                const failedSwarm = prev.map(a => a.id === agent.id ? { ...a, status: 'terminated' as AgentStatus, error: errorMessage, lastAction: `FAILED: ${a.lastAction}` } : a);
                swarmAgentIdCounter.current++;
                return [...failedSwarm, { id: `agent-${swarmAgentIdCounter.current}`, status: 'idle', lastAction: 'Newly spawned', error: null, result: null }];
            });
        }
        setTimeout(() => { if(isRunningRef.current) runSwarmCycle(processRequest) }, 1000);
    }, [currentUserTask, logEvent, currentSystemPrompt]);

    const startSwarmTask = useCallback(async ({ task, systemPrompt }: { task: string, systemPrompt: string | null }) => {
        setIsSwarmRunning(true);
        setCurrentUserTask(task);
        setCurrentSystemPrompt(systemPrompt || SWARM_AGENT_SYSTEM_PROMPT);
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        swarmAgentIdCounter.current = 3;
        setUserInput('');
        
        const timestamp = new Date().toLocaleTimeString();
        setEventLog(() => [`[${timestamp}] [INFO] 🚀 Starting swarm task: "${task}"`]);
        const initialAgents: AgentWorker[] = Array.from({ length: 3 }, (_, i) => ({ id: `agent-${i + 1}`, status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }));
        setAgentSwarm(initialAgents);
    }, [setUserInput, setEventLog]);

    return {
        state: {
            agentSwarm,
            isSwarmRunning,
            currentUserTask,
        },
        handlers: {
            startSwarmTask,
            handleStopSwarm,
            // Pass the cycle function up to be called with dependencies
            runSwarmCycle,
        },
        getSwarmState: () => ({
            isRunning: isSwarmRunning,
            agents: agentSwarm,
        }),
    };
};