


import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CORE_TOOLS, AI_MODELS, SERVER_URL } from './constants';
import { UIToolRunner } from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView } from './types';
import { useAppStateManager } from './hooks/useAppStateManager';
import { useToolManager } from './hooks/useToolManager';
import { useRobotManager } from './hooks/useRobotManager';
import { useKicadManager } from './hooks/useKicadManager';
import { useSwarmManager } from './hooks/useSwarmManager';
import { useAppRuntime } from './hooks/useAppRuntime';
import { useToolRelevance } from './hooks/useToolRelevance';

const App: React.FC = () => {
    // --- STATE MANAGEMENT VIA HOOKS ---

    // Handles general app state like user input, logs, views, and API configs
    const {
        state: appState,
        setters: appSetters,
        logEvent
    } = useAppStateManager();

    // Manages client and server tools, and server connection status
    const {
        tools, setTools, allTools, allToolsRef, isServerConnected,
        fetchServerTools, generateMachineReadableId
    } = useToolManager({ logEvent });
    
    // Manages the state of the robotics simulation
    const {
        robotState,
        robotSetters,
        getRobotStateForRuntime,
        handleManualControl: originalHandleManualControl,
    } = useRobotManager({ logEvent });
    
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
    } = useKicadManager({
        logEvent,
        startSwarmTask: swarmHandlers.startSwarmTask,
        allTools,
    });

    // The core execution engine. It depends on state from other managers.
    const {
        executeAction,
        executeActionRef,
        processRequest,
        runServerTool,
    } = useAppRuntime({
        // Dependencies
        allToolsRef, isServerConnected, logEvent, fetchServerTools, generateMachineReadableId,
        apiConfig: appState.apiConfig, selectedModel: appState.selectedModel,
        robotState, robotSetters, getRobotStateForRuntime,
        setTools,
        // Pass state setters for tools that need to update the UI
        setPcbArtifacts: (artifacts) => kicadSetters.setPcbArtifacts(artifacts),
        kicadLogEvent: logKicadEvent,
        setCurrentKicadArtifact: kicadSetters.setCurrentKicadArtifact,
        updateWorkflowChecklist: kicadHandlers.updateWorkflowChecklist,
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
            
            // The view remains KICAD, as the graph is now rendered inside the panel.
            
            // Important: Clear the pause state after handling it to prevent re-triggering
            swarmHandlers.clearPauseState();
        }
    }, [swarmState.pauseState, appSetters, kicadSetters, kicadHandlers, swarmHandlers]);


    // --- Automatic KiCad Tool Installation ---
    const kicadInstallerRun = useRef(false);
    useEffect(() => {
        const installKicadToolsIfNeeded = async () => {
            // Only proceed if server is connected and we haven't successfully run the installer before.
            if (isServerConnected && !kicadInstallerRun.current) {
                // Give a moment for state updates from reset to propagate.
                await new Promise(resolve => setTimeout(resolve, 500));

                const installerExists = allTools.some(t => t.name === 'Install KiCad Engineering Suite');
                const coreKicadToolExists = allTools.some(t => t.name === 'Define KiCad Component');

                if (installerExists && !coreKicadToolExists) {
                    logEvent('[SYSTEM] KiCad server tools not found. Attempting automatic installation...');
                    
                    try {
                        // Set flag BEFORE the async call to prevent race conditions.
                        kicadInstallerRun.current = true; 
                        const result = await executeActionRef.current({ name: 'Install KiCad Engineering Suite', arguments: {} }, 'system-installer');
                        
                        if (result.executionError) {
                            throw new Error(result.executionError);
                        }
                        
                        logEvent('[SUCCESS] KiCad Engineering Suite auto-installed successfully.');
                        // The tool itself calls fetchServerTools, so the UI should update.
                    } catch (e) {
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        logEvent(`[ERROR] Automatic KiCad tool installation failed: ${errorMessage}`);
                        kicadInstallerRun.current = false; // Reset on failure to allow retry.
                    }
                } else if (coreKicadToolExists) {
                    // If tools are already present, mark as "run" to prevent re-checks.
                    kicadInstallerRun.current = true;
                    logEvent('[SYSTEM] KiCad server tools found and ready.');
                }
            } else if (!isServerConnected) {
                // If server disconnects, reset the flag to allow re-installation on the next connection.
                kicadInstallerRun.current = false;
            }
        };

        installKicadToolsIfNeeded();
    }, [isServerConnected, allTools, executeActionRef, logEvent]);
    
    // --- DERIVED STATE & PROPS ---

    // Kick off the swarm cycle when it's running.
    useEffect(() => {
        if (swarmState.isSwarmRunning) {
            swarmHandlers.runSwarmCycle(processRequest, executeActionRef, allTools);
        }
    }, [swarmState.isSwarmRunning, swarmHandlers.runSwarmCycle, processRequest, executeActionRef, allTools]);


    // Some handlers need access to the fully initialized runtime
    const handleManualControl = (toolName: string, args: any) => originalHandleManualControl(toolName, args, executeActionRef);
    
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
        if (window.confirm('This will perform a full factory reset:\\n\\n- Deletes ALL custom tools on the CLIENT.\\n- Deletes ALL custom tools on the SERVER.\\n- Restores the original toolset.\\n\\nThis cannot be undone. Are you absolutely sure?')) {
            localStorage.removeItem('singularity-agent-factory-state');
            const { initializeTools } = await import('./hooks/useToolManager');
            setTools(initializeTools());
            appSetters.setApiCallCount(0);
            logEvent('[INFO] Client-side state and tools have been reset.');

            if (isServerConnected) {
                try {
                    logEvent('[INFO] Sending command to reset server-side tools...');
                    const resetResult = await executeActionRef.current({ name: 'System_Reset_Server_Tools', arguments: {} }, 'system-reset');
                    if (resetResult.executionError) throw new Error(resetResult.executionError);
                    
                    // Reset the installer flag BEFORE fetching the now-empty tool list.
                    // This allows the installation useEffect to trigger correctly.
                    kicadInstallerRun.current = false;
                    
                    await fetchServerTools();
                    logEvent(`[SUCCESS] Server-side tools cleared. Response: ${resetResult.executionResult.message}`);
                    logEvent('[INFO] Reset complete. System will attempt to reinstall server tool suites.');
                } catch(e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logEvent(`[ERROR] A failure occurred during the server reset process: ${errorMessage}`);
                }
            } else {
                 logEvent('[INFO] Server not connected, skipping server tool reset.');
            }
        }
    }, [logEvent, fetchServerTools, isServerConnected, setTools, appSetters.setApiCallCount, executeActionRef]);

    const getTool = (name: string): LLMTool => {
        const tool = allToolsRef.current.find(t => t.name === name);
        if (tool) return tool;
        return { 
          id: 'fallback', name: 'Not Found', description: `A fallback UI tool for '${name}' which was not found.`,
          category: 'UI Component', version: 1, parameters: [], implementationCode: `return <div>UI Tool '${name}' not found.</div>` 
        };
    };

    const handleCommitLayoutAndContinue = useCallback(async (finalPositions: any) => {
        // Handle the testbed case where no swarm task is running
        if (!swarmState.currentUserTask) {
            logEvent("Testbed layout committed. Positions logged to console.");
            console.log("Final Testbed Positions:", finalPositions);
            kicadSetters.setCurrentLayoutData(null); // Return to the main KiCad panel
            return;
        }

        logKicadEvent("💾 Committing updated layout to server...");
        
        const projectName = currentProjectNameRef.current;
        if (!projectName || !executeActionRef?.current) {
             logKicadEvent("❌ Error: Could not determine project name or execution context to continue workflow.");
             return;
        }
        
        kicadSetters.setCurrentLayoutData(null); // Clear the layout data to switch UI back to logs
        
        try {
            // This action is performed "out-of-band" from the main swarm loop.
            // Its result MUST be captured to inform the agent's next decision.
            const layoutUpdateResult = await executeActionRef.current({
                name: 'Update KiCad Component Positions',
                arguments: { projectName: projectName, componentPositionsJSON: JSON.stringify(finalPositions) }
            }, 'kicad-agent-layout');

            if (layoutUpdateResult.executionError) {
                throw new Error(layoutUpdateResult.executionError);
            }

            // Log this action to the KiCad panel.
            logKicadEvent(`✔️ ${layoutUpdateResult.executionResult?.message || "Layout positions updated."}`);
            
            // The original task is still active. We just need to trigger the swarm to run again.
            // The agent will see that the layout step is done and plan the next steps.
            const resumeTask = {
                userRequest: swarmState.currentUserTask.userRequest,
                useSearch: swarmState.currentUserTask.useSearch,
                projectName: projectName,
            };
            
            // The agent is smart enough to continue based on history. We use the same powerful prompt.
            await swarmHandlers.startSwarmTask({
                task: resumeTask,
                systemPrompt: getKicadSystemPrompt(projectName),
                sequential: true,
                resume: true, // Prevent history from being wiped
                historyEventToInject: layoutUpdateResult, // ** CRITICAL: Inject the result into history **
                allTools: allTools,
            });
            
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED while updating positions: ${errorMessage}`);
        }
    }, [logKicadEvent, executeActionRef, swarmHandlers.startSwarmTask, kicadSetters, currentProjectNameRef, getKicadSystemPrompt, swarmState.currentUserTask, allTools, logEvent]);

    // --- PROPS FOR UI TOOLS ---

    const configProps = {
        apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig,
        availableModels: AI_MODELS, selectedModel: appState.selectedModel,
        setSelectedModel: appSetters.setSelectedModel
    };
    const debugLogProps = { logs: appState.eventLog, onReset: handleResetTools, apiCallCount: appState.apiCallCount, apiCallLimit: -1 };
    const localAiServerProps = { isServerConnected, logEvent, onStartServer: () => runServerTool('Start Local AI Server'), onStopServer: () => runServerTool('Stop Local AI Server'), onGetStatus: () => runServerTool('Get Local AI Server Status') };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, serverUrl: SERVER_URL, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    const kicadPanelProps = { 
        onStartTask: kicadHandlers.handleStartKicadTask, 
        kicadLog: kicadState.kicadLog, 
        isGenerating: swarmState.isSwarmRunning || !!kicadState.currentLayoutData, // Keep panel in "generating" state during layout
        currentArtifact: kicadState.currentKicadArtifact, 
        serverUrl: SERVER_URL, 
        workflowSteps: kicadState.workflowSteps,
        currentLayoutData: kicadState.currentLayoutData, // Pass this to let the panel know layout is active
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
        if (kicadState.pcbArtifacts) return <UIToolRunner tool={getTool('KiCad PCB Viewer')} props={pcbViewerProps} />;

        // Prioritize the Rapier layout tool if its data is present (for testbed or workflow)
        if (kicadState.currentLayoutData) {
            const layoutProps = {
                graph: kicadState.currentLayoutData,
                isLayoutInteractive: kicadState.isLayoutInteractive,
                onCommit: handleCommitLayoutAndContinue,
                serverUrl: SERVER_URL,
            };
            return <UIToolRunner tool={getTool('Rapier 3D Physics Layout')} props={layoutProps} />;
        }

        switch(appState.mainView) {
            case 'ROBOTICS': return <UIToolRunner tool={getTool('Robot Simulation Environment')} props={{ robotStates: robotState.robotStates, environmentState: robotState.environmentState }} />;
            case 'KNOWLEDGE_GRAPH':
                 return (
                    <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center h-full">
                        <h3 className="text-lg font-bold text-yellow-300">Feature Deprecated</h3>
                        <p className="text-gray-300 text-center mt-2">The Knowledge Graph view has been removed to focus on core agent functionality.</p>
                    </div>
                );
            case 'KICAD':
            default:
                return <UIToolRunner tool={getTool('KiCad Design Automation Panel')} props={kicadPanelProps} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <UIToolRunner tool={getTool('Main View Selector')} props={{ mainView: appState.mainView, setMainView: appSetters.setMainView, isPcbResultVisible: !!kicadState.pcbArtifacts || !!kicadState.currentLayoutData }} />
                    {renderMainView()}
                    {appState.mainView === 'ROBOTICS' && <UIToolRunner tool={getTool('Manual Robot Control')} props={{ handleManualControl, isSwarmRunning: swarmState.isSwarmRunning }} />}
                    <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                    <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                    <UIToolRunner tool={getTool('Tool Relevance Configuration')} props={relevanceConfigProps} />
                    <UIToolRunner tool={getTool('User Input Form')} props={{ userInput: appState.userInput, setUserInput: appSetters.setUserInput, handleSubmit, isSwarmRunning: swarmState.isSwarmRunning }} />
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-6">
                     <UIToolRunner tool={getTool('Agent Status Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                     {swarmState.isSwarmRunning && <UIToolRunner tool={getTool('Active Tool Context')} props={activeToolsProps} />}
                    <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected }} />
                </div>
            </main>
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;