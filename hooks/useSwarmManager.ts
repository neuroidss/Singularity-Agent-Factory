
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SWARM_AGENT_SYSTEM_PROMPT, CORE_TOOLS } from '../constants';
import { contextualizeWithSearch, filterToolsWithLLM } from '../services/aiService';
import type { AgentWorker, EnrichedAIResponse, AgentStatus, AIToolCall, KnowledgeGraph, LLMTool, ExecuteActionFunction, ScoredTool, MainView, ToolRelevanceMode, AIModel, APIConfig } from '../types';

type UseSwarmManagerProps = {
    logEvent: (message: string) => void;
    setUserInput: (input: string) => void;
    setEventLog: (callback: (prev: string[]) => string[]) => void;
    setApiCallCount: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    findRelevantTools: (userRequestText: string, allTools: LLMTool[], topK: number, threshold: number, systemPromptForContext: string | null, mainView?: MainView | null) => Promise<ScoredTool[]>;
    mainView: MainView;
    // Added props to fix dependency errors
    processRequest: (prompt: { text: string; files: any[] }, systemInstruction: string, agentId: string, relevantTools: LLMTool[]) => Promise<AIToolCall[] | null>;
    executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>;
    allTools: LLMTool[];
    selectedModel: AIModel;
    apiConfig: APIConfig;
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

type ScriptExecutionState = 'idle' | 'running' | 'paused';

export const useSwarmManager = (props: UseSwarmManagerProps) => {
    const { 
        logEvent, setUserInput, setEventLog, setApiCallCount, findRelevantTools, mainView,
        processRequest, executeActionRef, allTools, selectedModel, apiConfig 
    } = props;

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
    const [relevanceMode, setRelevanceMode] = useState<ToolRelevanceMode>('Embeddings');
    const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');
    
    const swarmIterationCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    const agentSwarmRef = useRef(agentSwarm);
    const isCycleInProgress = useRef(false);
    const scriptStepIndexRef = useRef(0);
    
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
            setScriptExecutionState('idle');
            setActiveToolsForTask([]); // Clear the active tools on stop
            const reasonText = reason ? `: ${reason}` : ' by user.';
            logEvent(`[INFO] 🛑 Task ${isPause ? 'paused' : 'stopped'}${reasonText}`);
            
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

    const toggleScriptPause = useCallback(() => {
        setScriptExecutionState(prev => {
            const newState = prev === 'running' ? 'paused' : 'running';
            if (newState === 'running' && isRunningRef.current) {
                // If we're unpausing, immediately trigger a cycle.
                // This feels more responsive than waiting for the next natural animation frame.
                // The isCycleInProgress lock will prevent race conditions.
                queueMicrotask(() => {
                     if (isRunningRef.current) {
                        const cycleFn = (window as any).__runSwarmCycle; // Access the globally stored function
                        if (cycleFn) cycleFn();
                    }
                });
            }
            return newState;
        });
    }, []);

    const runSwarmCycle = useCallback(async () => {
        if (isCycleInProgress.current || !isRunningRef.current) return;
        isCycleInProgress.current = true;

        try {
            if (currentUserTask?.isScripted) {
                // --- SCRIPTED PATH ---
                if (scriptExecutionState !== 'running') {
                    // Script is paused, do nothing until resumed.
                    isCycleInProgress.current = false;
                    return;
                }
                const script = currentUserTask.script || [];
                if (scriptStepIndexRef.current >= script.length) {
                    logEvent('[INFO] ✅ Script finished.');
                    handleStopSwarm('Script completed successfully.');
                    return;
                }
                const agent = agentSwarmRef.current[0];
                const toolCall = script[scriptStepIndexRef.current];
                logEvent(`[SCRIPT] Step ${scriptStepIndexRef.current + 1}/${script.length}: Executing '${toolCall.name}'`);
                
                const result = await executeActionRef.current!(toolCall, agent.id);
                swarmHistoryRef.current.push(result);
                
                scriptStepIndexRef.current++;
                
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Script reached 'Task Complete'.`);
                    handleStopSwarm("Script completed successfully.");
                    return;
                }
                if (result.executionError) {
                    logEvent(`[ERROR] 🛑 Halting script due to error in '${toolCall.name}': ${result.executionError}`);
                    handleStopSwarm("Error during script execution.");
                    return;
                }
                 if (result.toolCall?.name === 'Arrange Components' && result.executionResult?.layout_data) {
                    setPauseState({
                        type: 'KICAD_LAYOUT',
                        data: result.executionResult.layout_data,
                        isInteractive: result.executionResult.waitForUserInput === true,
                        projectName: result.toolCall.arguments.projectName,
                    });
                    handleStopSwarm('Pausing for layout.', true);
                    return;
                }

            } else {
                // --- LLM-DRIVEN PATH ---
                if (swarmIterationCounter.current >= 50) {
                    logEvent("[WARN] ⚠️ Task reached max iterations (50).");
                    handleStopSwarm("Max iterations reached");
                    return;
                }
                const agent = agentSwarmRef.current[0];
                if (!agent) return;
                swarmIterationCounter.current++;
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
                
                let finalUserRequestText = currentUserTask.userRequest.text;
                if (currentUserTask.useSearch && swarmHistoryRef.current.length === 0) {
                     logEvent('🔎 Performing web search for additional context...');
                    try {
                        setApiCallCount(prev => ({ ...prev, 'gemini-2.5-flash': (prev['gemini-2.5-flash'] || 0) + 1 }));
                        const searchPrompt = `Based on the following user request and any provided files, find and summarize the key technical requirements, component datasheets, pinouts, and specifications needed to design a PCB. \n\nUser Request: "${currentUserTask.userRequest.text}"`;
                        const searchResult = await contextualizeWithSearch({ text: searchPrompt, files: currentUserTask.userRequest.files });
                        if (searchResult.summary) {
                            const sourceList = searchResult.sources.map(s => `- ${s.title}: ${s.uri}`).join('\\n');
                            const searchContext = `Web Search Results:\\nSummary: ${searchResult.summary}\\nSources:\\n${sourceList}`;
                            finalUserRequestText = `The user's original request was: "${currentUserTask.userRequest.text}"\\n\\nTo help you, a pre-analysis was performed using web search. Use the following information to guide your decisions:\\n\\n---\\n${searchContext}\\n---`;
                            logEvent('✨ Search complete. Context appended to agent prompt.');
                            if (searchResult.sources.length > 0) logEvent(`📚 Sources Found:\\n${sourceList}`);
                        }
                    } catch (e) {
                        logEvent(`[WARN] ⚠️ Web search step failed: ${e instanceof Error ? e.message : String(e)}. Proceeding without search context.`);
                    }
                }
                const historyString = swarmHistoryRef.current.length > 0 ? `The following actions have been performed:\\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message || r.executionResult?.stdout)})`}`).join('\\n')}` : "No actions have been performed yet.";
                const promptForAgent = `The overall goal is: "${finalUserRequestText}".\\n\\n${historyString}\\n\\nBased on this, what is the single next logical action or set of actions to perform? If the goal is complete, you MUST call the "Task Complete" tool.`;
                
                logEvent(`[Relevance] Using mode: ${relevanceMode}`);
                let toolsForAgent: LLMTool[] = [];
                if (relevanceMode === 'All') {
                    toolsForAgent = allTools;
                    setActiveToolsForTask(allTools.map(t => ({ tool: t, score: 1.0 })));
                } else if (relevanceMode === 'LLM') {
                    // ... (LLM filtering logic remains the same)
                } else {
                    const relevantScoredTools = await findRelevantTools(finalUserRequestText, allTools, relevanceTopK, relevanceThreshold, currentSystemPrompt, mainView);
                    setActiveToolsForTask(relevantScoredTools);
                    toolsForAgent = relevantScoredTools.map(st => st.tool);
                }
                
                const promptPayload = { text: promptForAgent, files: currentUserTask.userRequest.files };
                if (!executeActionRef.current) throw new Error("Execution context is not available.");
                const toolCalls = await processRequest(promptPayload, currentSystemPrompt, agent.id, toolsForAgent);

                if (!isRunningRef.current) return;
                
                if (toolCalls && toolCalls.length > 0) {
                    const executionPromises = toolCalls.map(toolCall => executeActionRef.current!(toolCall, agent.id));
                    const executionResults = await Promise.all(executionPromises);
                    if (!isRunningRef.current) return;
                    swarmHistoryRef.current.push(...executionResults);

                    const hasError = executionResults.some(r => r.executionError);
                    if (executionResults.find(r => r.toolCall?.name === 'Task Complete' && !r.executionError)) {
                        handleStopSwarm("Task completed successfully"); return;
                    }
                    if (isSequential && hasError) {
                        handleStopSwarm("Error during sequential task execution."); return;
                    }
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            logEvent(`[ERROR] 🛑 Agent task failed: ${errorMessage}`);
            handleStopSwarm("Critical agent error");
        } finally {
            if (isRunningRef.current) {
                requestAnimationFrame(() => (window as any).__runSwarmCycle());
            }
            isCycleInProgress.current = false;
        }
    }, [
        currentUserTask, logEvent, scriptExecutionState, handleStopSwarm, 
        findRelevantTools, relevanceMode, relevanceTopK, relevanceThreshold, 
        mainView, currentSystemPrompt, isSequential, setApiCallCount, 
        setActiveToolsForTask, processRequest, executeActionRef, allTools,
        selectedModel, apiConfig
    ]);
    
    // Store the cycle function globally so it can be called from the pause handler
    useEffect(() => {
        (window as any).__runSwarmCycle = runSwarmCycle;
    }, [runSwarmCycle]);


    const startSwarmTask = useCallback(async (options: StartSwarmTaskOptions) => {
        const { task, systemPrompt, sequential = false, resume = false, historyEventToInject = null } = options;
        
        if (!resume) {
            setLastSwarmRunHistory(null);
            swarmHistoryRef.current = [];
            swarmIterationCounter.current = 0;
            scriptStepIndexRef.current = 0;
            const timestamp = new Date().toLocaleTimeString();
            setEventLog(() => [`[${timestamp}] [INFO] 🚀 Starting task...`]);
            setActiveToolsForTask([]);
        } else {
            logEvent(`[INFO] ▶️ Resuming task from history...`);
            if (historyEventToInject) {
                swarmHistoryRef.current.push(historyEventToInject);
                logEvent(`[INFO] Injected history event: Tool '${historyEventToInject.toolCall?.name}' completed.`);
            }
        }

        let finalTask = task;
        if (typeof task === 'string') {
            finalTask = { userRequest: { text: task, files: [] }, useSearch: false };
        }
        
        if (finalTask.isScripted) {
            setScriptExecutionState('running');
        } else {
            setScriptExecutionState('idle');
        }

        setCurrentUserTask(finalTask);
        setCurrentSystemPrompt(systemPrompt || SWARM_AGENT_SYSTEM_PROMPT);
        setIsSequential(sequential);
        
        setAgentSwarm([{ id: 'agent-1', status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }]);
        if(!resume) setUserInput('');
        setIsSwarmRunning(true);
    }, [setUserInput, setEventLog, logEvent]);

    return {
        state: {
            agentSwarm, isSwarmRunning, currentUserTask, currentSystemPrompt, pauseState,
            lastSwarmRunHistory, activeToolsForTask, relevanceTopK, relevanceThreshold,
            relevanceMode, scriptExecutionState,
        },
        handlers: {
            startSwarmTask, handleStopSwarm, clearPauseState, clearLastSwarmRunHistory,
            runSwarmCycle, setRelevanceTopK, setRelevanceThreshold, setRelevanceMode,
            clearSwarmHistory, appendToSwarmHistory, toggleScriptPause,
        },
    };
};
