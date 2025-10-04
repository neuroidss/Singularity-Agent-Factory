// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { CORE_TOOLS, AI_MODELS } from './constants';
import UIToolRunner from './components/UIToolRunner';
import { loadStateFromStorage, saveStateToStorage } from './versioning';
import { EXAMPLE_PROMPTS, WORKFLOW_SCRIPTS } from './bootstrap/demo_presets';
import { clearAllCaches, getAssetBlob, setAssetBlob } from './services/cacheService';
import * as aiService from './services/aiService';

import type { LLMTool, EnrichedAIResponse, AIToolCall, MainView, AIModel, APIConfig, ExecuteActionFunction } from './types';
import { useAppStateManager } from './hooks/useAppStateManager';
import { useToolManager, initializeTools } from './hooks/useToolManager';
import { useKicadManager } from './hooks/useKicadManager';
import { useGameWorldManager } from './hooks/useGameWorldManager';
import { usePlayerManager } from './hooks/usePlayerManager';
import { useSwarmManager } from './hooks/useSwarmManager';
import { useAppRuntime } from './hooks/useAppRuntime';
import { useToolRelevance } from './hooks/useToolRelevance';
import { useKnowledgeGraphManager } from './hooks/useKnowledgeGraphManager';

// Expose cache functions globally for UI tools compiled from strings.
(window as any).cacheService = { getAssetBlob, setAssetBlob, clearAllCaches };

// Add a declaration for the global executeActionRef
declare global {
    interface Window {
        executeActionRef?: React.MutableRefObject<ExecuteActionFunction | null>;
    }
}

const APP_VERSION = "v1.2.0";

const App: React.FC = () => {
    const [visibility, setVisibility] = useState({
        placeholders: true,
        courtyards: true,
        svg: true,
        glb: true,
        nets: true,
    });
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [productionData, setProductionData] = useState(null);
    const [observationHistory, setObservationHistory] = useState<AIToolCall[]>([]);

    const executeActionRef = useRef<ExecuteActionFunction | null>(null);

    // Handles general app state
    const { state: appState, setters: appSetters, logEvent } = useAppStateManager();
    
    useEffect(() => {
        logEvent(`[SYSTEM] Singularity Agent Factory ${APP_VERSION} initialized.`);
        logEvent('[SYSTEM] Asset cache service initialized and available globally.');
    }, [logEvent]);

    // Manages client and server tools
    const { tools, setTools, allTools, allToolsRef, isServerConnected, generateMachineReadableId, forceRefreshServerTools } = useToolManager({ logEvent });
    
    const { state: kicadState, setters: kicadSetters, handlers: kicadHandlers, logKicadEvent, currentProjectNameRef, getKicadSystemPrompt, kicadSimulators } = useKicadManager({ logEvent, allTools });
    
    const playerManager = usePlayerManager({ logEvent });

    const processRequest = useCallback(async (
        prompt: { text: string; files: any[] },
        systemInstruction: string,
        agentId: string,
        relevantTools: LLMTool[],
    ): Promise<AIToolCall[] | null> => {
        logEvent(`[API CALL] Agent ${agentId} is thinking...`);
        appSetters.setApiCallCount(prev => ({ ...prev, [appState.selectedModel.id]: (prev[appState.selectedModel.id] || 0) + 1 }));
        try {
            const aiResponse = await aiService.generateResponse(
                prompt,
                systemInstruction,
                appState.selectedModel,
                appState.apiConfig,
                (progress) => logEvent(`[AI-PROGRESS] ${progress}`),
                relevantTools
            );
            if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
                return aiResponse.toolCalls;
            }
            logEvent(`[WARN] Agent ${agentId} did not choose any tool calls.`);
            return null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logEvent(`[ERROR] Agent ${agentId} failed during AI generation: ${errorMessage.replace(/API key not valid. Please pass a valid API key./, 'Invalid API Key provided.')}`);
            throw error;
        }
    }, [logEvent, appSetters.setApiCallCount, appState.selectedModel, appState.apiConfig]);

    const { gameState, gameSetters, getGameStateForRuntime, handleManualControl: handleGameManualControl, initializeLocalWorld, exitLocalWorld, connectToShard, disconnectFromShard } = useGameWorldManager({ logEvent, executeActionRef, processRequest });

    // FIX: The `useRobotManager` hook is obsolete and was causing a type error. It has been removed.
    // The necessary variables (`robotState`, `robotSetters`, etc.) are now aliased from the `useGameWorldManager` hook,
    // which has superseded the older robotics simulation logic. This aligns the code with the current architecture
    // where 'AETHERIUM_GAME' is the primary robotics environment.
    const robotState = {
        robotStates: gameState.robotStates,
        environmentState: gameState.environmentState,
        agentPersonalities: gameState.agentPersonalities,
        observationHistory: observationHistory
    };
    const robotSetters = gameSetters;
    const handleRobotManualControl = handleGameManualControl;

    const executeTool = useCallback(async (name: string, args: any) => {
        if (!executeActionRef.current) throw new Error("Runtime not available");
        const result = await executeActionRef.current({ name, arguments: args }, 'ui-action', appState.mainView);
        if (result.executionError) throw new Error(result.executionError);
        return result.executionResult;
    }, [appState.mainView]);

    const { state: kgState, handlers: kgHandlers, graphStateRef, innovationGraphViewerProps } = useKnowledgeGraphManager({ logEvent, executeTool });

    useAppRuntime({
        executeActionRef, // Pass the ref to be populated
        allToolsRef, logEvent, generateMachineReadableId,
        isServerConnected,
        setTools,
        forceRefreshServerTools,
        // Kicad
        setPcbArtifacts: (artifacts) => kicadSetters.setPcbArtifacts(artifacts),
        kicadLogEvent: logKicadEvent,
        setCurrentKicadArtifact: kicadSetters.setCurrentKicadArtifact,
        updateWorkflowChecklist: kicadHandlers.updateWorkflowChecklist,
        kicadSimulators: kicadSimulators,
        setLayoutHeuristics: kicadSetters.setLayoutHeuristics,
        updateLayout: kicadSetters.setCurrentLayoutData,
        getKicadProjectState: kicadHandlers.getKicadProjectState,
        // Contextual Setters
        robotSetters: robotSetters,
        gameSetters: gameSetters,
        getGameStateForRuntime: getGameStateForRuntime,
        // Knowledge Graph setters
        getKnowledgeGraphState: () => graphStateRef.current,
        setKnowledgeGraphState: kgHandlers.setGraph,
        // Player Manager
        playerManager: playerManager,
        // AI Config
        setApiCallCount: appSetters.setApiCallCount,
        selectedModel: appState.selectedModel,
        apiConfig: appState.apiConfig,
        generativeServiceConfig: appState.generativeServiceConfig,
        // Observation
        observationHistory,
        setObservationHistory,
    });


    const { findRelevantTools } = useToolRelevance({ allTools, logEvent });

    const { state: swarmState, handlers: swarmHandlers } = useSwarmManager({
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
    
    useEffect(() => {
        if (swarmState.pauseState?.type === 'KICAD_LAYOUT') {
            const { data, isInteractive, projectName } = swarmState.pauseState;
            kicadSetters.setCurrentLayoutData(prevData => ({ ...(prevData || {}), ...data }));
            kicadSetters.setIsLayoutInteractive(isInteractive);
            kicadHandlers.setCurrentProjectName(projectName);
            appSetters.setMainView('KICAD');
            swarmHandlers.clearPauseState();
        }
    }, [swarmState.pauseState, appSetters, kicadSetters, kicadHandlers, swarmHandlers]);

    const installerRunRef = useRef(false);
    useEffect(() => {
        const installSuitesIfNeeded = async () => {
            if (installerRunRef.current || !executeActionRef.current || allTools.length === 0) return;
            installerRunRef.current = true;
            
            const installers = [
                { name: 'Install MCP Suite', canaryTool: 'Start Python Process' },
                { name: 'Install KiCad Engineering Suite', canaryTool: 'Lead Engineer Workbench' },
                { name: 'Install tscircuit Design Suite', canaryTool: 'Browser-Based Design Workbench' },
                { name: 'Install Aetherium Game Suite', canaryTool: 'Player Dashboard' },
                { name: 'Install Strategic Cognition Suite', canaryTool: 'Innovation Knowledge Graph Viewer' },
                { name: 'Install Neuro-Weaving Suite', canaryTool: 'Define Neurofeedback Protocol' },
                { name: 'Install Supply Chain Suite', canaryTool: 'Query Supplier Stock' },
                { name: 'Install Attentive Modeling Suite', canaryTool: 'Attentive Modeling Environment' },
                { name: 'Install Gamepad Simulation Suite', canaryTool: 'Gamepad Controller' },
                { name: 'Install Mixed Reality Suite', canaryTool: 'Mixed Reality Feed' },
                { name: 'Install Field Agent Suite', canaryTool: 'Field Agent Terminal' },
                { name: 'Install Gazebo Simulation Suite', canaryTool: 'Drone Command Cockpit' },
                { name: 'Install Producer Studio Suite', canaryTool: 'Producer Studio Workbench' },
                 { name: 'Install Virtual Film Set Suite', canaryTool: 'Virtual Film Set Workbench' },
                 { name: 'Install Audio Production Suite', canaryTool: 'Generate Dialogue Audio' },
            ];

            for (const installer of installers) {
                const installerExists = allTools.some(t => t.name === installer.name);
                const canaryToolExists = allTools.some(t => t.name === installer.canaryTool);
                
                if (installerExists && !canaryToolExists) {
                    logEvent(`[SYSTEM] Core tool '${installer.canaryTool}' not found. Re-running installer '${installer.name}' to update suite...`);
                    try {
                        const result = await executeActionRef.current({ name: installer.name, arguments: {} }, 'system-installer');
                        if (result.executionError) throw new Error(result.executionError);
                        logEvent(`[SUCCESS] ${installer.name} ran successfully.`);
                    } catch (e) {
                        logEvent(`[ERROR] ${installer.name} failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
            // All installers have run, bootstrapping is complete.
            setIsBootstrapping(false);
            logEvent('[SYSTEM] Bootstrap complete. All tool suites are ready.');
        };
        installSuitesIfNeeded();
    }, [allTools, logEvent]);
    
    useEffect(() => {
        if (swarmState.isSwarmRunning) {
            swarmHandlers.runSwarmCycle();
        }
    }, [swarmState.isSwarmRunning, swarmHandlers]);
    
    useEffect(() => { saveStateToStorage({ tools }); }, [tools]);
    useEffect(() => { localStorage.setItem('apiConfig', JSON.stringify(appState.apiConfig)); }, [appState.apiConfig]);

    const handleResetTools = useCallback(async () => {
        if (!window.confirm('This will perform a full factory reset, deleting ALL custom tools, clearing all caches, and restoring the original toolset. This cannot be undone. Are you absolutely sure?')) return;
        if (swarmState.isSwarmRunning) swarmHandlers.handleStopSwarm('System reset initiated.');
        logEvent('[SYSTEM] Starting full system reset...');
        if (isServerConnected) {
            logEvent('[SYSTEM] Sending reset command to server...');
            try {
                const result = await executeActionRef.current!({ name: 'System_Reset_Server_Tools', arguments: {} }, 'system-reset');
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
        } catch (e) { logEvent('[WARN] Could not confirm server tool state after reset. Proceeding with client reset.'); }
        await clearAllCaches();
        logEvent('[SYSTEM] All browser caches have been cleared.');
        localStorage.removeItem('singularity-agent-factory-state');
        setTools(initializeTools());
        appSetters.setApiCallCount({});
        installerRunRef.current = false;
        setIsBootstrapping(true); // Re-trigger the bootstrap process
        logEvent('[SUCCESS] Full system reset complete. Reinstalling default tool suites...');
    }, [logEvent, setTools, appSetters, isServerConnected, forceRefreshServerTools, swarmState.isSwarmRunning, swarmHandlers]);

    const getTool = (name: string): LLMTool => {
        const tool = allToolsRef.current.find(t => t.name === name);
        if (tool) return tool;
        return { 
          id: 'fallback', name: 'Not Found', description: `A fallback UI tool for '${name}' which was not found.`,
          category: 'UI Component', version: 1, parameters: [], executionEnvironment: 'Client',
          implementationCode: `return <div>UI Tool '${name}' not found.</div>` 
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
                arguments: { projectName, componentPositionsJSON: JSON.stringify(finalPositions), boardPadding: kicadState.layoutHeuristics?.boardPadding || 5.0 }
            }, 'kicad-agent-layout', 'KICAD');
            if (layoutUpdateResult.executionError) throw new Error(layoutUpdateResult.executionError);
            swarmHandlers.appendToSwarmHistory(layoutUpdateResult);
            logKicadEvent(`✔️ ${layoutUpdateResult.executionResult?.message || "Layout positions updated."}`);
            await swarmHandlers.startSwarmTask({ task: swarmState.currentUserTask, systemPrompt: swarmState.currentSystemPrompt, sequential: true, resume: true, historyEventToInject: layoutUpdateResult, allTools });
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED while updating positions: ${errorMessage}`);
        }
    }, [logKicadEvent, swarmHandlers, kicadSetters, currentProjectNameRef, swarmState.currentUserTask, swarmState.currentSystemPrompt, allTools, kicadState.layoutHeuristics]);
    
    const mainViewSelectorProps = { mainView: appState.mainView, setMainView: appSetters.setMainView };
    const debugLogProps = { logs: appState.eventLog, onReset: handleResetTools, apiCallCounts: appState.apiCallCount, apiCallLimit: 50, agentCount: swarmState.agentSwarm.length };
    const configProps = { apiConfig: appState.apiConfig, setApiConfig: appSetters.setApiConfig, availableModels: AI_MODELS, selectedModel: appState.selectedModel, setSelectedModel: appSetters.setSelectedModel };
    const generativeServicesProps = { config: appState.generativeServiceConfig, setConfig: appSetters.setGenerativeServiceConfig };
    const pcbViewerProps = kicadState.pcbArtifacts ? { ...kicadState.pcbArtifacts, onClose: () => kicadSetters.setPcbArtifacts(null) } : null;
    
    const workbenchProps = {
        userInput: appState.userInput, setUserInput: appSetters.setUserInput, isSwarmRunning: swarmState.isSwarmRunning, workflowSteps: kicadState.workflowSteps,
        currentLayoutData: kicadState.currentLayoutData, isLayoutInteractive: kicadState.isLayoutInteractive, layoutHeuristics: kicadState.layoutHeuristics,
        kicadLog: kicadState.kicadLog, visibility, isServerConnected, isAutonomousMode: kicadState.isAutonomousMode, demoScripts: WORKFLOW_SCRIPTS, currentUserTask: swarmState.currentUserTask,
        onStartTask: kicadHandlers.handleStartKicadTask, onCommitLayout: handleCommitLayoutAndContinue, onUpdateLayout: kicadHandlers.handleUpdateLayout,
        setLayoutHeuristics: kicadSetters.setLayoutHeuristics, setVisibility, setIsAutonomousMode: kicadSetters.setIsAutonomousMode,
        startSwarmTask: swarmHandlers.startSwarmTask, allTools, getKicadSystemPrompt, getTool,
        scriptExecutionState: swarmState.scriptExecutionState, currentScriptStepIndex: swarmState.currentScriptStepIndex, stepStatuses: swarmState.stepStatuses,
        onPlayPause: swarmHandlers.toggleScriptPause, onStop: () => swarmHandlers.handleStopSwarm("Script stopped by user."),
        onStepForward: swarmHandlers.stepForward, onStepBackward: swarmHandlers.stepBackward, onRunFromStep: swarmHandlers.runFromStep,
    };

    const aetheriumClientProps = {
        gameState,
        playerState: playerManager.playerState,
        isServerConnected,
        handleManualControl: handleGameManualControl,
        onStartLocalGame: initializeLocalWorld,
        onExitGame: exitLocalWorld,
        onConnectToShard: connectToShard,
        onLoadPlayer: playerManager.loadPlayer,
        demoScripts: WORKFLOW_SCRIPTS,
        logEvent,
        getTool,
        executeTool,
        setPilotMode: gameSetters.setPilotMode,
        setAiPilotTarget: gameSetters.setAiPilotTarget,
        kicadProjectState: kicadHandlers.getKicadProjectState(),
    };
    
    const agentControlProps = { robotState, personalities: robotState.agentPersonalities, handleManualControl: (tool: string, args?: any) => handleRobotManualControl(tool, args) };
    
    const renderMainView = () => {
        if (kicadState.pcbArtifacts) {
            return <UIToolRunner tool={getTool('KiCad PCB Viewer')} props={pcbViewerProps} />;
        }
        const runtime = executeActionRef.current?.getRuntimeApiForAgent ? executeActionRef.current.getRuntimeApiForAgent('ui-agent') : null;

        switch(appState.mainView) {
            case 'VIRTUAL_FILM_SET': {
                const filmSetProps = { executeTool, getTool, isServerConnected, runtime, productionData, setProductionData };
                return <UIToolRunner tool={getTool('Virtual Film Set Workbench')} props={filmSetProps} />;
            }
            case 'PRODUCER_STUDIO': {
                const producerProps = { executeTool, runtime, productionData, setProductionData };
                return <UIToolRunner tool={getTool('Producer Studio Workbench')} props={producerProps} />;
            }
            case 'AETHERIUM_GAME': {
                return <UIToolRunner tool={getTool('Aetherium Game Client')} props={aetheriumClientProps} />;
            }
            case 'ATTENTIVE_MODELING': {
                 const attentiveModelingProps = { 
                    getTool, 
                    runtime,
                    isSwarmRunning: swarmState.isSwarmRunning,
                    startSwarmTask: swarmHandlers.startSwarmTask,
                };
                return <UIToolRunner tool={getTool('Attentive Modeling Environment')} props={attentiveModelingProps} />;
            }
            case 'KNOWLEDGE_GRAPH': {
                const kgViewerProps = { ...innovationGraphViewerProps, executeTool };
                return <UIToolRunner tool={getTool('Innovation Knowledge Graph Viewer')} props={kgViewerProps} />;
            }
            case 'KICAD': default: {
                return <UIToolRunner tool={getTool('Lead Engineer Workbench')} props={workbenchProps} />;
            }
        }
    };
    
    const systemManagementPanelProps = {
        tools,
        setTools,
        playerState: playerManager.playerState,
        setPlayerState: playerManager.setPlayerState,
        savePlayerState: playerManager.savePlayerState,
        runtime: executeActionRef.current,
        isServerConnected,
        getTool,
    };
    
    if (isBootstrapping) {
        return (
            <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400"></div>
                <p className="text-indigo-300 mt-4 text-lg">Initializing System & Installing Tools...</p>
                <div className="w-1/2 max-w-lg mt-4 bg-gray-800 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full animate-pulse" style={{ width: '45%' }}></div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col">
            {swarmState.lastSwarmRunHistory ? (
                <main className="flex-grow"><div className="h-full max-h-screen p-4"><UIToolRunner tool={getTool('Workflow Capture Panel')} props={{ history: swarmState.lastSwarmRunHistory, onClose: swarmHandlers.clearLastSwarmRunHistory }} /></div></main>
            ) : (
                <>
                    <header className="flex-shrink-0 p-4 pb-0"><UIToolRunner tool={getTool('Main View Selector')} props={mainViewSelectorProps} /></header>
                    <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 min-h-0">
                        <div className="lg:col-span-3 space-y-4 flex flex-col min-h-0">
                            <UIToolRunner tool={getTool('Agent Status Display')} props={{ agentSwarm: swarmState.agentSwarm, isSwarmRunning: swarmState.isSwarmRunning, handleStopSwarm: swarmHandlers.handleStopSwarm, currentUserTask: swarmState.currentUserTask }} />
                             <UIToolRunner tool={getTool('AI Model')} props={configProps} />
                             <UIToolRunner tool={getTool('Generative Services Panel')} props={generativeServicesProps} />
                             <UIToolRunner tool={getTool('System Management Panel')} props={systemManagementPanelProps} />
                             {appState.mainView === 'ROBOTICS' && <UIToolRunner tool={getTool('Agent Control Panel')} props={agentControlProps} />}
                        </div>
                        <div className="lg:col-span-9 flex flex-col h-full min-h-0">{renderMainView()}</div>
                    </main>
                </>
            )}
            <UIToolRunner tool={getTool('Debug Log View')} props={debugLogProps} />
        </div>
    );
}

// FIX: Change to a default export to match the updated import in index.tsx. This resolves a module resolution error that can occur in some environments.
export default App;
