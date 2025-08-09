
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as aiService from './services/aiService';
import { CORE_TOOLS, AI_MODELS } from './constants';
import { UIToolRunner } from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView } from './types';
import { useAppStateManager } from './hooks/useAppStateManager';
import { useToolManager } from './hooks/useToolManager';
import { useRobotManager } from './hooks/useRobotManager';
import { useKicadManager } from './hooks/useKicadManager';
import { useSwarmManager } from './hooks/useSwarmManager';
import { useAppRuntime } from './hooks/useAppRuntime';

export const SERVER_URL = 'http://localhost:3001';

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

    // Manages the agent swarm.
    const {
        state: swarmState,
        handlers: swarmHandlers,
    } = useSwarmManager({
        logEvent,
        setUserInput: appSetters.setUserInput,
        setEventLog: appSetters.setEventLog,
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
    });

    // Manages the KiCad workflow. Depends on the runtime and swarm.
    const {
        state: kicadState,
        setters: kicadSetters,
        handlers: kicadHandlers,
    } = useKicadManager({
        logEvent,
        selectedModel: appState.selectedModel,
        apiConfig: appState.apiConfig,
        executeActionRef,
        fetchServerTools,
        allToolsRef,
        startSwarmTask: swarmHandlers.startSwarmTask, // Connect KiCad manager to the swarm
        setKnowledgeGraph: appSetters.setKnowledgeGraph,
        setMainView: appSetters.setMainView,
    });
    
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
            swarmHandlers.runSwarmCycle(processRequest);
        }
    }, [swarmState.isSwarmRunning, swarmHandlers.runSwarmCycle, processRequest]);


    // Some handlers need access to the fully initialized runtime
    const handleManualControl = (toolName: string, args: any) => originalHandleManualControl(toolName, args, executeActionRef);
    
    // Persist tool state to local storage
    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(appState.apiConfig)); }, [appState.apiConfig]);

    // --- TOP-LEVEL HANDLERS ---
    
    const handleSubmit = useCallback(async () => {
        if (!appState.userInput.trim()) { logEvent("[WARN] Please enter a task."); return; }
        await swarmHandlers.startSwarmTask({
          task: appState.userInput, 
          systemPrompt: null // Use default swarm prompt
        });
    }, [appState.userInput, swarmHandlers.startSwarmTask, logEvent]);

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

    // --- PROPS FOR UI TOOLS ---

    const configProps = {
        apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig,
        availableModels: AI_MODELS, selectedModel: appState.selectedModel,
        setSelectedModel: appSetters.setSelectedModel
    };
    const debugLogProps = { logs: appState.eventLog, onReset: handleResetTools, apiCallCount: appState.apiCallCount, apiCallLimit: -1 };
    const localAiServerProps = { isServerConnected, logEvent, onStartServer: () => runServerTool('Start Local AI Server'), onStopServer: () => runServerTool('Stop Local AI Server'), onGetStatus: () => runServerTool('Get Local AI Server Status') };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, serverUrl: SERVER_URL, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    const kicadPanelProps = { onStartTask: kicadHandlers.handleStartKicadTask, kicadLog: kicadState.kicadLog, isGenerating: swarmState.isSwarmRunning, currentArtifact: kicadState.currentKicadArtifact, serverUrl: SERVER_URL };
    const knowledgeGraphProps = { graph: appState.knowledgeGraph, title: "KiCad Schematic Graph", onCommit: kicadHandlers.handleCommitLayoutAndContinue, serverUrl: SERVER_URL };

    const renderMainView = () => {
        if (kicadState.pcbArtifacts) return <UIToolRunner tool={getTool('KiCad PCB Viewer')} props={pcbViewerProps} />;

        switch(appState.mainView) {
            case 'ROBOTICS': return <UIToolRunner tool={getTool('Robot Simulation Environment')} props={{ robotStates: robotState.robotStates, environmentState: robotState.environmentState }} />;
            case 'KNOWLEDGE_GRAPH': return <UIToolRunner tool={getTool('Interactive Schematic Graph')} props={knowledgeGraphProps} />;
            case 'KICAD':
            default: return <UIToolRunner tool={getTool('KiCad Design Automation Panel')} props={kicadPanelProps} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 sm:p-6 lg:p-8">
            <UIToolRunner tool={getTool('Application Header')} props={{}} />
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <UIToolRunner tool={getTool('Main View Selector')} props={{ mainView: appState.mainView, setMainView: appSetters.setMainView, isPcbResultVisible: !!kicadState.pcbArtifacts }} />
                    {renderMainView()}
                    {appState.mainView === 'ROBOTICS' && <UIToolRunner tool={getTool('Manual Robot Control')} props={{ handleManualControl, isSwarmRunning: swarmState.isSwarmRunning }} />}
                    <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                    <UIToolRunner tool={getTool('Configuration Panel')} props={configProps} />
                    <UIToolRunner tool={getTool('User Input Form')} props={{ userInput: appState.userInput, setUserInput: appSetters.setUserInput, handleSubmit, isSwarmRunning: swarmState.isSwarmRunning }} />
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-6">
                     <UIToolRunner tool={getTool('Agent Swarm Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                    <UIToolRunner tool={getTool('Tool List Display')} props={{ tools: allTools, isServerConnected }} />
                </div>
            </main>
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;
