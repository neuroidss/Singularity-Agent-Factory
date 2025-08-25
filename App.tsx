

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CORE_TOOLS, AI_MODELS } from './constants';
import UIToolRunner from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { EXAMPLE_PROMPTS, WORKFLOW_SCRIPTS } from './bootstrap/demo_presets';
import { clearAllCaches, getAssetBlob, setAssetBlob } from './services/cacheService';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView, AIModel, APIConfig } from './types';
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
    const [visibility, setVisibility] = useState({
        placeholders: true,
        courtyards: true,
        svg: true,
        glb: true,
        nets: true,
    });


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
    
    // Manages the KiCad workflow state (no longer runs demos).
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
        allTools,
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
        updateLayout: kicadSetters.setCurrentLayoutData,
        // Robot setters
        getRobotStateForRuntime,
        setRobotStates: robotSetters.setRobotStates,
        setObservationHistory: robotSetters.setObservationHistory,
        setAgentPersonalities: robotSetters.setAgentPersonalities,
        // Knowledge Graph setters
        getKnowledgeGraphState: () => graphStateRef.current,
        setKnowledgeGraphState: kgHandlers.setGraph,
    });

    // Hook for determining tool relevance using embeddings
    const { findRelevantTools } = useToolRelevance({ allTools, logEvent });

    // Manages the agent swarm, now also handles demo script execution.
    const {
        state: swarmState,
        handlers: swarmHandlers,
    } = useSwarmManager({
        logEvent,
        setUserInput: appSetters.setUserInput,
        setEventLog: appSetters.setEventLog,
        setApiCallCount: appSetters.setApiCallCount,
        findRelevantTools,
        mainView: appState.mainView,
        processRequest,
        executeActionRef,
        allTools,
        selectedModel: appState.selectedModel,
        apiConfig: appState.apiConfig,
    });
    
    // --- Centralized Swarm Pause Handler ---
    useEffect(() => {
        if (swarmState.pauseState?.type === 'KICAD_LAYOUT') {
            const { data, isInteractive, projectName } = swarmState.pauseState;
            // When pausing for layout, the 'data' object from the tool does not contain
            // the heuristics. We must use a functional update to merge the new layout data
            // (nodes, edges) while preserving the existing heuristics from the previous state.
            kicadSetters.setCurrentLayoutData(prevData => ({
                ...(prevData || {}), // Preserve existing state like heuristics
                ...data,             // Overwrite with the new layout-specific data
            }));
            kicadSetters.setIsLayoutInteractive(isInteractive);
            kicadHandlers.setCurrentProjectName(projectName);
            appSetters.setMainView('KICAD');
            swarmHandlers.clearPauseState();
        }
    }, [swarmState.pauseState, appSetters, kicadSetters, kicadHandlers, swarmHandlers]);

    // --- Automatic Tool Suite Installation ---
    const installerRunRef = useRef(false);
    useEffect(() => {
        const installSuitesIfNeeded = async () => {
            if (installerRunRef.current || !executeActionRef.current) return;
            installerRunRef.current = true;
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
            swarmHandlers.runSwarmCycle();
        }
    }, [swarmState.isSwarmRunning, swarmHandlers.runSwarmCycle]);
    
    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(appState.apiConfig)); }, [appState.apiConfig]);

    // --- TOP-LEVEL HANDLERS ---
    
    const handleSubmit = useCallback(async () => {
        if (!appState.userInput.trim()) { logEvent("[WARN] Please enter a task."); return; }
        kicadHandlers.handleStartKicadTask({
            prompt: appState.userInput,
            files: [], // Add file handling later if needed
            urls: [], // Add URL handling later if needed
            useSearch: appState.useSearch
        }, swarmHandlers.startSwarmTask, allTools, getKicadSystemPrompt);
    }, [appState.userInput, appState.useSearch, kicadHandlers, swarmHandlers, logEvent, allTools, getKicadSystemPrompt]);

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
        await clearAllCaches();
        logEvent('[SYSTEM] All browser caches have been cleared.');
        localStorage.removeItem('singularity-agent-factory-state');
        const { initializeTools } = await import('./hooks/useToolManager');
        setTools(initializeTools());
        appSetters.setApiCallCount({});
        installerRunRef.current = false;
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
        kicadSetters.setCurrentLayoutData(null);
        try {
            const layoutUpdateResult = await executeActionRef.current({
                name: 'Update KiCad Component Positions',
                arguments: { projectName: projectName, componentPositionsJSON: JSON.stringify(finalPositions) }
            }, 'kicad-agent-layout');
            if (layoutUpdateResult.executionError) {
                throw new Error(layoutUpdateResult.executionError);
            }
            swarmHandlers.appendToSwarmHistory(layoutUpdateResult);
            logKicadEvent(`✔️ ${layoutUpdateResult.executionResult?.message || "Layout positions updated."}`);
            
            // Unified resume logic
            await swarmHandlers.startSwarmTask({
                task: swarmState.currentUserTask,
                systemPrompt: swarmState.currentSystemPrompt,
                sequential: true,
                resume: true, 
                historyEventToInject: layoutUpdateResult,
                allTools: allTools,
            });
            
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED while updating positions: ${errorMessage}`);
        }
    }, [logKicadEvent, executeActionRef, swarmHandlers, kicadSetters, currentProjectNameRef, swarmState.currentUserTask, swarmState.currentSystemPrompt, allTools]);
    
    const handleStartScript = useCallback((workflow: AIToolCall[], scriptName: string) => {
        if (swarmState.isSwarmRunning) {
            swarmHandlers.handleStopSwarm('New script started.');
        }
        const projectName = `script_project_${Date.now()}`;
        kicadHandlers.setCurrentProjectName(projectName);
        kicadSetters.setKicadLog([`[SIM] Starting new KiCad project: ${projectName}`]);
        kicadHandlers.resetWorkflowSteps();
        kicadSetters.setCurrentLayoutData({ ...kicadHandlers.INITIAL_LAYOUT_DATA });
    
        const augmentedWorkflow = workflow.map(step => ({
            ...step,
            arguments: {
                ...step.arguments,
                projectName,
                ...(step.name === 'Define KiCad Component' && { exportSVG: generateSvg, exportGLB: generateGlb })
            }
        }));
    
        swarmHandlers.startSwarmTask({
            task: {
                userRequest: { text: `Run script: ${scriptName}`, files: [] },
                useSearch: false,
                projectName: projectName,
                script: augmentedWorkflow,
                isScripted: true,
            },
            systemPrompt: getKicadSystemPrompt(projectName),
            sequential: true,
            allTools,
        });
    }, [kicadHandlers, swarmHandlers, generateSvg, generateGlb, getKicadSystemPrompt, allTools]);

    // --- PROPS FOR UI TOOLS ---
    const mainViewSelectorProps = {
        mainView: appState.mainView,
        setMainView: appSetters.setMainView,
    };
    const debugLogProps = {
        logs: appState.eventLog,
        onReset: handleResetTools,
        apiCallCounts: appState.apiCallCount,
        apiCallLimit: 50,
        agentCount: swarmState.agentSwarm.length,
    };
    const configProps = {
        apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig,
        availableModels: AI_MODELS, selectedModel: appState.selectedModel,
        setSelectedModel: appSetters.setSelectedModel
    };
    const localAiServerProps = { logEvent };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    const missionCommandProps = {
        userInput: appState.userInput,
        setUserInput: appSetters.setUserInput,
        handleSubmit,
        isSwarmRunning: swarmState.isSwarmRunning,
        useSearch: appState.useSearch,
        setUseSearch: appSetters.setUseSearch,
        selectedModel: appState.selectedModel,
        examplePrompts: EXAMPLE_PROMPTS,
    };
    const kicadPanelProps = {
        onStartScript: (workflow: AIToolCall[], scriptName: string) => handleStartScript(workflow, scriptName),
        kicadLog: kicadState.kicadLog,
        workflowSteps: kicadState.workflowSteps,
        workflowScripts: WORKFLOW_SCRIPTS,
        isSwarmRunning: swarmState.isSwarmRunning,
        isLayoutPending: !!kicadState.currentLayoutData,
        generateSvg: generateSvg,
        setGenerateSvg: setGenerateSvg,
        generateGlb: generateGlb,
        setGenerateGlb: setGenerateGlb,
        currentLayoutData: kicadState.currentLayoutData,
        layoutHeuristics: kicadState.layoutHeuristics,
        setLayoutHeuristics: kicadSetters.setLayoutHeuristics,
        isLayoutInteractive: kicadState.isLayoutInteractive,
        onCommitLayout: handleCommitLayoutAndContinue,
        onUpdateLayout: kicadHandlers.handleUpdateLayout,
        getTool: getTool,
        isServerConnected: isServerConnected,
        visibility: visibility,
        // New props from swarm manager for script control
        scriptExecutionState: swarmState.scriptExecutionState,
        onPlayPauseScript: swarmHandlers.toggleScriptPause,
        onStopScript: () => swarmHandlers.handleStopSwarm("Script stopped by user."),
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
    const relevanceModeProps = {
        relevanceMode: swarmState.relevanceMode,
        setRelevanceMode: swarmHandlers.setRelevanceMode,
        isSwarmRunning: swarmState.isSwarmRunning,
    };
    const uiComponentPanelProps = {
        activeTools: swarmState.activeToolsForTask,
        getTool: getTool,
    };
    const visibilityPanelProps = {
        visibility: visibility,
        setVisibility: setVisibility,
    };
    const datasheetReaderProps = {
        runtime: executeActionRef.current ? executeActionRef.current.getRuntimeApiForAgent('datasheet-ui') : null
    };
    
    const renderMainView = () => {
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
                            return { id: r.id, label: r.id, type: 'robot', width: 10, height: 10, x: r.x, y: r.y, rotation: r.rotation, asset_glb: personality ? personality.asset_glb : undefined };
                        }),
                        ...robotState.environmentState.map((e, i) => ({ id: e.id || `env_${e.type}_${i}`, label: e.type, type: e.type, width: 10, height: 10, x: e.x, y: e.y, rotation: 0, asset_glb: e.asset_glb }))
                    ],
                    edges: [],
                    board_outline: { x: -60, y: -60, width: 120, height: 120, shape: 'rectangle' }
                };
                const layoutProps = {
                    graph: robotGraph, layoutStrategy: 'physics', mode: 'robotics', isLayoutInteractive: false,
                    onCommit: () => {}, onUpdateLayout: () => {}, getTool: getTool,
                    isServerConnected: isServerConnected, visibility: visibility,
                };
                 return <UIToolRunner tool={getTool('Interactive PCB Layout Tool')} props={layoutProps} />;
            }
            case 'KNOWLEDGE_GRAPH': {
                const kgViewerProps = { graph: kgState.graph, isLoading: kgState.isLoading, onRefresh: kgHandlers.fetchGraph };
                return <UIToolRunner tool={getTool('Strategic Memory Graph Viewer')} props={kgViewerProps} />;
            }
            case 'KICAD': default: {
                return <UIToolRunner tool={getTool('KiCad Design Automation Panel')} props={kicadPanelProps} />;
            }
        }
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col">
            {swarmState.lastSwarmRunHistory ? (
                <main className="flex-grow">
                    <div className="h-full max-h-screen p-4">
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
                <>
                    <header className="flex-shrink-0 p-4 pb-0">
                       <UIToolRunner tool={getTool('Main View Selector')} props={mainViewSelectorProps} />
                    </header>
                    <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0">
                        <div className="lg:col-span-3 space-y-4 flex flex-col min-h-0">
                            <UIToolRunner tool={getTool('Agent Status Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                            <div className="flex-grow" />
                            <UIToolRunner tool={getTool('Mission Command')} props={missionCommandProps} />
                        </div>
                        <div className="lg:col-span-6 flex flex-col h-full min-h-0">
                            {renderMainView()}
                        </div>
                        <div className="lg:col-span-3 space-y-4 flex flex-col overflow-y-auto min-h-0">
                            {appState.mainView === 'KICAD' && <UIToolRunner tool={getTool('Visibility')} props={visibilityPanelProps} />}
                            {appState.mainView === 'ROBOTICS' && <UIToolRunner tool={getTool('Agent Control Panel')} props={agentControlProps} />}
                            <UIToolRunner tool={getTool('AI Model')} props={configProps} />
                            <UIToolRunner tool={getTool('Datasheet Reader')} props={datasheetReaderProps} />
                            <UIToolRunner tool={getTool('Tool Selection Mode')} props={relevanceModeProps} />
                            {swarmState.relevanceMode === 'Embeddings' && <UIToolRunner tool={getTool('Embedding Filter')} props={relevanceConfigProps} />}
                            <UIToolRunner tool={getTool('Local AI Server Panel')} props={localAiServerProps} />
                        </div>
                    </main>
                </>
            )}
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
};

export default App;