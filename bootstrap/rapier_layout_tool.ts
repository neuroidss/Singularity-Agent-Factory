// bootstrap/rapier_layout_tool.ts
import React from 'react';
import type { ToolCreatorPayload } from '../types';
import { GraphicsClassString } from './sim/graphics';
import { AgentSimulationCoreString } from './sim/agent_simulation';
import { ForceSimulationFunctionsString } from './sim/simulation_forces';
import { CollisionSimulationFunctionsString } from './sim/simulation_collisions';

const FullAgentSimulationClassString = `
class AgentSimulation {
    ${AgentSimulationCoreString}
    ${ForceSimulationFunctionsString}
    ${CollisionSimulationFunctionsString}
}
`;

const INTERACTIVE_SIMULATION_VIEW_TOOL: ToolCreatorPayload = {
    name: 'Interactive Simulation View',
    description: 'An interactive 3D view for visualizing and interacting with physics-based or rule-based agent simulations. Supports PCB layout, robotics, and dynamic world modeling.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a powerful and intuitive unified interface for various simulations, modeled as emergent behavior of autonomous agents.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph data including nodes (agents), edges (connections), and board outline.', required: true },
        { name: 'mode', type: 'string', description: "The simulation mode: 'pcb', 'robotics', or 'world_model'.", required: true },
        { name: 'layoutStrategy', type: 'string', description: "The layout engine to use: 'agent' for rule-based, 'physics' for Rapier.js simulation.", required: false },
        { name: 'onCommit', type: 'object', description: 'Callback function to commit final positions (PCB mode only).', required: false },
        { name: 'onUpdateLayout', type: 'object', description: 'Callback function to update the layout data (e.g., rules).', required: false },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: false },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: false },
        { name: 'heuristics', type: 'object', description: 'Initial simulation heuristics from the workflow.', required: false },
        { name: 'isServerConnected', type: 'boolean', description: 'Flag indicating if the backend server is connected.', required: false },
        { name: 'visibility', type: 'object', description: 'An object with boolean flags for rendering different layers.', required: false },
        { name: 'playerId', type: 'string', description: 'The ID of the player character for the 3rd person camera.', required: false },
    ],
    implementationCode: `
        // --- Injected Module Code ---
        ${GraphicsClassString}
        ${FullAgentSimulationClassString}
        // --- End Injected Code ---

        const mountRef = React.useRef(null);
        const simRef = React.useRef(null);
        const [isSimReady, setIsSimReady] = React.useState(false);
        const [isAutoCommitDone, setIsAutoCommitDone] = React.useState(false);
        const [isCommitting, setIsCommitting] = React.useState(false);
        
        // When a new graph is passed in (a new layout task), reset the auto-commit state.
        React.useEffect(() => {
            setIsAutoCommitDone(false);
            setIsCommitting(false);
        }, [graph]);

        // --- Initialization Effect (Runs Once) ---
        React.useEffect(() => {
            if (!mountRef.current) return;
            let isMounted = true;
            setIsSimReady(false);

            const init = async () => {
                let sim, graphics;
                let animationFrameId; // To hold the requestAnimationFrame ID
                try {
                    const THREE = await import('three');
                    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
                    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
                    const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');
                    
                    if (!window.rapierInitializationPromise) {
                        window.rapierInitializationPromise = import('@dimforge/rapier3d-compat').then(RAPIER_module => {
                            const RAPIER = RAPIER_module.default;
                            return RAPIER.init().then(() => RAPIER);
                        });
                    }
                    const RAPIER = await window.rapierInitializationPromise;

                    if (!isMounted) return null;
                    
                    const simScale = mode === 'pcb' ? 1 : (mode === 'world_model' ? 5 : 10);
                    
                    graphics = new Graphics(mountRef.current, THREE, OrbitControls, GLTFLoader, SVGLoader, graph?.board_outline, simScale, isServerConnected, mode, playerId);
                    
                    const initialGraph = graph ? { ...graph, nodes: [], edges: [], rules: [] } : { nodes: [], edges: [], rules: [], board_outline: null };
                    sim = new AgentSimulation(initialGraph, simScale, THREE, mode, onUpdateLayout, RAPIER);

                    if (!isMounted) return { sim, graphics };
                    graphics.setSimulation(sim);
                    simRef.current = { sim, graphics };
                    if (isMounted) setIsSimReady(true);
                    
                    const animate = () => {
                        if (!isMounted || !simRef.current) return;
                        simRef.current.sim.step();
                        simRef.current.graphics.render();
                        animationFrameId = requestAnimationFrame(animate);
                    };
                    animate();
                    
                    return () => { // Cleanup function
                        cancelAnimationFrame(animationFrameId); // Crucial: Stop the loop before cleaning up
                        if (sim) sim.cleanup();
                        if (graphics) graphics.cleanup();
                        simRef.current = null;
                    };

                } catch(e) {
                     console.error("Failed to initialize simulation:", e);
                     if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error initializing simulation. Check console.</p>';
                     return null;
                }
            };
            
            const cleanupPromise = init();

            return () => {
                isMounted = false;
                cleanupPromise.then((cleanupFn) => {
                    if (cleanupFn) cleanupFn();
                });
            };
        }, [mode, playerId]);

        // --- Data Update Effects ---
        React.useEffect(() => {
            if (isSimReady && simRef.current?.sim && graph) {
                if (mode === 'robotics') {
                    simRef.current.sim.setAuthoritativeState(graph.nodes);
                }
                simRef.current.sim.updateGraph(graph);
            }
        }, [graph, isSimReady, mode]);

        React.useEffect(() => {
            if (simRef.current?.graphics && isSimReady) {
                simRef.current.graphics.updateConnectionStatus(isServerConnected);
            }
        }, [isServerConnected, isSimReady]);

        React.useEffect(() => {
            if (isSimReady && simRef.current?.sim && heuristics && Object.keys(heuristics).length > 0) {
                simRef.current.sim.updateParams(heuristics);
            }
        }, [heuristics, isSimReady]);

        React.useEffect(() => {
            if (!isSimReady || !simRef.current || !graph || !graph.nodes) return;
            const { sim, graphics } = simRef.current;
            
            graph.nodes.forEach(node => {
                if (!sim.agents.has(node.id)) {
                    sim.addAgent(node);
                    graphics.addMesh(node.id, node, mode, sim.SCALE);
                }
            });
            graph.nodes.forEach(node => {
                const simNode = sim.nodeMap.get(node.id);
                if (simNode && simNode.side !== node.side) sim.updateNode(node);
            });
        }, [graph?.nodes, mode, isSimReady]);
        
        React.useEffect(() => {
            if (!isSimReady || !simRef.current || !graph || !graph.edges) return;
            simRef.current.sim.updateEdges(graph.edges);
        }, [graph?.edges, isSimReady]);
        
        React.useEffect(() => {
            if (isSimReady && simRef.current?.graphics && graph) {
                simRef.current.graphics.updateNetVisuals(graph);
            }
        }, [graph?.edges, isSimReady]);

        React.useEffect(() => {
            if (isSimReady && simRef.current?.graphics) {
                simRef.current.graphics.updateBoardMesh(graph?.board_outline, simRef.current.sim.SCALE);
            }
        }, [graph?.board_outline, isSimReady]);

        React.useEffect(() => {
            if (isSimReady && simRef.current?.graphics) {
                simRef.current.graphics.updateVisibility(visibility);
            }
        }, [visibility, isSimReady]);
        
        React.useEffect(() => {
            if (isSimReady && simRef.current?.sim && graph?.rules) {
                const sanitizedRules = graph.rules.map(rule => ({ ...rule, enabled: rule.enabled !== false }));
                simRef.current.sim.updateRules(sanitizedRules);
            }
        }, [graph?.rules, isSimReady]);


        const handleCommit = React.useCallback(() => {
            if (onCommit && simRef.current?.sim) {
                setIsCommitting(true);
                const finalPositions = simRef.current.sim.getFinalPositions();
                onCommit(finalPositions);
            }
        }, [onCommit]);

        React.useEffect(() => {
            // Only run auto-commit if there's an actual graph with nodes to process.
            if (!isLayoutInteractive && !isAutoCommitDone && simRef.current?.sim && graph && graph.nodes && graph.nodes.length > 0) {
                const stabilityCheckInterval = setInterval(() => {
                    if (simRef.current?.sim?.isStable) {
                        handleCommit();
                        setIsAutoCommitDone(true); // Mark as done for this layout
                        clearInterval(stabilityCheckInterval);
                    }
                }, 500);

                const timeoutId = setTimeout(() => {
                    if (!isAutoCommitDone) {
                        handleCommit();
                        setIsAutoCommitDone(true);
                        clearInterval(stabilityCheckInterval);
                    }
                }, 30000); // 30-second failsafe timeout

                return () => { clearInterval(stabilityCheckInterval); clearTimeout(timeoutId); };
            }
        }, [isLayoutInteractive, isAutoCommitDone, handleCommit, graph]);
        
        const Spinner = () => (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        );

        return (
            <div className="bg-gray-900/50 border border-cyan-700/60 rounded-xl p-2 h-full flex flex-col relative">
                <div ref={mountRef} className="w-full h-full bg-black/30 rounded overflow-hidden touch-none cursor-grab" />
                {!isSimReady && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-300"></div>
                        <p className="text-cyan-300 ml-3">Initializing 3D Engine...</p>
                   </div>
                )}
                {isLayoutInteractive && mode === 'pcb' && (
                    <div className="absolute bottom-4 right-4 z-10">
                        <button
                          onClick={handleCommit}
                          disabled={isCommitting}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 transition-colors disabled:bg-green-800 disabled:cursor-wait"
                          aria-label="Commit layout and continue workflow"
                        >
                          {isCommitting ? <Spinner /> : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {isCommitting ? 'Committing...' : 'Commit Layout & Continue'}
                        </button>
                    </div>
                )}
            </div>
        );
    `
};

export const PHYSICS_LAYOUT_TOOLS: ToolCreatorPayload[] = [
    INTERACTIVE_SIMULATION_VIEW_TOOL,
];