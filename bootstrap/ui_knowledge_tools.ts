import type { ToolCreatorPayload } from '../types';

export const UI_KNOWLEDGE_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Interactive Schematic Graph',
        description: 'Renders an interactive, force-directed graph for schematic visualization and component layout. Nodes can be clicked and dragged. Once component dimensions are known, it becomes the primary layout tool.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To visualize complex relationships and allow for human-in-the-loop refinement of AI-generated component placements.',
        parameters: [
            { name: 'graph', type: 'object', description: 'The graph data, containing nodes, edges, and optionally a board_outline.', required: true },
            { name: 'title', type: 'string', description: 'The title to display above the graph.', required: false },
            { name: 'onCommit', type: 'object', description: 'Callback function to submit the final layout and continue the workflow.', required: false },
            { name: 'serverUrl', type: 'string', description: 'Base URL of the server for loading assets.', required: true },
        ],
        implementationCode: `
            if (!graph || !graph.nodes || graph.nodes.length === 0) {
                return (
                    <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg h-full flex items-center justify-center">
                        <p className="text-gray-400">The schematic graph will be built here as the agent works.</p>
                    </div>
                )
            }
            const { board_outline, nodes: graphNodes, edges } = graph;

            const [simNodes, setSimNodes] = React.useState([]);
            const containerRef = React.useRef(null);
            const isDraggingRef = React.useRef(null);
            const animationFrameRef = React.useRef(null);
            const simulationActive = React.useRef(true);
            
            const isLayoutMode = React.useMemo(() => !!board_outline, [board_outline]);
            const scale = isLayoutMode ? 1.0 : (1 / (Math.max(...simNodes.map(n => Math.hypot(n.x, n.y))) || 500)) * 500;
            const viewBox = React.useMemo(() => {
                if (!board_outline) return '-500 -500 1000 1000';
                const margin = Math.max(board_outline.width, board_outline.height) * 0.1;
                return \`\${board_outline.x - margin} \${board_outline.y - margin} \${board_outline.width + margin*2} \${board_outline.height + margin*2}\`;
            }, [board_outline]);

            React.useEffect(() => {
                const svgElement = containerRef.current;
                if (!svgElement) return;

                const initialNodes = graphNodes.map(node => ({
                    ...node,
                    x: node.x ?? svgElement.clientWidth / 2 + (Math.random() - 0.5) * 50,
                    y: node.y ?? svgElement.clientHeight / 2 + (Math.random() - 0.5) * 50,
                    vx: 0, vy: 0,
                }));
                setSimNodes(initialNodes);
                simulationActive.current = true;

                const tick = () => {
                    if (!simulationActive.current) return;
                    setSimNodes(currentNodes => {
                        if (currentNodes.length === 0) {
                            simulationActive.current = false;
                            return [];
                        }
                        
                        let totalMovement = 0;
                        const REPULSION = isLayoutMode ? 1e7 : 50000;
                        const ATTRACTION = isLayoutMode ? 0.02 : 0.05;
                        const CENTER_GRAVITY = isLayoutMode ? 0.005 : 0.02;

                        const nextNodes = currentNodes.map(nodeA => {
                            if (isDraggingRef.current === nodeA.id) return { ...nodeA, vx: 0, vy: 0 };

                            let fx = 0, fy = 0;
                            const centerX = isLayoutMode ? board_outline.x + board_outline.width / 2 : svgElement.clientWidth / 2;
                            const centerY = isLayoutMode ? board_outline.y + board_outline.height / 2 : svgElement.clientHeight / 2;
                            fx -= (nodeA.x - centerX) * CENTER_GRAVITY;
                            fy -= (nodeA.y - centerY) * CENTER_GRAVITY;

                            for (const nodeB of currentNodes) {
                                if (nodeA.id === nodeB.id) continue;
                                const dx = nodeA.x - nodeB.x;
                                const dy = nodeA.y - nodeB.y;
                                let distance = Math.sqrt(dx * dx + dy * dy) || 1;
                                const force = REPULSION / (distance * distance);
                                fx += (dx / distance) * force;
                                fy += (dy / distance) * force;
                            }
                            
                            nodeA.vx = (nodeA.vx + fx) * 0.8;
                            nodeA.vy = (nodeA.vy + fy) * 0.8;
                            nodeA.x += nodeA.vx;
                            nodeA.y += nodeA.vy;
                            
                            totalMovement += Math.abs(nodeA.vx) + Math.abs(nodeA.vy);
                            return nodeA;
                        });

                        const getDiagonal = (node) => {
                            if (node.dimensions) return Math.hypot(node.dimensions.width, node.dimensions.height);
                            if (isLayoutMode && node.width) return Math.hypot(node.width, node.height);
                            return (10 + (node.pin_count || 0) * 0.5) * 2;
                        };

                        for (const edge of edges) {
                            const source = nextNodes.find(n => n.id === edge.source);
                            const target = nextNodes.find(n => n.id === edge.target);
                            if (!source || !target) continue;
                            const dx = target.x - source.x;
                            const dy = target.y - source.y;
                            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                            const idealLength = (getDiagonal(source)/2 + getDiagonal(target)/2) + (isLayoutMode ? 5 : 60);
                            const displacement = distance - idealLength;
                            const force = ATTRACTION * displacement;
                            const fx = (dx / distance) * force;
                            const fy = (dy / distance) * force;
                            if (isDraggingRef.current !== source.id) { source.vx += fx; source.vy += fy; }
                            if (isDraggingRef.current !== target.id) { target.vx -= fx; target.vy -= fy; }
                        }

                        if (totalMovement < 0.1 && !isDraggingRef.current) {
                           simulationActive.current = false;
                        }

                        return nextNodes;
                    });
                    
                    if (simulationActive.current) {
                        animationFrameRef.current = requestAnimationFrame(tick);
                    }
                };

                animationFrameRef.current = requestAnimationFrame(tick);
                return () => {
                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                    simulationActive.current = false;
                };
            }, [graph, isLayoutMode, board_outline, serverUrl]);

            const handleMouseDown = (e, nodeId) => { isDraggingRef.current = nodeId; simulationActive.current = true; if (!animationFrameRef.current) requestAnimationFrame(() => {}); };
            const handleMouseMove = (e) => {
                if (!isDraggingRef.current || !containerRef.current) return;
                const svg = containerRef.current;
                const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
                const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse());
                setSimNodes(nodes => nodes.map(n => n.id === isDraggingRef.current ? { ...n, x, y } : n));
                if (!simulationActive.current) { simulationActive.current = true; requestAnimationFrame(() => {}); }
            };
            const handleMouseUp = () => { isDraggingRef.current = null; };
            const handleCommit = () => {
                const finalPositions = simNodes.reduce((acc, node) => {
                    acc[node.id] = { x: node.x, y: node.y }; return acc;
                }, {});
                onCommit(finalPositions);
            };

            const nodePositions = new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }]));

            return (
                 <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg h-full flex flex-col">
                    <h3 className="text-lg font-bold text-yellow-300 mb-3 text-center">{title || "Knowledge Graph"}</h3>
                    <div className="flex-grow bg-black/30 rounded overflow-hidden">
                        <svg ref={containerRef} viewBox={isLayoutMode ? viewBox : undefined} className="w-full h-full cursor-grab" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                            {isLayoutMode && <rect x={board_outline.x} y={board_outline.y} width={board_outline.width} height={board_outline.height} className="fill-none stroke-green-500" strokeWidth={board_outline.width/100} />}
                            {edges.map((edge, i) => {
                                const sourcePos = nodePositions.get(edge.source); const targetPos = nodePositions.get(edge.target);
                                if (!sourcePos || !targetPos) return null;
                                return <line key={\`\${edge.source}-\${edge.target}-\${i}\`} x1={sourcePos.x} y1={sourcePos.y} x2={targetPos.x} y2={targetPos.y} className="stroke-slate-600" strokeWidth={isLayoutMode ? 0.2 : 1} />;
                            })}
                            {simNodes.map(node => {
                                const hasFootprint = node.svgPath && node.dimensions;
                                const fullSvgUrl = hasFootprint ? \`\${serverUrl}/\${node.svgPath}\` : '';
                                const effectiveWidth = node.dimensions?.width || node.width || 20;
                                const effectiveHeight = node.dimensions?.height || node.height || 20;

                                return (
                                    <g key={node.id} transform={\`translate(\${node.x}, \${node.y})\`} onMouseDown={(e) => handleMouseDown(e, node.id)} className="cursor-move group">
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
                                        <text textAnchor="middle" y={effectiveHeight / 2 + (isLayoutMode ? 4 : 15)} className="fill-white font-semibold select-none stroke-black stroke-1" style={{ fontSize: isLayoutMode ? Math.min(effectiveWidth, effectiveHeight) / 4 : '12px', paintOrder: 'stroke' }}>
                                            {node.label}
                                        </text>
                                    </g>
                                )
                            })}
                        </svg>
                    </div>
                    {isLayoutMode && onCommit && (
                        <button onClick={handleCommit} className="mt-3 w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700">
                            Commit Layout & Continue
                        </button>
                    )}
                 </div>
            );
        `
    },
];
