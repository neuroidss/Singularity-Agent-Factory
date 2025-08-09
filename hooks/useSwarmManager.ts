import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SWARM_AGENT_SYSTEM_PROMPT } from '../constants';
import { contextualizeWithSearch } from '../services/aiService';
import type { AgentWorker, EnrichedAIResponse, AgentStatus, RobotState, LLMTool, AIModel, APIConfig, AIResponse, KnowledgeGraph } from '../types';

type UseSwarmManagerProps = {
    logEvent: (message: string) => void;
    setUserInput: (input: string) => void;
    setEventLog: (callback: (prev: string[]) => string[]) => void;
};

type PauseState = {
    type: 'KICAD_LAYOUT';
    data: KnowledgeGraph;
    isInteractive: boolean;
    projectName: string;
} | null;

export const useSwarmManager = (props: UseSwarmManagerProps) => {
    const { logEvent, setUserInput, setEventLog } = props;

    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const [currentUserTask, setCurrentUserTask] = useState<any>(null);
    const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>(SWARM_AGENT_SYSTEM_PROMPT);
    const [pauseState, setPauseState] = useState<PauseState>(null);
    
    const swarmIterationCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    const agentSwarmRef = useRef(agentSwarm);
    
    // Keep refs synchronized with the state
    useEffect(() => {
        isRunningRef.current = isSwarmRunning;
    }, [isSwarmRunning]);

    useEffect(() => {
        agentSwarmRef.current = agentSwarm;
    }, [agentSwarm]);

    const handleStopSwarm = useCallback((reason?: string) => {
        if (isRunningRef.current) {
            isRunningRef.current = false; // Update ref immediately to stop loops
            setIsSwarmRunning(false); // Schedule state update for UI
            const reasonText = reason ? `: ${reason}` : ' by user.';
            logEvent(`[INFO] 🛑 Task stopped${reasonText}`);
        }
    }, [logEvent]);

    const clearPauseState = useCallback(() => {
        setPauseState(null);
    }, []);
    
    const runSwarmCycle = useCallback(async (
        processRequest: (prompt: any, systemInstruction: string, agentId: string) => Promise<EnrichedAIResponse[] | null>
    ) => {
        if (!isRunningRef.current) {
            return;
        }
        if (swarmIterationCounter.current >= 50) {
            logEvent("[WARN] ⚠️ Task reached max iterations (50).");
            handleStopSwarm("Max iterations reached");
            return;
        }

        // Use the ref here to avoid dependency on state
        const agent = agentSwarmRef.current[0];
        if (!agent || agent.status === 'working') {
            setTimeout(() => { if(isRunningRef.current) runSwarmCycle(processRequest) }, 1000);
            return;
        }

        swarmIterationCounter.current++;

        try {
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
            
            let finalUserRequestText = currentUserTask.userRequest.text;

            // NEW: CONTEXTUALIZATION STEP
            if (currentUserTask.useSearch) {
                logEvent('🔎 Performing web search for additional context...');
                try {
                    const searchPrompt = `Based on the following user request and any provided files, find and summarize the key technical requirements, component datasheets, pinouts, and specifications needed to design a PCB. \n\nUser Request: "${currentUserTask.userRequest.text}"`;
                    
                    const searchResult = await contextualizeWithSearch({
                        text: searchPrompt,
                        files: currentUserTask.userRequest.files,
                    });
                    
                    if (searchResult.summary) {
                        const sourceList = searchResult.sources.map(s => `- ${s.title}: ${s.uri}`).join('\n');
                        const searchContext = `Web Search Results:\nSummary: ${searchResult.summary}\nSources:\n${sourceList}`;
                        
                        finalUserRequestText = `The user's original request was: "${currentUserTask.userRequest.text}"\n\nTo help you, a pre-analysis was performed using web search. Use the following information to guide your decisions:\n\n---\n${searchContext}\n---`;
                        
                        logEvent('✨ Search complete. Context appended to agent prompt.');
                        if (searchResult.sources.length > 0) {
                            logEvent(`📚 Sources Found:\n${sourceList}`);
                        }
                    }
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[WARN] ⚠️ Web search step failed: ${errorMessage}. Proceeding without search context.`);
                }
            }

            const historyString = swarmHistoryRef.current.length > 0
                ? `The following actions have already been performed:\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message || r.executionResult?.stdout)})`}`).join('\n')}`
                : "No actions have been performed yet.";
            
            const promptForAgent = `The overall goal is: "${finalUserRequestText}".\n\n${historyString}\n\nBased on this, what is the single next logical action or set of actions to perform? If the goal is complete, you MUST call the "Task Complete" tool.`;
            
            const promptPayload = {
                text: promptForAgent,
                files: currentUserTask.userRequest.files,
            };

            const results = await processRequest(promptPayload, currentSystemPrompt, agent.id);

            console.log('[DEBUG_GRAPH] Swarm cycle received results:', JSON.stringify(results, null, 2));

            if (!isRunningRef.current) return;

            // Check for the special pause signal from the 'Arrange Components' tool
            const arrangeResult = results?.find(r => r.toolCall?.name === 'Arrange Components' && r.executionResult?.stdout);
            if (arrangeResult && arrangeResult.executionResult.stdout) {
                try {
                    const parsedStdout = JSON.parse(arrangeResult.executionResult.stdout);
                    if (parsedStdout.layout_data) {
                        console.log('[DEBUG_GRAPH] Found layout_data in swarm cycle. Pausing swarm with data:', JSON.stringify(parsedStdout.layout_data, null, 2));
                        
                        setPauseState({
                            type: 'KICAD_LAYOUT',
                            data: parsedStdout.layout_data,
                            isInteractive: arrangeResult.toolCall.arguments.waitForUserInput,
                            projectName: arrangeResult.toolCall.arguments.projectName,
                        });
                        
                        handleStopSwarm('Pausing for layout.');
                        
                        // IMPORTANT: Exit the cycle immediately after pausing.
                        return; 
                    }
                } catch (e) { /* stdout was not JSON with layout_data, continue normally */ }
            }


            if (results && results.length > 0) {
                swarmHistoryRef.current.push(...results);
                
                const actionSummary = results.length > 1
                    ? `Called ${results.length} tools in parallel: ${results.map(r => `'${r.toolCall?.name}'`).join(', ')}`
                    : `Called tool '${results[0].toolCall?.name}'`;

                const hasError = results.some(r => r.executionError);

                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? {
                     ...a, 
                     status: hasError ? 'failed' : 'succeeded',
                     lastAction: actionSummary, 
                     result: results.map(r => r.executionResult),
                     error: hasError ? results.find(r => r.executionError)?.executionError : null,
                } : a));
                
                const taskCompleteResult = results.find(r => r.toolCall?.name === 'Task Complete');
                if (taskCompleteResult) {
                    logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${taskCompleteResult.executionResult?.message || 'Finished!'}`);
                    handleStopSwarm("Task completed successfully");
                    return;
                }
            } else {
                 setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Agent did not choose any action.' } : a));
            }

            // Schedule next cycle
            setTimeout(() => { if(isRunningRef.current) runSwarmCycle(processRequest) }, 1000);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: errorMessage, lastAction: `CRITICAL FAILURE` } : a));
            // On critical failure, stop the task.
            logEvent(`[ERROR] 🛑 Agent task failed critically: ${errorMessage}`);
            handleStopSwarm("Critical agent error");
        }
    }, [currentUserTask, logEvent, currentSystemPrompt, handleStopSwarm]);

    const startSwarmTask = useCallback(async ({ task, systemPrompt }: { task: any, systemPrompt: string | null }) => {
        swarmHistoryRef.current = [];
        swarmIterationCounter.current = 0;
        
        const timestamp = new Date().toLocaleTimeString();
        setEventLog(() => [`[${timestamp}] [INFO] 🚀 Starting task...`]);

        // Normalize the task payload to ensure a consistent structure
        let finalTask = task;
        if (typeof task === 'string') {
            finalTask = {
                userRequest: { text: task, files: [] },
                useSearch: false,
            };
        }
        
        setCurrentUserTask(finalTask);
        setCurrentSystemPrompt(systemPrompt || SWARM_AGENT_SYSTEM_PROMPT);
        
        const initialAgents: AgentWorker[] = [{
            id: 'agent-1',
            status: 'idle',
            lastAction: 'Awaiting instructions',
            error: null,
            result: null
        }];
        
        setAgentSwarm(initialAgents);
        setUserInput('');
        setIsSwarmRunning(true); // This will trigger the useEffect in App.tsx to start the cycle
    }, [setUserInput, setEventLog]);

    return {
        state: {
            agentSwarm,
            isSwarmRunning,
            currentUserTask,
            pauseState,
        },
        handlers: {
            startSwarmTask,
            handleStopSwarm,
            clearPauseState,
            // Pass the cycle function up to be called with dependencies
            runSwarmCycle,
        },
        getSwarmState: () => ({
            isRunning: isSwarmRunning,
            agents: agentSwarm,
        }),
    };
};