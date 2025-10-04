// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
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

type ScriptExecutionState = 'idle' | 'running' | 'paused' | 'finished' | 'error';
type StepStatus = { status: 'pending' | 'completed' | 'error'; result?: any; error?: string };

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
    
    // --- Scripted Workflow State ---
    const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');
    const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([]);
    const [currentScriptStepIndex, setCurrentScriptStepIndex] = useState(0);
    
    const swarmIterationCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    const agentSwarmRef = useRef(agentSwarm);
    const isCycleInProgress = useRef(false);
    
    useEffect(() => { isRunningRef.current = isSwarmRunning; }, [isSwarmRunning]);
    useEffect(() => { agentSwarmRef.current = agentSwarm; }, [agentSwarm]);

    const handleStopSwarm = useCallback((reason?: string, isPause: boolean = false) => {
        if (isRunningRef.current) {
            isRunningRef.current = false;
            setIsSwarmRunning(false);
            setScriptExecutionState(prev => (prev === 'running' || prev === 'paused') ? 'idle' : prev);
            setActiveToolsForTask([]);
            const reasonText = reason ? `: ${reason}` : ' by user.';
            logEvent(`[INFO] 🛑 Task ${isPause ? 'paused' : 'stopped'}${reasonText}`);
            if (!isPause && swarmHistoryRef.current.length > 0) {
                setLastSwarmRunHistory(swarmHistoryRef.current);
            }
        }
    }, [logEvent]);

    const clearPauseState = useCallback(() => setPauseState(null), []);
    const clearLastSwarmRunHistory = useCallback(() => setLastSwarmRunHistory(null), []);
    const appendToSwarmHistory = useCallback((item: EnrichedAIResponse) => { swarmHistoryRef.current.push(item); }, []);

    const toggleScriptPause = useCallback(() => {
        setScriptExecutionState(prev => {
            const newState = prev === 'running' ? 'paused' : 'running';
            logEvent(newState === 'paused' ? '[SCRIPT] Paused.' : '[SCRIPT] Resumed.');
            return newState;
        });
    }, [logEvent]);

    const stepForward = useCallback(() => {
        if (scriptExecutionState === 'paused' && isRunningRef.current) {
            queueMicrotask(() => (window as any).__runSwarmCycle(true));
        }
    }, [scriptExecutionState]);
    
    const stepBackward = useCallback(() => {
         if (scriptExecutionState === 'paused' && currentScriptStepIndex > 0) {
            setCurrentScriptStepIndex(prev => prev - 1);
            logEvent(`[SCRIPT] Stepped back to step ${currentScriptStepIndex}.`);
        }
    }, [scriptExecutionState, currentScriptStepIndex, logEvent]);
    
    const runFromStep = useCallback((index: number) => {
        setCurrentScriptStepIndex(index);
        setStepStatuses(prev => prev.map((s, i) => i >= index ? { status: 'pending' } : s));
        setScriptExecutionState('running');
        logEvent(`[SCRIPT] Running from step ${index + 1}...`);
    }, [logEvent]);

    const runSwarmCycle = useCallback(async (isManualStep = false) => {
        if ((isCycleInProgress.current && !isManualStep) || !isRunningRef.current) return;
        isCycleInProgress.current = true;

        try {
            if (currentUserTask?.isScripted) {
                if (scriptExecutionState !== 'running' && !isManualStep) return;

                const script = currentUserTask.script || [];
                if (currentScriptStepIndex >= script.length) {
                    logEvent('[INFO] ✅ Script finished.');
                    setScriptExecutionState('finished');
                    handleStopSwarm('Script completed successfully.');
                    return;
                }

                const agent = agentSwarmRef.current[0];
                const toolCallFromScript = script[currentScriptStepIndex];
                
                // Inject projectName into the arguments for server-side tools
                const toolCall = {
                    ...toolCallFromScript,
                    arguments: {
                        ...toolCallFromScript.arguments,
                        projectName: currentUserTask.projectName,
                    },
                };
                
                logEvent(`[SCRIPT] Step ${currentScriptStepIndex + 1}/${script.length}: Executing '${toolCall.name}'`);
                
                const result = await executeActionRef.current!(toolCall, agent.id, currentUserTask.context);
                swarmHistoryRef.current.push(result);

                setStepStatuses(prev => {
                    const newStatuses = [...prev];
                    newStatuses[currentScriptStepIndex] = result.executionError
                        ? { status: 'error', error: result.executionError }
                        : { status: 'completed', result: result.executionResult };
                    return newStatuses;
                });
                
                setCurrentScriptStepIndex(prev => prev + 1);
                
                if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Script reached 'Task Complete'.`);
                    setScriptExecutionState('finished');
                    handleStopSwarm("Script completed successfully.");
                    return;
                }
                if (result.executionError) {
                    logEvent(`[ERROR] 🛑 Halting script due to error in '${toolCall.name}': ${result.executionError}`);
                    setScriptExecutionState('error');
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
                    setScriptExecutionState('paused'); // Pause on interactive step
                    logEvent('[SCRIPT] Paused for interactive layout.');
                    return;
                }
            } else { // LLM-driven path... (unchanged)
                 if (swarmIterationCounter.current >= 50) { handleStopSwarm("Max iterations reached"); return; }
                const agent = agentSwarmRef.current[0]; if (!agent) return;
                swarmIterationCounter.current++;
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
                
                let finalUserRequestText = currentUserTask.userRequest.text;
                if (currentUserTask.useSearch && swarmHistoryRef.current.length === 0) {
                     logEvent('🔎 Performing web search for additional context...');
                    try {
                        setApiCallCount(prev => ({ ...prev, 'gemini-2.5-flash': (prev['gemini-2.5-flash'] || 0) + 1 }));
                        const searchResult = await contextualizeWithSearch({ text: `Find technical data for this request: "${currentUserTask.userRequest.text}"`, files: currentUserTask.userRequest.files });
                        if (searchResult.summary) {
                            const sourceList = searchResult.sources.map(s => `- ${s.title}: ${s.uri}`).join('\n');
                            finalUserRequestText = `User request: "${currentUserTask.userRequest.text}"\n\nWeb Search Results:\n${searchResult.summary}\nSources:\n${sourceList}`;
                            logEvent(`✨ Search complete. Context appended. Sources:\n${sourceList}`);
                        }
                    } catch (e) { logEvent(`[WARN] ⚠️ Web search failed: ${e instanceof Error ? e.message : String(e)}.`); }
                }
                const historyString = swarmHistoryRef.current.length > 0 ? `Actions performed:\n${swarmHistoryRef.current.map(r => `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED (${JSON.stringify(r.executionResult?.message || r.executionResult?.stdout)})`}`).join('\n')}` : "No actions performed yet.";
                const promptForAgent = `Goal: "${finalUserRequestText}".\n\n${historyString}\n\nNext action? If goal is complete, call "Task Complete".`;
                
                let toolsForAgent: LLMTool[] = [];
                if (relevanceMode === 'All') {
                    toolsForAgent = allTools;
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
                    let executionResults: EnrichedAIResponse[] = [];
                    let hasError = false;

                    if (isSequential) {
                        for (const toolCall of toolCalls) {
                            if (!isRunningRef.current) break;
                            const result = await executeActionRef.current!(toolCall, agent.id, currentUserTask.context);
                            swarmHistoryRef.current.push(result);
                            executionResults.push(result);
                            if (result.executionError) { hasError = true; break; }
                            if (result.toolCall?.name === 'Task Complete') break;
                            if (result.toolCall?.name === 'Arrange Components' && result.executionResult?.layout_data) {
                                setPauseState({ type: 'KICAD_LAYOUT', data: result.executionResult.layout_data, isInteractive: result.executionResult.waitForUserInput, projectName: result.toolCall.arguments.projectName });
                                handleStopSwarm('Pausing for layout.', true);
                                hasError = true;
                                break;
                            }
                        }
                    } else {
                        const results = await Promise.all(toolCalls.map(tc => executeActionRef.current!(tc, agent.id, currentUserTask.context)));
                        executionResults = results;
                        if (!isRunningRef.current) return;
                        swarmHistoryRef.current.push(...executionResults);
                        hasError = executionResults.some(r => r.executionError);
                    }
                    
                    if (!isRunningRef.current) return;
                    const taskComplete = executionResults.find(r => r.toolCall?.name === 'Task Complete' && !r.executionError);
                    if (taskComplete) { handleStopSwarm("Task completed successfully"); return; }
                    if (hasError && !pauseState) { handleStopSwarm("Error during execution."); return; }
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            logEvent(`[ERROR] 🛑 Agent task failed: ${errorMessage}`);
            setScriptExecutionState('error');
            handleStopSwarm("Critical agent error");
        } finally {
            if (isRunningRef.current) {
                if (currentUserTask?.isScripted && isManualStep) {
                    setScriptExecutionState('paused'); // Pause after a manual step
                } else {
                    requestAnimationFrame(() => (window as any).__runSwarmCycle());
                }
            }
            isCycleInProgress.current = false;
        }
    }, [
        currentUserTask, logEvent, scriptExecutionState, currentScriptStepIndex, handleStopSwarm, 
        findRelevantTools, relevanceMode, relevanceTopK, relevanceThreshold, 
        mainView, currentSystemPrompt, isSequential, setApiCallCount, 
        setActiveToolsForTask, processRequest, executeActionRef, allTools,
        selectedModel, apiConfig, pauseState
    ]);
    
    useEffect(() => { (window as any).__runSwarmCycle = runSwarmCycle; }, [runSwarmCycle]);

    const startSwarmTask = useCallback(async (options: StartSwarmTaskOptions) => {
        const { task, systemPrompt, sequential = false, resume = false, historyEventToInject = null } = options;
        
        if (!resume) {
            setLastSwarmRunHistory(null);
            swarmHistoryRef.current = [];
            swarmIterationCounter.current = 0;
            setCurrentScriptStepIndex(0);
            setStepStatuses(task.script ? Array(task.script.length).fill({ status: 'pending' }) : []);
            setEventLog(() => [`[${new Date().toLocaleTimeString()}] [INFO] 🚀 Starting task...`]);
            setActiveToolsForTask([]);
        } else {
            logEvent(`[INFO] ▶️ Resuming task...`);
            if (historyEventToInject) swarmHistoryRef.current.push(historyEventToInject);
        }

        let finalTask = typeof task === 'string' ? { userRequest: { text: task, files: [] } } : task;
        // Attach the current view as context for the task
        finalTask.context = mainView;
        
        if (finalTask.isScripted) { setScriptExecutionState('running'); } else { setScriptExecutionState('idle'); }

        setCurrentUserTask(finalTask);
        setCurrentSystemPrompt(systemPrompt || SWARM_AGENT_SYSTEM_PROMPT);
        setIsSequential(sequential);
        setAgentSwarm([{ id: 'agent-1', status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }]);
        if(!resume) setUserInput('');
        setIsSwarmRunning(true);
    }, [setUserInput, setEventLog, logEvent, mainView]);

    return {
        state: {
            agentSwarm, isSwarmRunning, currentUserTask, currentSystemPrompt, pauseState,
            lastSwarmRunHistory, activeToolsForTask, relevanceTopK, relevanceThreshold,
            relevanceMode, scriptExecutionState, currentScriptStepIndex, stepStatuses,
        },
        handlers: {
            startSwarmTask, handleStopSwarm, clearPauseState, clearLastSwarmRunHistory,
            runSwarmCycle, setRelevanceTopK, setRelevanceThreshold, setRelevanceMode,
            appendToSwarmHistory, toggleScriptPause,
            stepForward, stepBackward, runFromStep,
        },
    };
};
