





import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CORE_TOOLS, AI_MODELS } from './constants';
import { UIToolRunner } from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { DEMO_WORKFLOW } from './bootstrap/demo_workflow';
import { clearAllCaches, getAssetBlob, setAssetBlob } from './services/cacheService';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView } from './types';
import { useAppStateManager } from './hooks/useAppStateManager';
import { useToolManager } from './hooks/useToolManager';
import { useKicadManager } from './hooks/useKicadManager';
import { useRobotManager } from './hooks/useRobotManager';
import { useSwarmManager } from './hooks/useSwarmManager';
import { useAppRuntime } from './hooks/useAppRuntime';
import { useToolRelevance } from './hooks/useToolRelevance';
import { useKnowledgeGraphManager } from './hooks/useKnowledgeGraphManager';

// Expose cache functions globally for UI tools compiled from strings.
// This is done at the module level to prevent race conditions where a UI tool
// might render before the App component's useEffect hook runs.
(window as any).cacheService = { getAssetBlob, setAssetBlob, clearAllCaches };

const APP_VERSION = "v1.1.0";

const App: React.FC = () => {
    // --- STATE MANAGEMENT VIA HOOKS ---
    const [generateSvg, setGenerateSvg] = useState(true);
    const [generateGlb, setGenerateGlb] = useState(true);

    // Handles general app state like user input, logs, views, and API configs
    const {
        state: appState,
        setters: appSetters,
        logEvent
    } = useAppStateManager();
    
    useEffect(() => {
        logEvent(`[SYSTEM] Singularity Agent Factory ${APP_VERSION} initialized.`);
        logEvent('[SYSTEM] Asset cache service initialized and available globally.');
    }, [logEvent]);

    // Manages client and server tools, and server connection status
    const {
        tools, setTools, allTools, allToolsRef,
        isServerConnected,
        generateMachineReadableId,
        forceRefreshServerTools,
    } = useToolManager({ logEvent });
    
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
        setApiCallCount: appSetters.setApiCallCount,
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
        executeActionRef,
        processRequest,
    } = useAppRuntime({
        // Dependencies
        allToolsRef, logEvent, generateMachineReadableId,
        apiConfig: appState.apiConfig, selectedModel: appState.selectedModel,
        setApiCallCount: appSetters.setApiCallCount,
        isServerConnected,
        setTools,
        forceRefreshServerTools,
        // Kicad setters and simulators
        setPcbArtifacts: (artifacts) => kicadSetters.setPcbArtifacts(artifacts),
        kicadLogEvent: logKicadEvent,
        setCurrentKicadArtifact: kicadSetters.setCurrentKicadArtifact,
        updateWorkflowChecklist: kicadHandlers.updateWorkflowChecklist,
        kicadSimulators: kicadSimulators,
        setLayoutHeuristics: kicadSetters.setLayoutHeuristics,
        addLayoutRule: kicadHandlers.addLayoutRule,
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
    const installerRunRef = useRef(false);
    useEffect(() => {
        const installSuitesIfNeeded = async () => {
            if (installerRunRef.current || !executeActionRef.current) return;
            installerRunRef.current = true; // Attempt install only once per session
            
            await new Promise(resolve => setTimeout(resolve, 100));

            const installers = [
                { name: 'Install KiCad Engineering Suite', coreTool: 'Define KiCad Component' },
                { name: 'Install Strategic Cognition Suite', coreTool: 'Read Strategic Memory' }
            ];

            for (const installer of installers) {
                const installerExists = allTools.some(t => t.name === installer.name);
                const coreToolExists = allTools.some(t => t.name === installer.coreTool);
                
                if (installerExists && !coreToolExists) {
                    logEvent(`[SYSTEM] Core tool '${installer.coreTool}' not found. Running installer '${installer.name}'...`);
                    try {
                        const result = await executeActionRef.current({ name: installer.name, arguments: {} }, 'system-installer');
                        if (result.executionError) throw new Error(result.executionError);
                        logEvent(`[SUCCESS] ${installer.name} ran successfully.`);
                    } catch (e) {
                        logEvent(`[ERROR] ${installer.name} failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
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
        if (!window.confirm('This will perform a full factory reset, deleting ALL custom tools, clearing all caches, and restoring the original toolset. This cannot be undone. Are you absolutely sure?')) {
            return;
        }

        if (swarmState.isSwarmRunning) {
            swarmHandlers.handleStopSwarm('System reset initiated.');
        }
        logEvent('[SYSTEM] Starting full system reset...');

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

        try {
            await forceRefreshServerTools();
            logEvent('[SYSTEM] Client state synchronized with empty server.');
        } catch (e) {
            logEvent('[WARN] Could not confirm server tool state after reset. Proceeding with client reset.');
        }

        // Clear IndexedDB caches
        await clearAllCaches();
        logEvent('[SYSTEM] All browser caches have been cleared.');

        localStorage.removeItem('singularity-agent-factory-state');
        const { initializeTools } = await import('./hooks/useToolManager');
        setTools(initializeTools());
        appSetters.setApiCallCount({});
        installerRunRef.current = false; // Allow installer to run again after reset
        logEvent('[SUCCESS] Full system reset complete. Reinstalling default tool suites...');
    
    }, [logEvent, setTools, appSetters, isServerConnected, executeActionRef, forceRefreshServerTools, swarmState.isSwarmRunning, swarmHandlers]);

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
            
            // Check if we are resuming a demo or an LLM task
            if (kicadState.executionState !== 'idle') {
                logKicadEvent('[SIM] ▶️ Resuming automated workflow...');
                kicadHandlers.handlePlayPause(executeActionRef.current);
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
    }, [logKicadEvent, executeActionRef, swarmHandlers, kicadSetters, currentProjectNameRef, getKicadSystemPrompt, swarmState.currentUserTask, allTools, kicadState.executionState, kicadHandlers]);
    
    const handleStartDemo = useCallback(() => {
        if (executeActionRef.current) {
            kicadHandlers.handleStartDemo(executeActionRef.current, { generateSvg, generateGlb });
        } else {
            logEvent("[ERROR] Cannot start demo: execution context not ready.");
        }
    }, [kicadHandlers, executeActionRef, logEvent, generateSvg, generateGlb]);

    const handleStopDemo = useCallback(() => {
        kicadHandlers.handleStopDemo();
    }, [kicadHandlers]);


    // --- PROPS FOR UI TOOLS ---

    const configProps = {
        apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig,
        availableModels: AI_MODELS, selectedModel: appState.selectedModel,
        setSelectedModel: appSetters.setSelectedModel
    };
    const debugLogProps = { logs: appState.eventLog, onReset: handleResetTools, apiCallCounts: appState.apiCallCount, apiCallLimit: -1 };
    const localAiServerProps = { logEvent };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    const kicadPanelProps = { 
        onStartTask: kicadHandlers.handleStartKicadTask, 
        onStartDemo: handleStartDemo,
        onStopDemo: handleStopDemo,
        kicadLog: kicadState.kicadLog, 
        isGenerating: swarmState.isSwarmRunning || kicadState.executionState !== 'idle' || !!kicadState.currentLayoutData,
        currentArtifact: kicadState.currentKicadArtifact, 
        workflowSteps: kicadState.workflowSteps,
        demoWorkflow: DEMO_WORKFLOW,
        // Asset Generation Props
        generateSvg: generateSvg,
        setGenerateSvg: setGenerateSvg,
        generateGlb: generateGlb,
        setGenerateGlb: setGenerateGlb,
        // New interactive demo props
        executionState: kicadState.executionState,
        currentStepIndex: kicadState.currentStepIndex,
        demoStepStatuses: kicadState.demoStepStatuses,
        onPlayPause: () => kicadHandlers.handlePlayPause(executeActionRef.current),
        onStepForward: () => kicadHandlers.handleStepForward(executeActionRef.current),
        onStepBackward: kicadHandlers.handleStepBackward,
        onRunFromStep: (index: number) => kicadHandlers.handleRunFromStep(index, executeActionRef.current),
        // Layout view props
        currentLayoutData: kicadState.currentLayoutData,
        layoutHeuristics: kicadState.layoutHeuristics,
        isLayoutInteractive: kicadState.isLayoutInteractive,
        onCommitLayout: handleCommitLayoutAndContinue,
        onUpdateLayout: kicadHandlers.handleUpdateLayout,
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
                const personalityMap = new Map(robotState.agentPersonalities.map(p => [p.id, p]));
                const robotGraph = {
                    nodes: [
                        ...robotState.robotStates.map(r => {
                            const personality = personalityMap.get(r.id);
                            return {
                                id: r.id,
                                label: r.id,
                                type: 'robot',
                                width: 10,
                                height: 10,
                                x: r.x,
                                y: r.y,
                                rotation: r.rotation,
                                asset_glb: personality ? personality.asset_glb : undefined,
                            };
                        }),
                        ...robotState.environmentState.map((e, i) => ({ id: e.id || `env_${e.type}_${i}`, label: e.type, type: e.type, width: 10, height: 10, x: e.x, y: e.y, rotation: 0, asset_glb: e.asset_glb }))
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
                    onUpdateLayout: () => {},
                    getTool: getTool,
                    isServerConnected: isServerConnected,
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
                <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4 h-[calc(100vh-120px)]">
                    {/* Left Sidebar */}
                    <div className="lg:col-span-1 space-y-4 flex flex-col">
                        <UIToolRunner tool={getTool('Main View Selector')} props={{ mainView: appState.mainView, setMainView: appSetters.setMainView, isPcbResultVisible: !!kicadState.pcbArtifacts }} />
                        
                        {appState.mainView === 'ROBOTICS' && (
                             <UIToolRunner tool={getTool('Agent Control Panel')} props={agentControlProps} />
                        )}

                        <UIToolRunner tool={getTool('Agent Status Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                        {swarmState.isSwarmRunning && <UIToolRunner tool={getTool('Active Tool Context')} props={activeToolsProps} />}

                        {/* This spacer will push the input form to the bottom of the column */}
                        <div className="flex-grow" />

                        <UIToolRunner tool={getTool('User Input Form')} props={{ userInput: appState.userInput, setUserInput: appSetters.setUserInput, handleSubmit, isSwarmRunning: swarmState.isSwarmRunning }} />
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3 flex flex-col h-full min-h-0">
                        {renderMainView()}
                    </div>

                    {/* Right Sidebar */}
                    <div className="lg:col-span-1 space-y-4 flex flex-col overflow-y-auto">
                        <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected: isServerConnected }} />
                        
                        <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                        <UIToolRunner tool={getTool('Tool Relevance Configuration')} props={relevanceConfigProps} />
                        <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                    </div>
                </main>
            )}
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;