
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkflowStep, AIToolCall, EnrichedAIResponse, LLMTool, KnowledgeGraphNode, KnowledgeGraphEdge, MainView, KnowledgeGraph } from '../types';

type UseKicadManagerProps = {
    logEvent: (message: string) => void;
    selectedModel: any;
    apiConfig: any;
    executeActionRef: React.MutableRefObject<(toolCall: AIToolCall, agentId: string) => Promise<EnrichedAIResponse>>;
    fetchServerTools: () => Promise<any>;
    allToolsRef: React.MutableRefObject<LLMTool[]>;
    startSwarmTask: (params: { task: string, systemPrompt: string | null }) => Promise<void>;
    setKnowledgeGraph: React.Dispatch<React.SetStateAction<KnowledgeGraph>>;
    setMainView: React.Dispatch<React.SetStateAction<MainView>>;
};

export const useKicadManager = (props: UseKicadManagerProps) => {
    const { logEvent, executeActionRef, fetchServerTools, startSwarmTask, setKnowledgeGraph, setMainView } = props;

    const [pcbArtifacts, setPcbArtifacts] = useState<{ boardName: string, topImage: string, bottomImage: string, fabZipPath: string } | null>(null);
    const [kicadLog, setKicadLog] = useState<string[]>([]);
    const [currentKicadArtifact, setCurrentKicadArtifact] = useState<{title: string, path: string | null, svgPath: string | null} | null>(null);
    
    const isLayoutPaused = useRef(false);
    const currentProjectName = useRef<string | null>(null);


    const logKicadEvent = useCallback((message: string) => {
        setKicadLog(prev => [...prev.slice(-99), message]);
    }, []);

    // This effect will listen for specific execution results to update the UI and knowledge graph
    useEffect(() => {
        const originalExecuteAction = executeActionRef.current;

        const augmentedExecuteAction = async (toolCall: AIToolCall, agentId: string): Promise<EnrichedAIResponse> => {
            const result = await originalExecuteAction(toolCall, agentId);

            // Log output from the python script to the KiCad log panel
            if (result.executionResult?.stdout) {
                try {
                    const parsed = JSON.parse(result.executionResult.stdout);
                    if(parsed.message) logKicadEvent(`✔️ ${parsed.message}`);

                    if (parsed.layout_data) {
                        isLayoutPaused.current = true;
                        currentProjectName.current = String(toolCall.arguments.projectName);
                        
                        // Enrich the knowledge graph with layout info instead of setting a separate state
                        setKnowledgeGraph(prevGraph => {
                            const enrichedNodes = prevGraph.nodes.map(node => {
                                const layoutInfo = parsed.layout_data.components.find((c: any) => c.ref === node.id);
                                if (layoutInfo) {
                                    return {
                                        ...node,
                                        width: layoutInfo.width, 
                                        height: layoutInfo.height,
                                        x: layoutInfo.x,
                                        y: layoutInfo.y,
                                    };
                                }
                                return node;
                            });
                            return { ...prevGraph, nodes: enrichedNodes, board_outline: parsed.layout_data.board_outline };
                        });

                        logKicadEvent("⏸️ Workflow paused. Adjust component layout on the graph and click 'Commit & Continue'.");
                    }

                     if (parsed.artifacts) {
                        let title = 'Processing...';
                        if (toolCall.name.includes('Arrange')) title = 'Placed Components';
                        if (toolCall.name.includes('Route')) title = 'Routed Board';
                        if (toolCall.name.includes('Create Initial')) title = 'Unplaced Board';
                        if (toolCall.name.includes('Export')) title = 'Final Fabrication Output';
                        
                        const newArtifact = { 
                            title, 
                            path: parsed.artifacts.placed_png || parsed.artifacts.topImage || null,
                            svgPath: parsed.artifacts.routed_svg || null 
                        };
                        
                        if (newArtifact.path || newArtifact.svgPath) setCurrentKicadArtifact(newArtifact);

                        if (parsed.artifacts.fabZipPath) {
                            logKicadEvent("🎉 Fabrication successful! Displaying final 3D results.");
                             setPcbArtifacts({ 
                                boardName: String(parsed.artifacts.boardName), 
                                topImage: String(parsed.artifacts.topImage), 
                                bottomImage: String(parsed.artifacts.bottomImage), 
                                fabZipPath: String(parsed.artifacts.fabZipPath) 
                            });
                            setCurrentKicadArtifact(null);
                        }
                    }
                } catch(e) { /* ignore if stdout is not json */ }
            }
             if(result.toolCall?.name) {
                 logKicadEvent(`⚙️ Agent ${agentId} called: ${result.toolCall.name}`);
             }
             if(result.executionError) {
                logKicadEvent(`❌ ERROR: ${result.executionError}`);
             }

            // --- Update Knowledge Graph based on tool calls ---
            if (!result.executionError && result.toolCall) {
                if (result.toolCall.name === 'Define KiCad Component') {
                    const args = result.toolCall.arguments;
                    
                    let svgPath, dimensions;
                    if(result.executionResult?.stdout) {
                        try {
                            const parsed = JSON.parse(result.executionResult.stdout);
                            svgPath = parsed.svgPath;
                            dimensions = parsed.dimensions;
                        } catch(e) { /* ignore if stdout is not valid json */ }
                    }

                    const newNode: KnowledgeGraphNode = {
                        id: String(args.componentReference),
                        label: String(args.componentReference),
                        value: args.componentValue,
                        footprint: args.footprintIdentifier,
                        pin_count: args.numberOfPins,
                        svgPath,
                        dimensions,
                    };
                    setKnowledgeGraph(prev => ({ ...prev, edges: prev.edges, nodes: [...prev.nodes.filter(n => n.id !== newNode.id), newNode]}));
                }
                
                if (result.toolCall.name === 'Define KiCad Net') {
                    try {
                        const { netName, pins } = result.toolCall.arguments;
                         if (!netName || !Array.isArray(pins)) {
                            logKicadEvent(`⚠️ WARN: Invalid arguments for Define KiCad Net.`);
                        } else {
                            const newEdges: KnowledgeGraphEdge[] = [];
                            const componentRefs: string[] = (pins as any[]).map(pin => String(pin).split('-')[0]);
                            const uniqueComponents = [...new Set(componentRefs)];

                            for (let i = 0; i < uniqueComponents.length; i++) {
                                for (let j = i + 1; j < uniqueComponents.length; j++) {
                                    newEdges.push({
                                        source: uniqueComponents[i],
                                        target: uniqueComponents[j],
                                        label: String(netName)
                                    });
                                }
                            }
                            setKnowledgeGraph(prev => {
                                const existingEdgeKeys = new Set(prev.edges.map(e => {
                                    const nodes = [e.source, e.target].sort();
                                    return `${nodes[0]}|${nodes[1]}|${e.label}`;
                                }));

                                const uniqueNewEdges = newEdges.filter(e => {
                                    const nodes = [e.source, e.target].sort();
                                    const key = `${nodes[0]}|${nodes[1]}|${e.label}`;
                                    if (existingEdgeKeys.has(key)) {
                                        return false;
                                    }
                                    existingEdgeKeys.add(key); // prevent duplicates within the same batch
                                    return true;
                                });

                                return { ...prev, nodes: prev.nodes, edges: [...prev.edges, ...uniqueNewEdges]};
                            });
                        }
                    } catch (e) {
                         logKicadEvent(`❌ ERROR: Could not process connections to build graph edges. ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }


            return result;
        };
        
        executeActionRef.current = augmentedExecuteAction;

        return () => { executeActionRef.current = originalExecuteAction; };
    }, [logKicadEvent, logEvent, executeActionRef, setKnowledgeGraph]);


    const handleStartKicadTask = useCallback(async (prompt: string) => {
        // Reset all states for the new task
        setKicadLog([]);
        setKnowledgeGraph({ nodes: [], edges: [] });
        setPcbArtifacts(null);
        setCurrentKicadArtifact(null);
        isLayoutPaused.current = false;
        
        // Switch to the graph view to show the build process
        setMainView('KNOWLEDGE_GRAPH');
        
        const projectName = `brd_${Date.now()}`;
        currentProjectName.current = projectName;
        logKicadEvent(`🚀 Starting KiCad Generation Swarm...`);
        logKicadEvent(`Project name set to: ${projectName}`);

        const kicadSystemPrompt = `
You are an expert KiCad automation engineer agent in a swarm. Your goal is to contribute to the creation of a PCB based on a user's request by calling one or more of the available KiCad tools.

## KiCad Workflow & Rules
You MUST follow this sequence of operations. Check the action history to see what the previous agent did, and perform the NEXT logical step(s). The KiCad tools are already installed on the server.

1.  **Define ALL Components (Parallel Execution):** Your first step MUST be to define every single component from the user's request. You can and SHOULD call \\\`Define KiCad Component\\\` for all components in parallel in a single response.
2.  **Define ALL Nets (Parallel Execution):** After all components are defined, you MUST define every single electrical net from the user's request. Call the \\\`Define KiCad Net\\\` tool for each net. This can be done in parallel.
3.  **Generate Netlist:** Once ALL components AND nets are defined, call \\\`Generate KiCad Netlist\\\`.
4.  **Create PCB:** After the netlist, call \\\`Create Initial PCB\\\`.
5.  **Create Board Outline:** After creating the PCB, call \\\`Create Board Outline\\\`. For automatic sizing based on components, set both width and height to 0.
6.  **Arrange Components:** After the outline, call \\\`Arrange Components\\\`. This step will PAUSE the workflow for user interaction.
7.  **Autoroute:** After arrangement, call \\\`Autoroute PCB\\\`.
8.  **Export:** Finally, call \\\`Export Fabrication Files\\\`.
9.  **Task Complete:** After exporting, you MUST call the \\\`Task Complete\\\` tool to signal the end of the workflow.

## Critical Instructions
*   **PARALLELISM:** When a step can be broken down into independent actions (like defining multiple components or nets), you MUST call the relevant tool for each action in a single turn.
*   **PROJECT NAME:** You MUST use the exact 'projectName' provided for ALL tool calls. This is critical.
*   **ONE LOGICAL STEP:** Your job is to decide and execute the next logical set of actions. The swarm will handle the rest.
*   **CHECK HISTORY:** Carefully review the swarm's action history to determine what has already been done. DO NOT repeat a step.
`;
    
        const fullTaskPrompt = `User Request: "${prompt}"\n\nUse this project name for all steps: "${projectName}"`;

        await startSwarmTask({ task: fullTaskPrompt, systemPrompt: kicadSystemPrompt });

    }, [logKicadEvent, startSwarmTask, fetchServerTools, setKnowledgeGraph, setMainView]);
    
    const handleCommitLayoutAndContinue = useCallback(async (finalPositions: any) => {
        logEvent("💾 Committing updated layout to server...");
        
        const projectName = currentProjectName.current;
        if (!projectName) {
             logKicadEvent("❌ Error: Could not determine project name to continue workflow.");
             return;
        }

        try {
            // Convert positions back to mm for the backend
            const positionsInMM = {};
            for (const ref in finalPositions) {
                positionsInMM[ref] = { x: finalPositions[ref].x, y: finalPositions[ref].y };
            }

            await executeActionRef.current({
                name: 'Update KiCad Component Positions',
                arguments: { projectName: projectName, componentPositionsJSON: JSON.stringify(positionsInMM) }
            }, 'kicad-agent-layout');
            
            logKicadEvent("✅ Layout updated. Resuming workflow...");
            isLayoutPaused.current = false;
            
            const resumePrompt = `The component layout for project ${projectName} has been manually updated and committed. The next logical step is to autoroute the PCB. Please call the 'Autoroute PCB' tool for project '${projectName}'.`;
            await startSwarmTask({ task: resumePrompt, systemPrompt: null }); // Use default swarm prompt to continue
            
        } catch(e) {
             const errorMessage = e instanceof Error ? e.message : String(e);
            logKicadEvent(`❌ EXECUTION HALTED while updating positions: ${errorMessage}`);
        }
    }, [logKicadEvent, executeActionRef, startSwarmTask]);

    return {
        state: {
            pcbArtifacts,
            kicadLog,
            currentKicadArtifact,
        },
        setters: {
            setPcbArtifacts,
            setKicadLog,
            setCurrentKicadArtifact,
        },
        handlers: {
            handleStartKicadTask,
            handleCommitLayoutAndContinue,
        }
    };
};
