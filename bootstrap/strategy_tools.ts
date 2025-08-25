
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
        { name: 'isEmbedding', type: 'boolean', description: 'Whether node embeddings are being generated.', required: true },
        { name: 'nodeEmbeddings', type: 'object', description: 'A Map of node IDs to their vector embeddings.', required: true },
        { name: 'onRefresh', type: 'object', description: 'Callback function to refresh the graph data from the server.', required: true },
    ],
    implementationCode: `
        const mountRef = React.useRef(null);
        const simRef = React.useRef({});
        const [selectedNodeId, setSelectedNodeId] = React.useState(null);

        React.useEffect(() => {
            if (isLoading || isEmbedding || !graph || !graph.nodes || graph.nodes.length === 0) {
                if(mountRef.current) mountRef.current.innerHTML = '';
                return;
            }

            let isMounted = true;
            const sim = simRef.current;
            
            const init = async () => {
                if (!mountRef.current) return;

                try {
                    sim.THREE = await import('three');
                    const { OrbitControls: OC } = await import('three/addons/controls/OrbitControls.js');
                    sim.OrbitControls = OC;
                    sim.RAPIER = (await import('@dimforge/rapier3d-compat')).default;
                    await sim.RAPIER.init();
                } catch (e) {
                    console.error("Failed to load 3D libraries:", e);
                    if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error loading 3D libraries. Check console.</p>';
                    return;
                }
                
                if (!isMounted || !mountRef.current) return;

                const { nodes, edges } = graph;
                sim.nodeMap = new Map(nodes.map(n => [n.id, n]));

                sim.scene = new sim.THREE.Scene();
                sim.scene.background = new sim.THREE.Color(0x1a202c);
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
                sim.camera.position.z = 40;

                const NODE_CONFIG = {
                    Device: { color: 0x22c55e, radius: 2.5, shape: 'sphere' },
                    Component: { color: 0x3b82f6, radius: 1.0, shape: 'sphere' },
                    Pin: { color: 0x9ca3af, radius: 0.25, shape: 'sphere' },
                    MarketNeed: { color: 0xec4899, radius: 2.0, shape: 'box' },
                    Technology: { color: 0xf97316, radius: 2.0, shape: 'octahedron' },
                    default: { color: 0x64748b, radius: 1.5, shape: 'sphere' }
                };

                sim.world = new sim.RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
                sim.bodies = new Map();
                sim.meshes = new Map();

                nodes.forEach(node => {
                    const config = NODE_CONFIG[node.type] || NODE_CONFIG.default;
                    const { color, radius, shape } = config;
                    
                    let geo;
                    if (shape === 'box') geo = new sim.THREE.BoxGeometry(radius * 1.8, radius * 1.8, radius * 1.8);
                    else if (shape === 'octahedron') geo = new sim.THREE.OctahedronGeometry(radius, 0);
                    else geo = new sim.THREE.SphereGeometry(radius, 32, 16);
                    
                    const mat = new sim.THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true });
                    const mesh = new sim.THREE.Mesh(geo, mat);
                    mesh.userData.id = node.id;
                    mesh.userData.originalColor = color;
                    sim.scene.add(mesh);

                    const spriteMat = new sim.THREE.SpriteMaterial({ color: 0xffffff, depthTest: false, transparent: true, sizeAttenuation: false });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const fontSize = node.type === 'Pin' ? 24 : 32;
                    ctx.font = \`\${fontSize}px Arial\`;
                    const textWidth = ctx.measureText(node.label).width;
                    canvas.width = textWidth; canvas.height = fontSize * 1.25;
                    ctx.font = \`\${fontSize}px Arial\`; ctx.fillStyle = 'white';
                    ctx.fillText(node.label, 0, fontSize);
                    const texture = new sim.THREE.CanvasTexture(canvas);
                    spriteMat.map = texture;
                    const sprite = new sim.THREE.Sprite(spriteMat);
                    const spriteScale = node.type === 'Pin' ? 0.05 : 0.1;
                    sprite.scale.set(textWidth * spriteScale, fontSize * 1.25 * spriteScale, 1.0);
                    sprite.position.y = radius + 1.5;
                    mesh.add(sprite);
                    mesh.userData.labelSprite = sprite;
                    sim.meshes.set(node.id, mesh);

                    const bodyDesc = sim.RAPIER.RigidBodyDesc.dynamic().setLinearDamping(5.0);
                    const body = sim.world.createRigidBody(bodyDesc);
                    const colliderDesc = sim.RAPIER.ColliderDesc.ball(radius * 1.5);
                    sim.world.createCollider(colliderDesc, body);
                    sim.bodies.set(node.id, body);
                });

                sim.edges = [];
                edges.forEach(edge => {
                    const lineMat = new sim.THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
                    const lineGeo = new sim.THREE.BufferGeometry().setFromPoints([new sim.THREE.Vector3(), new sim.THREE.Vector3()]);
                    const line = new sim.THREE.Line(lineGeo, lineMat);
                    sim.scene.add(line);
                    let labelSprite = null;
                    if (edge.label) { /* ... label creation ... */ }
                    sim.edges.push({ line, labelSprite, source: edge.source, target: edge.target });
                });

                sim.raycaster = new sim.THREE.Raycaster();
                sim.mouse = new sim.THREE.Vector2();

                const onPointerDown = (event) => {
                    const rect = sim.renderer.domElement.getBoundingClientRect();
                    sim.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    sim.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    sim.raycaster.setFromCamera(sim.mouse, sim.camera);
                    const intersects = sim.raycaster.intersectObjects(Array.from(sim.meshes.values()), true);

                    if (intersects.length > 0) {
                        const clickedId = intersects[0].object.userData.id;
                        setSelectedNodeId(prevId => prevId === clickedId ? null : clickedId);
                    } else {
                        setSelectedNodeId(null); // Deselect on background click
                    }
                };
                sim.renderer.domElement.addEventListener('pointerdown', onPointerDown);

                const animate = () => { /* ... physics simulation ... */ };
                animate();
                
                return () => { /* ... cleanup ... */ };
            };
            
            const cleanupPromise = init();
            return () => { cleanupPromise.then(cleanup => cleanup && cleanup()); };

        }, [graph, isLoading, isEmbedding]);
        
        // --- Embedding similarity effect ---
        React.useEffect(() => {
            if (!simRef.current.meshes || !nodeEmbeddings) return;
            const sim = simRef.current;
            const cosineSimilarity = (a, b) => {
                if (!a || !b) return 0;
                let dotProduct = 0;
                for (let i = 0; i < a.length; i++) dotProduct += a[i] * b[i];
                return dotProduct;
            };

            if (!selectedNodeId) {
                // Restore all opacities if nothing is selected
                sim.meshes.forEach(mesh => {
                    mesh.material.opacity = 1.0;
                    if(mesh.userData.labelSprite) mesh.userData.labelSprite.material.opacity = 1.0;
                });
                sim.edges.forEach(edge => {
                    edge.line.material.opacity = 0.5;
                });
                return;
            }

            const selectedEmbedding = nodeEmbeddings.get(selectedNodeId);
            if (!selectedEmbedding) return;

            sim.meshes.forEach((mesh, id) => {
                const nodeEmbedding = nodeEmbeddings.get(id);
                const similarity = cosineSimilarity(selectedEmbedding, nodeEmbedding);
                const opacity = 0.1 + (0.9 * Math.max(0, similarity) ** 2);
                mesh.material.opacity = opacity;
                if(mesh.userData.labelSprite) mesh.userData.labelSprite.material.opacity = opacity;
            });
            
            sim.edges.forEach(edge => {
                const sourceOpacity = sim.meshes.get(edge.source)?.material.opacity || 0.1;
                const targetOpacity = sim.meshes.get(edge.target)?.material.opacity || 0.1;
                edge.line.material.opacity = Math.min(sourceOpacity, targetOpacity) * 0.5;
            });

        }, [selectedNodeId, nodeEmbeddings]);

        const loadingText = isLoading ? "Loading Strategic Memory..." : "Generating Embeddings...";
        if (isLoading || isEmbedding) {
            return (
                <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-300"></div>
                    <p className="text-yellow-300 mt-3">{loadingText}</p>
                </div>
            );
        }

        return (
            <div className="bg-gray-800/80 border-2 border-yellow-500/60 rounded-xl p-2 shadow-lg flex flex-col h-full relative">
                <div className="absolute top-4 left-4 z-10 text-lg font-bold text-yellow-300">Innovation Knowledge Graph</div>
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
