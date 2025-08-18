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
        { name: 'onUpdateLayout', type: 'object', description: 'Callback function to update the layout data (e.g., rules).', required: true },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        { name: 'heuristics', type: 'object', description: 'Initial simulation heuristics from the workflow.', required: false },
    ],
    implementationCode: `
        // --- Injected Module Code ---
        ${AgentDebugPanelString}
        ${GraphicsClassString}
        ${AgentSimulationClassString}
        // --- End Injected Code ---

        const mountRef = React.useRef(null);
        const simRef = React.useRef(null); // Will hold { sim, graphics }
        
        const [selectedAgentId, setSelectedAgentId] = React.useState(null);
        const [agentDebugInfo, setAgentDebugInfo] = React.useState({});
        const [isAutoCommitDone, setIsAutoCommitDone] = React.useState(false);
        const [isSimReady, setIsSimReady] = React.useState(false);

        const [visibility, setVisibility] = React.useState({
            placeholders: true,
            svg: true,
            glb: true,
        });
        const [simParams, setSimParams] = React.useState({
            componentSpacing: 60.0,
            netLengthWeight: 0.01,
            boardEdgeConstraint: 10.0,
            settlingSpeed: 0.9,
            // Rule strengths
            proximityStrength: 0.2,
            symmetryStrength: 2.0,
            alignmentStrength: 2.0,
            circularStrength: 2.0,
            symmetricalPairStrength: 5.0,
            absolutePositionStrength: 10.0,
            fixedRotationStrength: 5.0,
            symmetryRotationStrength: 2.0,
            circularRotationStrength: 2.0,
        });

        const selectedNode = React.useMemo(() => 
            selectedAgentId ? graph.nodes.find(n => n.id === selectedAgentId) : null,
            [selectedAgentId, graph.nodes]
        );

        // --- Initialization Effect (Runs Once) ---
        React.useEffect(() => {
            if (!mountRef.current) return;
            let isMounted = true;
            let debugUpdateInterval;
            setIsSimReady(false);

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
                    
                    const initialGraph = { ...graph, nodes: [], edges: [], rules: [] };
                    sim = new AgentSimulation(initialGraph, simScale, THREE);

                    if (!isMounted) return { sim, graphics };
                    graphics.setSimulation(sim);
                    simRef.current = { sim, graphics };
                    if (isMounted) setIsSimReady(true);
                    
                    const animate = () => {
                        if (!isMounted || !simRef.current) return;
                        simRef.current.sim.step();
                        simRef.current.graphics.render();
                        requestAnimationFrame(animate);
                    };
                    animate();
                    
                    debugUpdateInterval = setInterval(() => {
                        if (isMounted && simRef.current?.sim) {
                            setAgentDebugInfo(simRef.current.sim.getDebugInfo());
                        }
                    }, 250);

                    return () => { // Cleanup function
                        if (debugUpdateInterval) clearInterval(debugUpdateInterval);
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
        }, [mode]);

        // --- Data Update Effects ---
        React.useEffect(() => {
            if (heuristics && Object.keys(heuristics).length > 0) {
                setSimParams(prev => ({ ...prev, ...heuristics }));
            }
        }, [heuristics]);

        React.useEffect(() => {
            if (!isSimReady || !simRef.current || !graph || !graph.nodes) return;
            const { sim, graphics } = simRef.current;
            
            graph.nodes.forEach(node => {
                if (!sim.agents.has(node.id)) {
                    console.log(\`[SIM] Adding agent: \${node.id}\`);
                    sim.addAgent(node);
                    graphics.addMesh(node.id, node, mode, sim.SCALE);
                }
            });
             // Also handle node property updates, like side changes
            graph.nodes.forEach(node => {
                const simNode = sim.nodeMap.get(node.id);
                if (simNode && simNode.side !== node.side) {
                    sim.updateNode(node);
                }
            });
        }, [graph.nodes, mode, isSimReady]);
        
        React.useEffect(() => {
            if (!isSimReady || !simRef.current || !graph || !graph.edges) return;
            simRef.current.sim.updateEdges(graph.edges);
        }, [graph.edges, isSimReady]);

        React.useEffect(() => {
            if (isSimReady && simRef.current?.sim) {
                simRef.current.sim.updateParams(simParams);
            }
        }, [simParams, isSimReady]);

        React.useEffect(() => {
            if (isSimReady && simRef.current?.graphics) {
                simRef.current.graphics.updateVisibility(visibility);
            }
        }, [visibility, isSimReady]);
        
        // This effect now directly watches the rules from the graph prop
        React.useEffect(() => {
            if (isSimReady && simRef.current?.sim && graph?.rules) {
                console.log('[DEBUG] Interactive PCB Layout Tool: Detected rule change. Propagating to simulation. Rule count:', graph.rules.length, JSON.stringify(graph.rules.map(r => r.type)));
                // Ensure rules have an 'enabled' property if not present
                const sanitizedRules = graph.rules.map(rule => ({ ...rule, enabled: rule.enabled !== false }));
                simRef.current.sim.updateRules(sanitizedRules);
            }
        }, [graph?.rules, isSimReady]);


        // --- User Interaction & Auto-Commit Logic ---
        const handleCommit = React.useCallback(() => {
            if (onCommit && simRef.current?.sim) {
                const finalPositions = simRef.current.sim.getFinalPositions();
                onCommit(finalPositions);
            }
        }, [onCommit]);
        
        const handleUpdateRules = React.useCallback((newRules) => {
            if (onUpdateLayout) {
                onUpdateLayout(prevLayout => ({
                    ...prevLayout,
                    rules: newRules,
                }));
            }
        }, [onUpdateLayout]);

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

                return () => { clearInterval(stabilityCheckInterval); clearTimeout(timeoutId); };
            }
        }, [isLayoutInteractive, isAutoCommitDone, handleCommit]);
        
        const handleAgentHover = React.useCallback((agentId, isHovering) => {
            if (simRef.current?.graphics) {
                simRef.current.graphics.highlightMesh(agentId, isHovering);
            }
        }, []);
        
        const handleAgentSelect = React.useCallback((agentId) => {
            if (!simRef.current?.graphics) return;
            const newId = selectedAgentId === agentId ? null : agentId;
            if(selectedAgentId) simRef.current.graphics.selectMesh(selectedAgentId, false);
            if(newId) {
                simRef.current.graphics.selectMesh(newId, true);
                simRef.current.graphics.focusOn(newId);
            }
            setSelectedAgentId(newId);
        }, [selectedAgentId]);

        const VisibilityPanel = () => (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Visibility</h3>
                <div className="space-y-1 text-sm p-2">
                    {Object.keys(visibility).map(key => (
                        <div key={key} className="flex items-center">
                            <input
                                type="checkbox"
                                id={\`vis-\${key}\`}
                                checked={visibility[key]}
                                onChange={() => setVisibility(v => ({...v, [key]: !v[key]}))}
                                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-purple-500 focus:ring-purple-600"
                            />
                            <label htmlFor={\`vis-\${key}\`} className="ml-2 text-gray-300">
                                Show {key.charAt(0).toUpperCase() + key.slice(1)}
                            </label>
                        </div>
                    ))}
                </div>
            </div>
        );
            
        return (
            <div className="bg-gray-900/50 border-2 border-cyan-500/60 rounded-xl p-2 h-full flex flex-col md:flex-row gap-2">
                 <div className="flex-shrink-0 md:w-1/4 h-96 md:h-full min-h-0">
                    <AgentDebugPanel
                        agents={graph.nodes || []}
                        debugInfo={agentDebugInfo}
                        selectedId={selectedAgentId}
                        selectedNode={selectedNode}
                        onSelect={handleAgentSelect}
                        onHover={handleAgentHover}
                    />
                </div>
                <div className="flex-grow h-64 md:h-full relative">
                    <div ref={mountRef} className="w-full h-full bg-black/30 rounded overflow-hidden touch-none cursor-grab" />
                    {!isSimReady && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-300"></div>
                            <p className="text-cyan-300 ml-3">Initializing 3D Engine...</p>
                       </div>
                    )}
                </div>
                <div className="flex-shrink-0 md:w-1/4 h-96 md:h-full min-h-0 flex flex-col gap-2">
                    <VisibilityPanel />
                    <UIToolRunner 
                        tool={getTool('Layout Rules Editor')}
                        props={{
                            rules: graph.rules || [],
                            onUpdateRules: handleUpdateRules,
                        }}
                    />
                    <UIToolRunner 
                        tool={getTool('Layout Heuristics Tuner')}
                        props={{
                            params: simParams,
                            setParams: setSimParams,
                            selectedAgent: selectedAgentId ? { id: selectedAgentId, ...simRef.current?.sim.agents.get(selectedAgentId) } : null,
                            updateAgent: (id, key, value) => simRef.current?.sim.updateAgentParam(id, key, value)
                        }}
                    />
                </div>
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
    PCB_LAYOUT_TOOL,
];
