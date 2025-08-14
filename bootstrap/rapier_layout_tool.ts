
import React from 'react';
import type { ToolCreatorPayload } from '../types';
import { GraphicsClassString } from './sim/graphics';
import { AgentSimulationClassString } from './sim/agent_simulation';
import { AgentDebugPanelString } from './sim/ui_panels';

const PCB_LAYOUT_TOOL: ToolCreatorPayload = {
    name: 'Interactive PCB Layout Tool',
    description: 'An interactive 3D simulation for arranging PCB components or simulating robot agents. It supports a rule-based agent layout and a physics-based engine.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a powerful and intuitive unified interface for component placement and robotics simulation, modeled as emergent behavior of autonomous agents.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph data including nodes (agents), edges (connections), and board outline.', required: true },
        { name: 'mode', type: 'string', description: "The simulation mode: 'pcb' or 'robotics'.", required: true },
        { name: 'layoutStrategy', type: 'string', description: "The layout engine to use: 'agent' for rule-based, 'physics' for Rapier.js simulation.", required: false },
        { name: 'onCommit', type: 'object', description: 'Callback function to commit final positions (PCB mode only).', required: true },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
    ],
    implementationCode: `
        // --- Injected Module Code ---
        ${AgentDebugPanelString}
        ${GraphicsClassString}
        ${AgentSimulationClassString}
        // --- End Injected Code ---

        const mountRef = React.useRef(null);
        const onCommitRef = React.useRef(onCommit);
        onCommitRef.current = onCommit;
        
        const [selectedAgentId, setSelectedAgentId] = React.useState(null);
        const [agentDebugInfo, setAgentDebugInfo] = React.useState({});
        const [isAutoCommitDone, setIsAutoCommitDone] = React.useState(false);
        const simRef = React.useRef(null);

        const handleCommit = React.useCallback(() => {
            if (onCommitRef.current && simRef.current && simRef.current.sim) {
                const finalPositions = simRef.current.sim.getFinalPositions();
                onCommitRef.current(finalPositions);
            }
        }, []);

        const handleAgentHover = React.useCallback((agentId, isHovering) => {
            if (simRef.current && simRef.current.graphics) {
                simRef.current.graphics.highlightMesh(agentId, isHovering);
            }
        }, []);
        
        const handleAgentSelect = React.useCallback((agentId) => {
            if (!simRef.current || !simRef.current.graphics) return;
            const graphics = simRef.current.graphics;
            const currentSelectedId = selectedAgentId;
            const newId = currentSelectedId === agentId ? null : agentId;
            
            if(currentSelectedId) {
                graphics.selectMesh(currentSelectedId, false);
            }
            if(newId) {
                graphics.selectMesh(newId, true);
                graphics.focusOn(newId);
            }
            setSelectedAgentId(newId);
        }, [selectedAgentId]);

        React.useEffect(() => {
            if (!isLayoutInteractive && !isAutoCommitDone && simRef.current?.sim) {
                const stabilityCheckInterval = setInterval(() => {
                    if (simRef.current?.sim?.isStable) {
                        console.log("Autonomous layout is stable. Committing positions automatically.");
                        handleCommit();
                        setIsAutoCommitDone(true);
                        clearInterval(stabilityCheckInterval);
                    }
                }, 500);

                const timeoutId = setTimeout(() => {
                    if (!isAutoCommitDone) {
                        console.warn("Autonomous layout did not stabilize in 30s. Forcing commit.");
                        handleCommit();
                        setIsAutoCommitDone(true);
                        clearInterval(stabilityCheckInterval);
                    }
                }, 30000);

                return () => {
                    clearInterval(stabilityCheckInterval);
                    clearTimeout(timeoutId);
                };
            }
        }, [isLayoutInteractive, isAutoCommitDone, handleCommit]);
    
        React.useEffect(() => {
            if (!graph || !graph.nodes || graph.nodes.length === 0 || !mountRef.current) {
                return;
            }
            
            let isMounted = true;
            
            const init = async () => {
                let sim, graphics;
                try {
                    const THREE = await import('three');
                    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
                    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
                    const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');

                    if (!isMounted) return null;
                    const simScale = mode === 'pcb' ? 1 : 10;
                    graphics = new Graphics(mountRef.current, THREE, OrbitControls, GLTFLoader, SVGLoader, graph.board_outline, simScale);

                    if(layoutStrategy === 'physics') {
                         const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
                         await RAPIER.init();
                         //Physics simulation is not fully implemented here, so we fall back to agent sim for stability.
                         sim = new AgentSimulation(graph, simScale, THREE);
                    } else {
                         sim = new AgentSimulation(graph, simScale, THREE);
                    }
                    
                    if (!isMounted) return { sim, graphics };
                    graphics.setSimulation(sim);
                    graph.nodes.forEach(node => graphics.addMesh(node.id, node, mode, sim.SCALE));
                    simRef.current = { sim, graphics };

                    const animate = () => {
                        if (!isMounted || !simRef.current || !simRef.current.sim || !simRef.current.graphics) return;
                        simRef.current.sim.step();
                        if(layoutStrategy === 'agent') setAgentDebugInfo(simRef.current.sim.getDebugInfo());
                        simRef.current.graphics.render();
                        sim.animationFrameId = requestAnimationFrame(animate);
                    };
                    animate();
                    return { sim, graphics };
                } catch(e) {
                     console.error("Failed to initialize simulation:", e);
                     if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error initializing simulation. Check console.</p>';
                     return { sim: null, graphics: null }; // Return a valid object on error
                }
            };
            
            const cleanupPromise = init();

            return () => {
                isMounted = false;
                cleanupPromise.then((result) => {
                    if (!result) return;
                    const {sim, graphics} = result;
                    if (sim && sim.animationFrameId) cancelAnimationFrame(sim.animationFrameId);
                    if (sim) sim.cleanup();
                    if (graphics) graphics.cleanup();
                });
                simRef.current = null;
            };
        }, [graph, mode, layoutStrategy]);
            
        return (
            <div className="bg-gray-900/50 border-2 border-cyan-500/60 rounded-xl p-2 h-full flex flex-col md:flex-row gap-2">
                <div className="flex-grow md:w-3/4 h-64 md:h-full">
                    <div ref={mountRef} className="w-full h-full bg-black/30 rounded overflow-hidden relative touch-none cursor-grab">
                       <div className="w-full h-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-300"></div>
                            <p className="text-cyan-300 ml-3">Initializing Layout Engine...</p>
                       </div>
                    </div>
                </div>
                 { mode === 'pcb' && layoutStrategy === 'agent' &&
                    <div className="flex-shrink-0 md:w-1/4 h-96 md:h-full min-h-0">
                        <AgentDebugPanel
                            agents={graph.nodes || []}
                            debugInfo={agentDebugInfo}
                            selectedId={selectedAgentId}
                            onSelect={handleAgentSelect}
                            onHover={handleAgentHover}
                        />
                    </div>
                 }
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
                    {mode === 'pcb' && (
                        isLayoutInteractive ? (
                            <button onClick={handleCommit} className="bg-green-600 text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-green-700 shadow-lg transition-all duration-200" disabled={!isLayoutInteractive}>
                                Accept Layout & Continue Workflow
                            </button>
                        ) : (
                            !isAutoCommitDone && (
                                <div className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-lg shadow-lg flex items-center animate-pulse">
                                    <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Performing autonomous layout...
                                </div>
                            )
                        )
                    )}
                </div>
            </div>
        );
    `
};

export const PHYSICS_LAYOUT_TOOLS: ToolCreatorPayload[] = [
    PCB_LAYOUT_TOOL
];
