
import type { ToolCreatorPayload } from '../types';

export const UI_KNOWLEDGE_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Interactive Schematic Graph',
        description: 'Renders an interactive, force-directed graph for schematic visualization and component layout. Nodes can be clicked and dragged. Once component dimensions are known, it becomes the primary layout tool.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To visualize complex relationships and allow for human-in-the-loop refinement of AI-generated component placements.',
        parameters: [
            { name: 'graph', type: 'object', description: 'The graph data, containing nodes, edges, and optionally a board_outline and constraints.', required: true },
            { name: 'title', type: 'string', description: 'The title to display above the graph.', required: false },
            { name: 'onCommit', type: 'object', description: 'Callback function to submit the final layout and continue the workflow.', required: false },
            { name: 'serverUrl', type: 'string', description: 'Base URL of the server for loading assets.', required: true },
            { name: 'waitForUserInput', type: 'boolean', description: "If false, the simulation runs autonomously and commits when stable. If true, it waits for a manual button click.", required: false },
        ],
        implementationCode: `
            if (!graph || !graph.nodes || graph.nodes.length === 0) {
                 return (
                    <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg h-full flex items-center justify-center">
                       <p className="text-gray-400">The schematic graph will be built here as the agent works.</p>
                    </div>
                )
            }

            const { board_outline, nodes: graphNodes, edges, constraints } = graph;
            const isInteractiveMode = typeof waitForUserInput === 'undefined' ? true : waitForUserInput;

            const [simNodes, setSimNodes] = React.useState([]);
            const simNodesRef = React.useRef(simNodes);
            simNodesRef.current = simNodes;
            
            const [constraintData, setConstraintData] = React.useState({ groups: {}, nodeToGroup: {} });

            const [isStable, setIsStable] = React.useState(false);
            const [showManualCommitButton, setShowManualCommitButton] = React.useState(isInteractiveMode);
            
            const containerRef = React.useRef(null);
            const isDraggingRef = React.useRef(null);
            const animationFrameRef = React.useRef(null);
            const simulationActive = React.useRef(true);
            const hasAutoCommitted = React.useRef(false);
            const userHasInteractedRef = React.useRef(false);
            const autoCommitTimerRef = React.useRef(null);
            
            const onCommitRef = React.useRef(onCommit);
            onCommitRef.current = onCommit;
            
            const isLayoutMode = React.useMemo(() => !!board_outline, [board_outline]);
            
            const viewBox = React.useMemo(() => {
                if (!board_outline) return '-500 -500 1000 1000';
                const margin = Math.max(board_outline.width, board_outline.height) * 0.1;
                return \`\${board_outline.x - margin} \${board_outline.y - margin} \${board_outline.width + margin*2} \${board_outline.height + margin*2}\`;
            }, [board_outline]);

            React.useEffect(() => {
                const groups = {}; // Map anchorId -> { nodes: Map<nodeId, {offsetX, offsetY, angle}> }
                const nodeToGroup = {}; // Map any nodeId -> anchorId

                if (constraints) {
                    // Process relative_position first to establish groups
                    constraints.forEach(c => {
                        if (c.type === 'relative_position') {
                            const [anchorId, childId] = c.components;
                            // For simplicity, first component is always anchor
                            if (!groups[anchorId]) {
                                groups[anchorId] = { nodes: new Map([[anchorId, {offsetX: 0, offsetY: 0, angle: 0}]]) };
                            }
                            groups[anchorId].nodes.set(childId, { offsetX: c.offsetX_mm, offsetY: c.offsetY_mm, angle: 0 });
                            
                            // Update nodeToGroup for all members of the group
                            for(const id of groups[anchorId].nodes.keys()) {
                                nodeToGroup[id] = anchorId;
                            }
                        }
                    });

                    // Process fixed_orientation and apply to groups
                    constraints.forEach(c => {
                        if (c.type === 'fixed_orientation') {
                            c.components.forEach(nodeId => {
                                const anchorId = nodeToGroup[nodeId] || nodeId;
                                if (!groups[anchorId]) {
                                     groups[anchorId] = { nodes: new Map([[nodeId, {offsetX: 0, offsetY: 0, angle: 0}]]) };
                                     nodeToGroup[nodeId] = anchorId;
                                }
                                // Apply angle to all nodes in the group
                                for(const [id, data] of groups[anchorId].nodes.entries()){
                                    data.angle = c.angle_deg;
                                }
                            });
                        }
                    });
                }
                setConstraintData({ groups, nodeToGroup });
            }, [constraints]);
            
            const handleCommit = React.useCallback(() => {
                if (hasAutoCommitted.current) return;
                hasAutoCommitted.current = true;
            
                if (autoCommitTimerRef.current) {
                    clearTimeout(autoCommitTimerRef.current);
                    autoCommitTimerRef.current = null;
                }
                simulationActive.current = false;
                const finalPositions = simNodesRef.current.reduce((acc, node) => {
                    acc[node.id] = { x: node.x, y: node.y };
                    return acc;
                }, {});
            
                if (onCommitRef.current) {
                    onCommitRef.current(finalPositions);
                }
            }, []);

            React.useEffect(() => {
                if (isStable && !isInteractiveMode && onCommitRef.current && !userHasInteractedRef.current && !hasAutoCommitted.current) {
                    autoCommitTimerRef.current = setTimeout(() => {
                        if (!userHasInteractedRef.current) {
                            handleCommit();
                        }
                    }, 5000);
                }
                
                return () => {
                    if (autoCommitTimerRef.current) {
                        clearTimeout(autoCommitTimerRef.current);
                    }
                };
            }, [isStable, isInteractiveMode, handleCommit]);

            React.useEffect(() => {
                const svgElement = containerRef.current;
                if (!svgElement) return;
                
                hasAutoCommitted.current = false;
                setIsStable(false);
                simulationActive.current = true;
                userHasInteractedRef.current = false;
                setShowManualCommitButton(isInteractiveMode);
                if (autoCommitTimerRef.current) clearTimeout(autoCommitTimerRef.current);

                const initialNodes = graphNodes.map(node => ({
                    ...node,
                    x: node.x ?? (isLayoutMode ? board_outline.x + board_outline.width/2 : 0) + (Math.random() - 0.5) * 50,
                    y: node.y ?? (isLayoutMode ? board_outline.y + board_outline.height/2 : 0) + (Math.random() - 0.5) * 50,
                    vx: 0, vy: 0,
                }));
                setSimNodes(initialNodes);

                let tickCount = 0;
                const tick = () => {
                    if (!simulationActive.current) return;
                    
                    setSimNodes(currentNodes => {
                        if (currentNodes.length === 0) {
                            simulationActive.current = false;
                            return [];
                        }
                        
                        let totalMovement = 0;
                        const DAMPING = 0.9;
                        const REPULSION = isLayoutMode ? 250 : 50000;
                        const ATTRACTION = isLayoutMode ? 0.01 : 0.05;
                        const CENTER_GRAVITY = isLayoutMode ? 0.001 : 0.01;

                        const nextNodes = currentNodes.map(nodeA => ({...nodeA}));

                        for (let i = 0; i < nextNodes.length; i++) {
                            const nodeA = nextNodes[i];
                             if (isDraggingRef.current === nodeA.id) {
                                 nodeA.vx = 0; nodeA.vy = 0; continue;
                             }

                            let fx = 0, fy = 0;
                            const centerX = isLayoutMode ? board_outline.x + board_outline.width / 2 : 0;
                            const centerY = isLayoutMode ? board_outline.y + board_outline.height / 2 : 0;
                            fx += (centerX - nodeA.x) * CENTER_GRAVITY;
                            fy += (centerY - nodeA.y) * CENTER_GRAVITY;

                            for (let j = 0; j < nextNodes.length; j++) {
                                if (i === j) continue;
                                const nodeB = nextNodes[j];
                                const dx = nodeA.x - nodeB.x;
                                const dy = nodeA.y - nodeB.y;
                                let distance = Math.hypot(dx, dy) || 1;
                                const force = REPULSION / (distance * distance);
                                fx += (dx / distance) * force;
                                fy += (dy / distance) * force;
                            }
                            
                            nodeA.vx = (nodeA.vx + fx) * DAMPING;
                            nodeA.vy = (nodeA.vy + fy) * DAMPING;
                        }
                        
                        const getDiagonal = (node) => {
                            const w = node.dimensions?.width || node.width || 20;
                            const h = node.dimensions?.height || node.height || 20;
                            return Math.hypot(w, h);
                        };

                        for (const edge of edges) {
                            const source = nextNodes.find(n => n.id === edge.source);
                            const target = nextNodes.find(n => n.id === edge.target);
                            if (!source || !target) continue;
                            const dx = target.x - source.x;
                            const dy = target.y - source.y;
                            const distance = Math.hypot(dx, dy) || 1;
                            const idealLength = (getDiagonal(source)/2 + getDiagonal(target)/2) * 1.1 + (isLayoutMode ? 2 : 50);
                            const displacement = distance - idealLength;
                            const force = ATTRACTION * displacement;
                            const fx = (dx / distance) * force;
                            const fy = (dy / distance) * force;
                            
                            if (isDraggingRef.current !== source.id) { source.vx += fx; source.vy += fy; }
                            if (isDraggingRef.current !== target.id) { target.vx -= fx; target.vy -= fy; }
                        }

                        // Apply velocities
                        nextNodes.forEach(node => {
                            if (isDraggingRef.current !== node.id) {
                                node.x += node.vx;
                                node.y += node.vy;
                            }
                        });

                        // Iteratively solve constraints
                        for(let i=0; i < 5; i++){
                            Object.values(constraintData.groups).forEach(group => {
                                const anchorNode = nextNodes.find(n => n.id === group.anchor);
                                if(!anchorNode) return;
                                group.nodes.forEach((data, nodeId) => {
                                    if(nodeId === group.anchor) return;
                                    const childNode = nextNodes.find(n => n.id === nodeId);
                                    if(childNode){
                                        const targetX = anchorNode.x + data.offsetX;
                                        const targetY = anchorNode.y + data.offsetY;
                                        const errorX = childNode.x - targetX;
                                        const errorY = childNode.y - targetY;
                                        anchorNode.x += errorX * 0.1;
                                        anchorNode.y += errorY * 0.1;
                                        childNode.x -= errorX * 0.1;
                                        childNode.y -= errorY * 0.1;
                                    }
                                });
                            });
                        }
                        
                        nextNodes.forEach(node => {
                             totalMovement += Math.abs(node.vx) + Math.abs(node.vy);
                        });


                        if ((totalMovement < 0.1 * nextNodes.length && tickCount > 50) && !isDraggingRef.current) {
                           if(simulationActive.current) {
                               simulationActive.current = false;
                               setIsStable(true);
                           }
                        }

                        return nextNodes;
                    });
                    
                    tickCount++;
                    animationFrameRef.current = requestAnimationFrame(tick);
                };

                animationFrameRef.current = requestAnimationFrame(tick);
                return () => {
                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                    simulationActive.current = false;
                };
            }, [graph, isLayoutMode, board_outline, serverUrl, isInteractiveMode, constraintData]);
            
            const handleMouseDown = (e, nodeId) => {
                if (!userHasInteractedRef.current && !isInteractiveMode) {
                    userHasInteractedRef.current = true;
                    setShowManualCommitButton(true);
                    if (autoCommitTimerRef.current) clearTimeout(autoCommitTimerRef.current);
                }
                isDraggingRef.current = nodeId;
                setIsStable(false);
                if(!simulationActive.current) {
                    simulationActive.current = true;
                    animationFrameRef.current = requestAnimationFrame(animationFrameRef.current);
                };
            };

            const handleMouseMove = (e) => {
                if (!isDraggingRef.current || !containerRef.current) return;
                const svg = containerRef.current;
                const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
                const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse());

                const draggedNodeId = isDraggingRef.current;
                const prevNode = simNodesRef.current.find(n => n.id === draggedNodeId);
                if(!prevNode) return;

                const dx = x - prevNode.x;
                const dy = y - prevNode.y;

                const anchorId = constraintData.nodeToGroup[draggedNodeId];

                setSimNodes(nodes => nodes.map(n => {
                    if (anchorId) { // Node is in a group
                        if (constraintData.nodeToGroup[n.id] === anchorId) {
                            return { ...n, x: n.x + dx, y: n.y + dy };
                        }
                    } else if (n.id === draggedNodeId) { // Not in group, just drag itself
                        return { ...n, x, y };
                    }
                    return n;
                }));

                if (!simulationActive.current) {
                    simulationActive.current = true;
                    requestAnimationFrame(() => { simulationActive.current = false });
                }
            };
            const handleMouseUp = () => { isDraggingRef.current = null; };

            const nodePositions = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]));

            return (
                 <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg h-full flex flex-col">
                    <h3 className="text-lg font-bold text-yellow-300 mb-3 text-center">{title || "Knowledge Graph"}</h3>
                    <div className="flex-grow bg-black/30 rounded overflow-hidden">
                        <svg ref={containerRef} viewBox={viewBox} className="w-full h-full cursor-grab" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                            {isLayoutMode && <rect x={board_outline.x} y={board_outline.y} width={board_outline.width} height={board_outline.height} className="fill-none stroke-green-500" strokeWidth={board_outline.width/100} />}
                            {edges.map((edge, i) => {
                                const sourcePos = nodePositions.get(edge.source); const targetPos = nodePositions.get(edge.target);
                                if (!sourcePos || !targetPos) return null;
                                return <line key={\`\${edge.source}-\${edge.target}-\${i}\`} x1={sourcePos.x} y1={sourcePos.y} x2={targetPos.x} y2={targetPos.y} className="stroke-slate-600" strokeWidth={isLayoutMode ? 0.2 : 1} />;
                            })}
                            {simNodes.map(node => {
                                const hasFootprint = node.svgPath && (node.dimensions || (node.width && node.height));
                                const fullSvgUrl = hasFootprint ? \`\${serverUrl}/\${node.svgPath}\` : '';
                                const effectiveWidth = node.dimensions?.width || node.width || 20;
                                const effectiveHeight = node.dimensions?.height || node.height || 20;
                                
                                const anchorId = constraintData.nodeToGroup[node.id];
                                const groupData = anchorId && constraintData.groups[anchorId];
                                const nodeData = groupData && groupData.nodes.get(node.id);
                                const angle = nodeData?.angle ?? 0;

                                return (
                                    <g key={node.id} transform={\`translate(\${node.x}, \${node.y}) rotate(\${angle})\`} onMouseDown={(e) => handleMouseDown(e, node.id)} className="cursor-move group">
                                        {hasFootprint ? (
                                            <image 
                                                href={fullSvgUrl} 
                                                x={-effectiveWidth / 2} 
                                                y={-effectiveHeight / 2} 
                                                width={effectiveWidth} 
                                                height={effectiveHeight}
                                                className="group-hover:opacity-80 transition-opacity"
                                            />
                                        ) : (
                                            <circle r={10 + (node.pin_count || 0) * 0.5} className="fill-purple-900/80 stroke-purple-400 group-hover:stroke-yellow-400 transition-colors" strokeWidth="2" />
                                        )}
                                        <text textAnchor="middle" y={effectiveHeight / 2 + (isLayoutMode ? 4 : 15)} transform={\`rotate(\${-angle})\`} className="fill-white font-semibold select-none stroke-black stroke-1" style={{ fontSize: isLayoutMode ? Math.min(effectiveWidth, effectiveHeight) / 4 : '12px', paintOrder: 'stroke' }}>
                                            {node.label}
                                        </text>
                                    </g>
                                )
                            })}
                        </svg>
                    </div>
                    {isLayoutMode && onCommit && showManualCommitButton && (
                        <button onClick={handleCommit} className="mt-3 w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700">
                            Commit Layout & Continue
                        </button>
                    )}
                 </div>
            );
        `
    },
];
