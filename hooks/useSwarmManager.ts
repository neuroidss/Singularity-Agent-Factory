
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SWARM_AGENT_SYSTEM_PROMPT } from '../constants';
import { contextualizeWithSearch } from '../services/aiService';
import type { AgentWorker, EnrichedAIResponse, AgentStatus, AIToolCall, KnowledgeGraph, LLMTool, ExecuteActionFunction, ScoredTool } from '../types';

type UseSwarmManagerProps = {
    logEvent: (message: string) => void;
    setUserInput: (input: string) => void;
    setEventLog: (callback: (prev: string[]) => string[]) => void;
    findRelevantTools: (userRequestText: string, allTools: LLMTool[], topK: number, threshold: number, systemPromptForContext: string | null) => Promise<ScoredTool[]>;
};

type PauseState = {
    type: 'KICAD_LAYOUT';
    data: KnowledgeGraph;
    isInteractive: boolean;
    projectName: string;
} | null;

export type StartSwarmTaskOptions = {
    task: any;
    systemPrompt: string | null;
    sequential?: boolean;
    resume?: boolean;
    historyEventToInject?: EnrichedAIResponse | null;
    allTools: LLMTool[];
};

export const useSwarmManager = (props: UseSwarmManagerProps) => {
    const { logEvent, setUserInput, setEventLog, findRelevantTools } = props;

    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const [currentUserTask, setCurrentUserTask] = useState<any>(null);
    const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>(SWARM_AGENT_SYSTEM_PROMPT);
    const [pauseState, setPauseState] = useState<PauseState>(null);
    const [lastSwarmRunHistory, setLastSwarmRunHistory] = useState<EnrichedAIResponse[] | null>(null);
    const [isSequential, setIsSequential] = useState(false);
    const [activeToolsForTask, setActiveToolsForTask] = useState<ScoredTool[]>([]);
    const [relevanceTopK, setRelevanceTopK] = useState<number>(25);
    const [relevanceThreshold, setRelevanceThreshold] = useState<number>(0.1);
    
    const swarmIterationCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    const agentSwarmRef = useRef(agentSwarm);
    const isCycleInProgress = useRef(false);
    
    // Keep refs synchronized with the state
    useEffect(() => {
        isRunningRef.current = isSwarmRunning;
    }, [isSwarmRunning]);

    useEffect(() => {
        agentSwarmRef.current = agentSwarm;
    }, [agentSwarm]);

    const handleStopSwarm = useCallback((reason?: string, isPause: boolean = false) => {
        if (isRunningRef.current) {
            isRunningRef.current = false; // Update ref immediately to stop loops
            setIsSwarmRunning(false); // Schedule state update for UI
            setActiveToolsForTask([]); // Clear the active tools on stop
            const reasonText = reason ? `: ${reason}` : ' by user.';
            logEvent(`[INFO] 🛑 Task ${isPause ? 'paused' : 'stopped'}${reasonText}`);
            
            // Only show the capture panel if it's a final stop, not a pause.
            if (!isPause) {
                setLastSwarmRunHistory(swarmHistoryRef.current);
            }
        }
    }, [logEvent]);

    const clearPauseState = useCallback(() => {
        setPauseState(null);
    }, []);

    const clearLastSwarmRunHistory = useCallback(() => setLastSwarmRunHistory(null), []);
    
    const clearSwarmHistory = useCallback(() => {
        swarmHistoryRef.current = [];
    }, []);

    const appendToSwarmHistory = useCallback((item: EnrichedAIResponse) => {
        swarmHistoryRef.current.push(item);
    }, []);

    const runSwarmCycle = useCallback(async (
        processRequest: (prompt: any, systemInstruction: string, agentId: string, relevantTools: LLMTool[]) => Promise<AIToolCall[] | null>,
        executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>,
        allTools: LLMTool[]
    ) => {
        // --- Start of Lock ---
        if (isCycleInProgress.current) {
            return; // A cycle is already in progress.
        }
        if (!isRunningRef.current) {
            return; // The swarm has been stopped.
        }
        isCycleInProgress.current = true;
        // --- End of Lock ---

        try {
            if (swarmIterationCounter.current >= 50) {
                logEvent("[WARN] ⚠️ Task reached max iterations (50).");
                handleStopSwarm("Max iterations reached");
                return;
            }

            const agent = agentSwarmRef.current[0];
            if (!agent) {
                 return; // No agent to run.
            }

            swarmIterationCounter.current++;

            // Inner try/catch for core logic to handle specific operational errors
            try {
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
                
                let finalUserRequestText = currentUserTask.userRequest.text;

                // CONTEXTUALIZATION STEP (only runs on first iteration)
                if (currentUserTask.useSearch && swarmHistoryRef.current.length === 0) {
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
                
                // DYNAMIC TOOL RELEVANCE
                logEvent(`[Relevance] Finding relevant tools for current step...`);
                const relevantScoredTools = await findRelevantTools(
                    finalUserRequestText,
                    allTools,
                    relevanceTopK,
                    relevanceThreshold,
                    currentSystemPrompt
                );
                setActiveToolsForTask(relevantScoredTools);
                const toolsForAgent = relevantScoredTools.map(st => st.tool);

                const promptPayload = { text: promptForAgent, files: currentUserTask.userRequest.files };

                if (!executeActionRef.current) { throw new Error("Execution context is not available."); }
                
                const toolCalls = await processRequest(promptPayload, currentSystemPrompt, agent.id, toolsForAgent);

                if (!isRunningRef.current) return;
                
                if (toolCalls && toolCalls.length > 0) {
                    let executionResults: EnrichedAIResponse[] = [];

                    if (isSequential) {
                        logEvent(`[INFO] Executing ${toolCalls.length} tool calls sequentially...`);
                        for (const toolCall of toolCalls) {
                            if (!isRunningRef.current) break;
                            const result = await executeActionRef.current(toolCall, agent.id);
                            executionResults.push(result);
                            swarmHistoryRef.current.push(result);

                            if (result.toolCall?.name === 'Arrange Components' && result.executionResult?.stdout) {
                                try {
                                    const parsedStdout = JSON.parse(result.executionResult.stdout);
                                    if (parsedStdout.layout_data) {
                                        setPauseState({ type: 'KICAD_LAYOUT', data: parsedStdout.layout_data, isInteractive: parsedStdout.waitForUserInput === true, projectName: result.toolCall.arguments.projectName });
                                        handleStopSwarm('Pausing for layout.', true);
                                        return;
                                    }
                                } catch (e) { /* Not a pause signal, continue */ }
                            }

                            if (result.executionError) {
                                logEvent(`[INFO] 🛑 Halting sequential execution due to error in '${toolCall.name}'.`);
                                break; 
                            }
                        }
                    } else { // Parallel execution
                        const executionPromises = toolCalls.map(toolCall => executeActionRef.current!(toolCall, agent.id));
                        executionResults = await Promise.all(executionPromises);
                        if (!isRunningRef.current) return;
                        swarmHistoryRef.current.push(...executionResults);
                    }

                    if (!isRunningRef.current) return;

                    const actionSummary = executionResults.length > 1
                        ? `Called ${executionResults.length} tools ${isSequential ? 'sequentially' : 'in parallel'}: ${executionResults.map(r => `'${r.toolCall?.name}'`).join(', ')}`
                        : `Called tool '${executionResults[0].toolCall?.name}'`;
                    const hasError = executionResults.some(r => r.executionError);

                    setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: hasError ? 'failed' : 'succeeded', lastAction: actionSummary, result: executionResults.map(r => r.executionResult), error: hasError ? executionResults.find(r => r.executionError)?.executionError : null } : a));
                    
                    const taskCompleteResult = executionResults.find(r => r.toolCall?.name === 'Task Complete' && !r.executionError);
                    if (taskCompleteResult) {
                        logEvent(`[SUCCESS] ✅ Task Completed by Agent ${agent.id}: ${taskCompleteResult.executionResult?.message || 'Finished!'}`);
                        handleStopSwarm("Task completed successfully");
                        return;
                    }

                    if (isSequential && hasError) {
                        handleStopSwarm("Error during sequential task execution.");
                        return;
                    }
                } else {
                     setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: 'Agent did not choose any action.' } : a));
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error.";
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'failed', error: errorMessage, lastAction: `CRITICAL FAILURE` } : a));
                logEvent(`[ERROR] 🛑 Agent task failed critically: ${errorMessage}`);
                handleStopSwarm("Critical agent error");
            }
        } finally {
            if (isRunningRef.current) {
                // Use requestAnimationFrame to schedule the next cycle. This runs as fast as
                // the browser can handle without blocking the UI, instead of a fixed delay.
                requestAnimationFrame(() => runSwarmCycle(processRequest, executeActionRef, allTools));
            }
            isCycleInProgress.current = false; // Release lock
        }
    }, [currentUserTask, logEvent, currentSystemPrompt, handleStopSwarm, isSequential, findRelevantTools, relevanceTopK, relevanceThreshold]);

    const startSwarmTask = useCallback(async (options: StartSwarmTaskOptions) => {
        const { task, systemPrompt, sequential = false, resume = false, historyEventToInject = null } = options;
        if (!resume) {
            setLastSwarmRunHistory(null);
            swarmHistoryRef.current = [];
            swarmIterationCounter.current = 0;
            const timestamp = new Date().toLocaleTimeString();
            setEventLog(() => [`[${timestamp}] [INFO] 🚀 Starting task...`]);
            setActiveToolsForTask([]); // Clear tools at the start
        } else {
            logEvent(`[INFO] ▶️ Resuming task from history...`);
            if (historyEventToInject) {
                swarmHistoryRef.current.push(historyEventToInject);
                logEvent(`[INFO] Injected history event: Tool '${historyEventToInject.toolCall?.name}' completed.`);
            }
        }

        // Normalize the task payload to ensure a consistent structure
        let finalTask = task;
        if (typeof task === 'string') {
            finalTask = {
                userRequest: { text: task, files: [] },
                useSearch: false,
            };
        }
        
        setCurrentUserTask(finalTask);
        const finalSystemPrompt = systemPrompt || SWARM_AGENT_SYSTEM_PROMPT;
        setCurrentSystemPrompt(finalSystemPrompt);
        setIsSequential(sequential);
        
        const initialAgents: AgentWorker[] = [{
            id: 'agent-1',
            status: 'idle',
            lastAction: 'Awaiting instructions',
            error: null,
            result: null
        }];
        
        setAgentSwarm(initialAgents);
        if(!resume) setUserInput('');
        setIsSwarmRunning(true); // This will trigger the useEffect in App.tsx to start the cycle
    }, [setUserInput, setEventLog, logEvent]);

    return {
        state: {
            agentSwarm,
            isSwarmRunning,
            currentUserTask,
            pauseState,
            lastSwarmRunHistory,
            activeToolsForTask,
            relevanceTopK,
            relevanceThreshold,
        },
        handlers: {
            startSwarmTask,
            handleStopSwarm,
            clearPauseState,
            clearLastSwarmRunHistory,
            runSwarmCycle,
            setRelevanceTopK,
            setRelevanceThreshold,
            clearSwarmHistory,
            appendToSwarmHistory,
        },
        getSwarmState: () => ({
            isRunning: isSwarmRunning,
            agents: agentSwarm,
        }),
    };
};
