

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CORE_TOOLS, AI_MODELS } from './constants';
import { UIToolRunner } from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { DEMO_WORKFLOW } from './bootstrap/demo_workflow';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView } from './types';
import { useAppStateManager } from './hooks/useAppStateManager';
import { useToolManager } from './hooks/useToolManager';
import { useKicadManager } from './hooks/useKicadManager';
import { useRobotManager } from './hooks/useRobotManager';
import { useSwarmManager } from './hooks/useSwarmManager';
import { useAppRuntime } from './hooks/useAppRuntime';
import { useToolRelevance } from './hooks/useToolRelevance';
import { useKnowledgeGraphManager } from './hooks/useKnowledgeGraphManager';

const App: React.FC = () => {
    // --- STATE MANAGEMENT VIA HOOKS ---

    // Handles general app state like user input, logs, views, and API configs
    const {
        state: appState,
        setters: appSetters,
        logEvent
    } = useAppStateManager();

    // Manages client and server tools, and server connection status
    const toolManager = useToolManager({ logEvent });
    const {
        tools, setTools, allTools, allToolsRef,
        isServerConnected,
        generateMachineReadableId,
        forceRefreshServerTools,
    } = toolManager;
    
    // Hook for determining tool relevance using embeddings
    const { findRelevantTools } = useToolRelevance({ allTools, logEvent });

    // Manages the agent swarm.
    const {
        state: swarmState,
        handlers: swarmHandlers,
    } = useSwarmManager({
        logEvent,
        setUserInput: appSetters.setUserInput,
        setEventLog: appSetters.setEventLog,
        findRelevantTools, // Pass the relevance finder to the swarm
    });

    // Manages the KiCad workflow.
    const {
        state: kicadState,
        setters: kicadSetters,
        handlers: kicadHandlers,
        logKicadEvent,
        currentProjectNameRef,
        getKicadSystemPrompt,
        kicadSimulators,
    } = useKicadManager({
        logEvent,
        startSwarmTask: swarmHandlers.startSwarmTask,
        allTools,
        clearSwarmHistory: swarmHandlers.clearSwarmHistory,
        appendToSwarmHistory: swarmHandlers.appendToSwarmHistory,
    });
    
    // Manages the Robotics simulation.
    const {
        robotState,
        robotSetters,
        getRobotStateForRuntime,
        handleManualControl,
    } = useRobotManager({ logEvent });
    
    // Manages the Strategic Memory Knowledge Graph view
    const {
        state: kgState,
        handlers: kgHandlers,
        graphStateRef,
    } = useKnowledgeGraphManager({ logEvent });

    // The core execution engine. It depends on state from other managers.
    const {
        executeAction,
        executeActionRef,
        processRequest,
    } = useAppRuntime({
        // Dependencies
        allToolsRef, logEvent, generateMachineReadableId,
        apiConfig: appState.apiConfig, selectedModel: appState.selectedModel,
        isServerConnected,
        setTools,
        forceRefreshServerTools,
        // Kicad setters and simulators
        setPcbArtifacts: (artifacts) => kicadSetters.setPcbArtifacts(artifacts),
        kicadLogEvent: logKicadEvent,
        setCurrentKicadArtifact: kicadSetters.setCurrentKicadArtifact,
        updateWorkflowChecklist: kicadHandlers.updateWorkflowChecklist,
        kicadSimulators: kicadSimulators,
        // Robot setters
        getRobotStateForRuntime,
        setRobotStates: robotSetters.setRobotStates,
        setObservationHistory: robotSetters.setObservationHistory,
        setAgentPersonalities: robotSetters.setAgentPersonalities,
        // Knowledge Graph setters
        getKnowledgeGraphState: () => graphStateRef.current,
        setKnowledgeGraphState: kgHandlers.setGraph,
    });

    // --- Centralized Swarm Pause Handler ---
    useEffect(() => {
        if (swarmState.pauseState?.type === 'KICAD_LAYOUT') {
            const { data, isInteractive, projectName } = swarmState.pauseState;

            // Pass the layout data and mode to the KiCad manager
            kicadSetters.setCurrentLayoutData(data);
            kicadSetters.setIsLayoutInteractive(isInteractive);
            
            // Set the project name so the workflow can be resumed correctly
            kicadHandlers.setCurrentProjectName(projectName);
            
            // Switch the main view to KiCad to show the layout tool
            appSetters.setMainView('KICAD');
            
            // Important: Clear the pause state after handling it to prevent re-triggering
            swarmHandlers.clearPauseState();
        }
    }, [swarmState.pauseState, appSetters, kicadSetters, kicadHandlers, swarmHandlers]);


    // --- Automatic Tool Suite Installation ---
    const installerRunRef = useRef({kicad: false, strategy: false});
    useEffect(() => {
        const installSuitesIfNeeded = async () => {
            // Give a moment for state to initialize
            await new Promise(resolve => setTimeout(resolve, 100));

            // Install KiCad Suite
            if (!installerRunRef.current.kicad) {
                const installerExists = allTools.some(t => t.name === 'Install KiCad Engineering Suite');
                const coreKicadToolExists = allTools.some(t => t.name === 'Define KiCad Component');
                if (installerExists && !coreKicadToolExists) {
                    installerRunRef.current.kicad = true;
                    logEvent('[SYSTEM] KiCad tools not found. Attempting automatic installation...');
                    try {
                        const result = await executeActionRef.current({ name: 'Install KiCad Engineering Suite', arguments: {} }, 'system-installer');
                        if (result.executionError) throw new Error(result.executionError);
                        logEvent(`[SUCCESS] KiCad Engineering Suite auto-installed successfully.`);
                    } catch (e) {
                        installerRunRef.current.kicad = false; // Allow retry
                        logEvent(`[ERROR] KiCad tool installation failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
                } else if (coreKicadToolExists) {
                    installerRunRef.current.kicad = true;
                }
            }
            
            // Install Strategic Cognition Suite
            if (!installerRunRef.current.strategy) {
                 const installerExists = allTools.some(t => t.name === 'Install Strategic Cognition Suite');
                const coreStrategyToolExists = allTools.some(t => t.name === 'Read Strategic Memory');
                 if (installerExists && !coreStrategyToolExists) {
                    installerRunRef.current.strategy = true;
                    logEvent('[SYSTEM] Strategic Cognition Suite not found. Attempting auto-installation...');
                    try {
                        const result = await executeActionRef.current({ name: 'Install Strategic Cognition Suite', arguments: {} }, 'system-installer');
                        if (result.executionError) throw new Error(result.executionError);
                        logEvent('[SUCCESS] Strategic Cognition Suite auto-installed successfully.');
                    } catch (e) {
                        installerRunRef.current.strategy = false; // Allow retry
                        logEvent(`[ERROR] Strategic Cognition Suite installation failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
                } else if (coreStrategyToolExists) {
                    installerRunRef.current.strategy = true;
                }
            }
        };

        installSuitesIfNeeded();
    }, [allTools, executeActionRef, logEvent]);
    

    // --- DERIVED STATE & PROPS ---

    // Kick off the swarm cycle when it's running.
    useEffect(() => {
        if (swarmState.isSwarmRunning) {
            swarmHandlers.runSwarmCycle(processRequest, executeActionRef, allTools);
        }
    }, [swarmState.isSwarmRunning, swarmHandlers.runSwarmCycle, processRequest, executeActionRef, allTools]);
    
    // Persist tool state to local storage
    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(appState.apiConfig)); }, [appState.apiConfig]);

    // --- TOP-LEVEL HANDLERS ---
    
    const handleSubmit = useCallback(async () => {
        if (!appState.userInput.trim()) { logEvent("[WARN] Please enter a task."); return; }
        await swarmHandlers.startSwarmTask({
          task: {
              userRequest: { text: appState.userInput, files: [] }, // Assume no files for simple input
              useSearch: true,
          }, 
          systemPrompt: null, // Use default swarm prompt
          allTools: allTools
        });
    }, [appState.userInput, swarmHandlers.startSwarmTask, logEvent, allTools]);

    const handleResetTools = useCallback(async () => {
        if (!window.confirm('This will perform a full factory reset, deleting ALL custom tools and restoring the original toolset. This cannot be undone. Are you absolutely sure?')) {
            return;
        }

        // 1. Stop any running tasks to prevent interference.
        if (swarmState.isSwarmRunning) {
            swarmHandlers.handleStopSwarm('System reset initiated.');
        }
        logEvent('[SYSTEM] Starting full system reset...');

        // 2. Reset server tools first, if connected.
        if (isServerConnected) {
            logEvent('[SYSTEM] Sending reset command to server...');
            try {
                const result = await executeActionRef.current({ name: 'System_Reset_Server_Tools', arguments: {} }, 'system-reset');
                if (result.executionError) throw new Error(result.executionError);
                logEvent(`[SUCCESS] Server tools have been cleared.`);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                logEvent(`[ERROR] Failed to reset server tools: ${errorMsg}. Halting reset.`);
                return;
            }
        }

        // 3. Immediately force a refresh of the server tools state on the client.
        // This is crucial to avoid a race condition with the installer.
        try {
            await toolManager.forceRefreshServerTools();
            logEvent('[SYSTEM] Client state synchronized with empty server.');
        } catch (e) {
            logEvent('[WARN] Could not confirm server tool state after reset. Proceeding with client reset.');
        }

        // 4. Reset client-side state. This change will reliably trigger the installer useEffect.
        localStorage.removeItem('singularity-agent-factory-state');
        const { initializeTools } = await import('./hooks/useToolManager'); // Re-import to get fresh state
        setTools(initializeTools());
        appSetters.setApiCallCount(0);
        installerRunRef.current = { kicad: false, strategy: false };
        logEvent('[SUCCESS] Full system reset complete. Reinstalling default tool suites...');
    
    }, [logEvent, setTools, appSetters, isServerConnected, executeActionRef, toolManager, swarmState.isSwarmRunning, swarmHandlers]);

    const getTool = (name: string): LLMTool => {
        const tool = allToolsRef.current.find(t => t.name === name);
        if (tool) return tool;
        return { 
          id: 'fallback', name: 'Not Found', description: `A fallback UI tool for '${name}' which was not found.`,
          category: 'UI Component', version: 1, parameters: [], implementationCode: `return <div>UI Tool '${name}' not found.</div>` 
        };
    };

    const handleCommitLayoutAndContinue = useCallback(async (finalPositions: any) => {
        logKicadEvent("💾 Committing updated layout...");
        
        const projectName = currentProjectNameRef.current;
        if (!projectName || !executeActionRef?.current) {
             logKicadEvent("❌ Error: Could not determine project name or execution context to continue workflow.");
             return;
        }
        
        kicadSetters.setCurrentLayoutData(null); // Clear the layout data to switch UI back to logs
        
        try {
            const layoutUpdateResult = await executeActionRef.current({
                name: 'Update KiCad Component Positions',
                arguments: { projectName: projectName, componentPositionsJSON: JSON.stringify(finalPositions) }
            }, 'kicad-agent-layout');

            if (layoutUpdateResult.executionError) {
                throw new Error(layoutUpdateResult.executionError);
            }
            
            // Add the result to history so the logs are consistent
            swarmHandlers.appendToSwarmHistory(layoutUpdateResult);

            logKicadEvent(`✔️ ${layoutUpdateResult.executionResult?.message || "Layout positions updated."}`);
            
            // --- NEW LOGIC: Check if we are resuming a demo or an LLM task ---
            if (kicadState.isDemoRunning) {
                logKicadEvent('[SIM] ▶️ Resuming automated workflow...');
                
                const arrangeStepIndex = DEMO_WORKFLOW.findIndex(step => step.name === 'Arrange Components');
                if (arrangeStepIndex === -1) {
                    throw new Error("Could not find 'Arrange Components' step in demo workflow to resume from.");
                }
                
                const remainingWorkflow = DEMO_WORKFLOW.slice(arrangeStepIndex + 1);

                // Inject the current project name into the remaining workflow steps
                const remainingWorkflowWithProject = remainingWorkflow.map(step => ({
                    ...step,
                    arguments: { ...step.arguments, projectName }
                }));
                
                // We need to run the rest of the workflow.
                await kicadHandlers.runDemoWorkflow(remainingWorkflowWithProject, executeActionRef.current);
                
            } else {
                // Original logic for resuming an LLM-driven task
                const resumeTask = {
                    userRequest: swarmState.currentUserTask.userRequest,
                    useSearch: swarmState.currentUserTask.useSearch,
                    projectName: projectName,
                };
                
                await swarmHandlers.startSwarmTask({
                    task: resumeTask,
                    systemPrompt: getKicadSystemPrompt(projectName),
                    sequential: true,
                    resume: true, 
                    historyEventToInject: layoutUpdateResult,
                    allTools: allTools,
                });
            }
            
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED while updating positions: ${errorMessage}`);
        }
    }, [logKicadEvent, executeActionRef, swarmHandlers, kicadSetters, currentProjectNameRef, getKicadSystemPrompt, swarmState.currentUserTask, allTools, kicadState.isDemoRunning, kicadHandlers]);
    
    const handleStartDemo = useCallback(() => {
        if (executeActionRef.current) {
            kicadHandlers.handleStartDemo(DEMO_WORKFLOW, executeActionRef.current);
        } else {
            logEvent("[ERROR] Cannot start demo: execution context not ready.");
        }
    }, [kicadHandlers, executeActionRef, logEvent]);

    const handleResetDemo = useCallback(() => {
        kicadHandlers.handleResetDemo();
    }, [kicadHandlers]);


    // --- PROPS FOR UI TOOLS ---

    const configProps = {
        apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig,
        availableModels: AI_MODELS, selectedModel: appState.selectedModel,
        setSelectedModel: appSetters.setSelectedModel
    };
    const debugLogProps = { logs: appState.eventLog, onReset: handleResetTools, apiCallCount: appState.apiCallCount, apiCallLimit: -1 };
    const localAiServerProps = { logEvent };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    const kicadPanelProps = { 
        onStartTask: kicadHandlers.handleStartKicadTask, 
        onStartDemo: handleStartDemo,
        onResetDemo: handleResetDemo,
        kicadLog: kicadState.kicadLog, 
        isGenerating: swarmState.isSwarmRunning || kicadState.isDemoRunning || !!kicadState.currentLayoutData,
        currentArtifact: kicadState.currentKicadArtifact, 
        workflowSteps: kicadState.workflowSteps,
        demoWorkflow: DEMO_WORKFLOW,
        // New props for integrated layout view
        currentLayoutData: kicadState.currentLayoutData,
        isLayoutInteractive: kicadState.isLayoutInteractive,
        onCommitLayout: handleCommitLayoutAndContinue,
        getTool: getTool,
    };
    const agentControlProps = {
        robotState,
        personalities: robotState.agentPersonalities,
        handleManualControl: (tool: string, args?: any) => handleManualControl(tool, args, executeActionRef),
    };
    const relevanceConfigProps = {
        topK: swarmState.relevanceTopK,
        setTopK: swarmHandlers.setRelevanceTopK,
        threshold: swarmState.relevanceThreshold,
        setThreshold: swarmHandlers.setRelevanceThreshold,
        isSwarmRunning: swarmState.isSwarmRunning,
    };
    const activeToolsProps = {
        activeTools: swarmState.activeToolsForTask,
    };
    
    const renderMainView = () => {
        // --- Highest Priority: PCB result viewer ---
        if (kicadState.pcbArtifacts) {
            return <UIToolRunner tool={getTool('KiCad PCB Viewer')} props={pcbViewerProps} />;
        }

        switch(appState.mainView) {
            case 'ROBOTICS': {
                const robotGraph = {
                    nodes: [
                        ...robotState.robotStates.map(r => ({ id: r.id, label: r.id, type: 'robot', width: 10, height: 10, x: r.x, y: r.y, rotation: r.rotation })),
                        ...robotState.environmentState.map((e, i) => ({ id: e.id || `env_${e.type}_${i}`, label: e.type, type: e.type, width: 10, height: 10, x: e.x, y: e.y, rotation: 0 }))
                    ],
                    edges: [],
                    board_outline: { x: -60, y: -60, width: 120, height: 120, shape: 'rectangle' }
                };
                const layoutProps = {
                    graph: robotGraph,
                    layoutStrategy: 'physics',
                    mode: 'robotics',
                    isLayoutInteractive: false,
                    onCommit: () => {},
                };
                 return <UIToolRunner tool={getTool('Interactive PCB Layout Tool')} props={layoutProps} />;
            }
            case 'KNOWLEDGE_GRAPH': {
                const kgViewerProps = {
                    graph: kgState.graph,
                    isLoading: kgState.isLoading,
                    onRefresh: kgHandlers.fetchGraph,
                };
                return <UIToolRunner tool={getTool('Strategic Memory Graph Viewer')} props={kgViewerProps} />;
            }
            case 'KICAD':
            default: {
                // The KiCad Panel now handles its own internal state, including showing the layout tool.
                // This simplifies the top-level logic and keeps the progress view persistent.
                return <UIToolRunner tool={getTool('KiCad Design Automation Panel')} props={kicadPanelProps} />;
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />

            {swarmState.lastSwarmRunHistory ? (
                <main className="flex-grow mt-4">
                    <div className="h-full max-h-[calc(100vh-200px)]">
                        <UIToolRunner
                            tool={getTool('Workflow Capture Panel')}
                            props={{
                                history: swarmState.lastSwarmRunHistory,
                                onClose: swarmHandlers.clearLastSwarmRunHistory
                            }}
                        />
                    </div>
                </main>
            ) : (
                <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        <UIToolRunner tool={getTool('Main View Selector')} props={{ mainView: appState.mainView, setMainView: appSetters.setMainView, isPcbResultVisible: !!kicadState.pcbArtifacts }} />
                        {appState.mainView === 'ROBOTICS' && (
                             <UIToolRunner tool={getTool('Agent Control Panel')} props={agentControlProps} />
                        )}
                        {renderMainView()}
                        <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                        <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                        <UIToolRunner tool={getTool('Tool Relevance Configuration')} props={relevanceConfigProps} />
                        <UIToolRunner tool={getTool('User Input Form')} props={{ userInput: appState.userInput, setUserInput: appSetters.setUserInput, handleSubmit, isSwarmRunning: swarmState.isSwarmRunning }} />
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-3 space-y-6">
                         <UIToolRunner tool={getTool('Agent Status Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                         {swarmState.isSwarmRunning && <UIToolRunner tool={getTool('Active Tool Context')} props={activeToolsProps} />}
                        <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected: isServerConnected }} />
                    </div>
                </main>
            )}
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;
