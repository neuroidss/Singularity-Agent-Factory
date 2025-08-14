

import type { ToolCreatorPayload } from '../types';
import { STRATEGIC_MEMORY_SCRIPT } from './strategy_manager_script';

const STRATEGIC_MEMORY_GRAPH_VIEWER_PAYLOAD: ToolCreatorPayload = {
    name: 'Strategic Memory Graph Viewer',
    description: 'Renders an interactive 3D force-directed graph of the agent\'s long-term strategic memory, showing Directives, knowledge, and their relationships.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a visual interface into the agent\'s "mind," making its long-term goals and knowledge structure observable and understandable.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph data including nodes and edges.', required: true },
        { name: 'isLoading', type: 'boolean', description: 'Whether the graph data is currently being fetched.', required: true },
        { name: 'onRefresh', type: 'object', description: 'Callback function to refresh the graph data from the server.', required: true },
    ],
    implementationCode: `
        const mountRef = React.useRef(null);
        const simulationRef = React.useRef({});

        React.useEffect(() => {
            if (isLoading || !graph || !graph.nodes) {
                if(mountRef.current) mountRef.current.innerHTML = '';
                return;
            }

            let isMounted = true;
            const sim = simulationRef.current;
            
            const init = async () => {
                if (!mountRef.current) return;

                try {
                    sim.RAPIER = (await import('@dimforge/rapier3d-compat')).default;
                    await sim.RAPIER.init();
                    sim.THREE = await import('three');
                    const { OrbitControls: OC } = await import('three/addons/controls/OrbitControls.js');
                    sim.OrbitControls = OC;
                } catch (e) {
                    console.error("Failed to load 3D libraries:", e);
                    if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error loading 3D libraries. Check console.</p>';
                    return;
                }
                
                if (!isMounted || !mountRef.current) return;

                const { nodes, edges } = graph;
                sim.nodeMap = new Map(nodes.map(n => [n.id, n]));

                sim.scene = new sim.THREE.Scene();
                sim.scene.background = new sim.THREE.Color(0x1a202c); // Dark blue-gray
                sim.camera = new sim.THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
                sim.renderer = new sim.THREE.WebGLRenderer({ antialias: true });
                sim.renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
                mountRef.current.innerHTML = '';
                mountRef.current.appendChild(sim.renderer.domElement);

                sim.scene.add(new sim.THREE.AmbientLight(0xcccccc, 1.0));
                const dirLight = new sim.THREE.DirectionalLight(0xffffff, 2.0);
                dirLight.position.set(5, 10, 7.5);
                sim.scene.add(dirLight);

                sim.controls = new sim.OrbitControls(sim.camera, sim.renderer.domElement);
                sim.controls.enableDamping = true;
                sim.camera.position.z = 30;

                sim.world = new sim.RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
                sim.bodies = new Map();
                sim.meshes = new Map();

                nodes.forEach(node => {
                    const isDirective = node.type === 'directive';
                    const radius = isDirective ? 2.5 : 1.5;
                    const color = isDirective ? 0xffd700 : 0x00bfff;
                    
                    const geo = new sim.THREE.SphereGeometry(radius, 32, 16);
                    const mat = new sim.THREE.MeshStandardMaterial({ color, roughness: 0.5 });
                    const mesh = new sim.THREE.Mesh(geo, mat);
                    sim.scene.add(mesh);

                    const spriteMat = new sim.THREE.SpriteMaterial({ color: 0xffffff });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.font = '32px Arial';
                    const textWidth = ctx.measureText(node.label).width;
                    canvas.width = textWidth;
                    canvas.height = 40;
                    ctx.font = '32px Arial';
                    ctx.fillStyle = 'white';
                    ctx.fillText(node.label, 0, 32);
                    const texture = new sim.THREE.CanvasTexture(canvas);
                    spriteMat.map = texture;
                    const sprite = new sim.THREE.Sprite(spriteMat);
                    sprite.scale.set(textWidth / 10, 4, 1.0);
                    sprite.position.y = radius + 1.5;
                    mesh.add(sprite);
                    sim.meshes.set(node.id, mesh);

                    const bodyDesc = sim.RAPIER.RigidBodyDesc.dynamic().setLinearDamping(5.0);
                    const body = sim.world.createRigidBody(bodyDesc);
                    const colliderDesc = sim.RAPIER.ColliderDesc.ball(radius);
                    sim.world.createCollider(colliderDesc, body);
                    sim.bodies.set(node.id, body);
                });

                sim.lines = [];
                edges.forEach(() => {
                    const mat = new sim.THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 });
                    const geo = new sim.THREE.BufferGeometry().setFromPoints([new sim.THREE.Vector3(), new sim.THREE.Vector3()]);
                    const line = new sim.THREE.Line(geo, mat);
                    sim.scene.add(line);
                    sim.lines.push(line);
                });

                const animate = () => {
                    if (!isMounted) return;
                    
                    sim.bodies.forEach(body => body.resetForces(true));
                    
                    // Center attraction
                    sim.bodies.forEach(body => {
                        const pos = body.translation();
                        const force = { x: -pos.x * 0.1, y: -pos.y * 0.1, z: -pos.z * 0.1 };
                        body.addForce(force, true);
                    });

                    // Edge spring forces
                    edges.forEach(edge => {
                        const bodyA = sim.bodies.get(edge.source);
                        const bodyB = sim.bodies.get(edge.target);
                        if (bodyA && bodyB) {
                            const posA = bodyA.translation();
                            const posB = bodyB.translation();
                            const springConstant = 0.2;
                            const force = {
                                x: (posB.x - posA.x) * springConstant,
                                y: (posB.y - posA.y) * springConstant,
                                z: (posB.z - posA.z) * springConstant
                            };
                            bodyA.addForce(force, true);
                            bodyB.addForce({ x: -force.x, y: -force.y, z: -force.z }, true);
                        }
                    });

                    sim.world.step();

                    sim.meshes.forEach((mesh, id) => {
                        const body = sim.bodies.get(id);
                        const pos = body.translation();
                        mesh.position.set(pos.x, pos.y, pos.z);
                    });

                    edges.forEach((edge, i) => {
                        const line = sim.lines[i];
                        const bodyA = sim.bodies.get(edge.source);
                        const bodyB = sim.bodies.get(edge.target);
                        if (line && bodyA && bodyB) {
                            const posA = bodyA.translation();
                            const posB = bodyB.translation();
                            const points = [new sim.THREE.Vector3(posA.x, posA.y, posA.z), new sim.THREE.Vector3(posB.x, posB.y, posB.z)];
                            line.geometry.setFromPoints(points);
                        }
                    });

                    sim.controls.update();
                    sim.renderer.render(sim.scene, sim.camera);
                    sim.animationFrameId = requestAnimationFrame(animate);
                };
                
                animate();

                return () => {
                    isMounted = false;
                    if (sim.animationFrameId) cancelAnimationFrame(sim.animationFrameId);
                    if (sim.world) sim.world.free();
                    if (mountRef.current && sim.renderer.domElement && mountRef.current.contains(sim.renderer.domElement)) {
                        mountRef.current.removeChild(sim.renderer.domElement);
                    }
                };
            };
            
            const cleanupPromise = init();
            return () => {
                cleanupPromise.then(cleanup => cleanup && cleanup());
            };

        }, [graph, isLoading]);


        if (isLoading) {
            return (
                <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-300"></div>
                    <p className="text-yellow-300 mt-3">Loading Strategic Memory...</p>
                </div>
            );
        }

        if (!graph || !graph.nodes || graph.nodes.length === 0) {
            return (
                <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center h-full">
                    <h3 className="text-lg font-bold text-yellow-300">Strategic Memory is Empty</h3>
                    <p className="text-gray-300 text-center mt-2">The agent has not yet defined any long-term Directives or knowledge.</p>
                     <button onClick={onRefresh} className="mt-4 bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-yellow-700">
                        Refresh
                    </button>
                </div>
            );
        }

        return (
            <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-2 shadow-lg flex flex-col h-full relative">
                <div ref={mountRef} className="flex-grow bg-black/30 rounded overflow-hidden relative cursor-grab"></div>
                <button onClick={onRefresh} className="absolute top-4 right-4 bg-gray-700/50 text-white font-semibold py-1 px-3 rounded-lg hover:bg-gray-600 backdrop-blur-sm">
                    Refresh
                </button>
            </div>
        )
    `
};

const STRATEGY_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Read Strategic Memory',
        description: 'Reads the entire strategic memory graph from the persistent server storage.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To load the agent\'s long-term knowledge and plans into its current context for strategic decision-making.',
        parameters: [],
        implementationCode: 'python scripts/strategic_memory.py read'
    },
    {
        name: 'Define Strategic Directive',
        description: 'Creates a new high-level, long-term "Directive" node in the strategic memory graph. This is the foundation for long-term planning.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To allow the agent to formalize and persist its long-term goals, moving beyond short-term task execution.',
        parameters: [
            { name: 'id', type: 'string', description: 'A short, unique, machine-readable ID for the directive (e.g., "master_rf_design").', required: true },
            { name: 'label', type: 'string', description: 'A human-readable description of the directive.', required: true },
            { name: 'parent', type: 'string', description: 'Optional ID of an existing node this directive is related to.', required: false },
        ],
        implementationCode: 'python scripts/strategic_memory.py define_directive'
    },
    {
        name: 'Update Strategic Memory',
        description: 'Adds or updates nodes and edges in the strategic memory graph to record new knowledge, plans, or relationships.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To enable the agent to learn and build upon its knowledge over time, creating a persistent and evolving understanding of its world.',
        parameters: [
            { name: 'nodes', type: 'array', description: 'A JSON string of an array of node objects to add or update. Each object needs at least an "id" and "label".', required: false },
            { name: 'edges', type: 'array', description: 'A JSON string of an array of edge objects to add. Each object needs a "source" and "target" ID.', required: false },
        ],
        implementationCode: 'python scripts/strategic_memory.py update_memory'
    },
];

const STRATEGY_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Strategic Cognition Suite',
    description: 'A one-time setup action that installs all necessary client-side tools for managing the agent\'s long-term Strategic Memory simulation.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's ability for long-term planning and learning by installing its strategic memory management system.",
    parameters: [],
    implementationCode: `
        // --- Step 1: Write the Python script to the server ---
        console.log('[INFO] Writing Strategic Memory Python script to the server...');
        if (runtime.isServerConnected()) {
            try {
                await runtime.tools.run('Server File Writer', { 
                    filePath: 'strategic_memory.py', 
                    content: ${JSON.stringify(STRATEGIC_MEMORY_SCRIPT)} 
                });
                console.log('[INFO] Strategic Memory script written successfully.');
            } catch (e) {
                throw new Error(\`Failed to write script 'strategic_memory.py' to server: \${e.message}\`);
            }
        } else {
            console.log('[INFO] Server not connected. Skipping Python script creation. Strategy tools will be simulated.');
        }

        // --- Step 2: Create the tool definitions ---
        const toolPayloads = [
            ...${JSON.stringify(STRATEGY_TOOL_DEFINITIONS)},
            ${JSON.stringify(STRATEGIC_MEMORY_GRAPH_VIEWER_PAYLOAD)}
        ];
        
        for (const payload of toolPayloads) {
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                console.warn(\`[WARN] Client tool '\${payload.name}' might already exist. Skipping. Error: \${e.message}\`);
            }
        }
        
        if (runtime.isServerConnected()) {
            try {
                const { count } = await runtime.forceRefreshServerTools();
                console.log(\`[INFO] Client state synchronized with server. \${count} server tools loaded.\`);
            } catch (e) {
                console.error('[ERROR] Failed to force-refresh server tools after installation:', e);
            }
        }
        
        return { success: true, message: 'Strategic Cognition Suite installed successfully.' };
    `
};

export const STRATEGY_TOOLS: ToolCreatorPayload[] = [
    STRATEGY_INSTALLER_TOOL,
];