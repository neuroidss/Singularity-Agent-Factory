
import React from 'react';
import type { ToolCreatorPayload } from '../types';

const RAPIER_LAYOUT_TOOL: ToolCreatorPayload = {
    name: 'Rapier 3D Physics Layout',
    description: 'An interactive 3D view for arranging PCB components using a force-directed physics simulation with Rapier3D and Three.js.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a powerful and intuitive user interface for the critical step of component placement in PCB design.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph data including nodes, edges, and board outline.', required: true },
        { name: 'onCommit', type: 'object', description: 'Callback function to commit the final component positions.', required: true },
        { name: 'isLayoutInteractive', type: 'boolean', description: 'Flag to determine if the commit button should be active.', required: true },
        { name: 'serverUrl', type: 'string', description: 'The base URL of the backend server for loading assets.', required: true },
    ],
    implementationCode: `
        const mountRef = React.useRef(null);
        const simulationRef = React.useRef({}); // Holds all simulation state
        const onCommitRef = React.useRef(onCommit);
        onCommitRef.current = onCommit;
    
        React.useEffect(() => {
            if (!graph || !graph.nodes || graph.nodes.length === 0) {
                return;
            }
            
            let isMounted = true;
            const sim = simulationRef.current;
            const SCALE = 0.5; // Scale down components for better fit
            
            const pcbHeight = 1.6;
            sim.componentHeight = 1.0;
            const COMPONENT_Y_TOP = pcbHeight / 2 + sim.componentHeight / 2; // Place components right on top of the PCB surface
            const COMPONENT_Y_BOTTOM = -(pcbHeight / 2 + sim.componentHeight / 2); // Place components right on the bottom of the PCB surface

            // Collision Groups to prevent components from sticking to the board
            const GROUP_PCB = 0x00010000; // Member of 1, interacts with none
            const GROUP_COMPONENT = 0x00020006; // Member of 2, interacts with 2 (self) and 4 (walls)
            const GROUP_WALLS = 0x00040002; // Member of 4, interacts with 2 (components)
            
            const physicsParams = {
                pinAttraction: 100.0,
                separationForce: 500.0,
                separationFactor: 3,
                centerAttraction: 100.0,
                boardGravity: 50.0,
                linearDamping: 500.0,
                angularDamping: 500.0,
                gridAttraction: 2000.0,
                angleAttraction: 2000.0,
                keepoutMargin: 1.0, // Default 1mm keep-out margin
            };
            const initialPhysicsParams = { ...physicsParams };

            const snappingParams = {
                enabled: false,
                gridSize: 2.54,
                angleSnap: 45,
            };

            const simulationControls = {
                isSimulating: true,
                resetPositions: () => {
                    if (!sim.initializePositions) return;
                    sim.initializePositions();
                },
                resetParameters: () => {
                    Object.assign(physicsParams, initialPhysicsParams);
                    if (sim.gui) {
                        sim.gui.controllers.forEach(c => c.updateDisplay());
                    }
                }
            };
    
            const init = async () => {
                if (!mountRef.current) return;
    
                try {
                    sim.RAPIER = (await import('@dimforge/rapier3d-compat')).default;
                    await sim.RAPIER.init();
                    sim.THREE = await import('three');
                    const { OrbitControls: OC } = await import('three/addons/controls/OrbitControls.js');
                    const { GLTFLoader: GLTF } = await import('three/addons/loaders/GLTFLoader.js');
                    const { GUI } = await import('lil-gui');
                    sim.OrbitControls = OC;
                    sim.GLTFLoader = GLTF;
                    sim.GUI = GUI;
                } catch (e) {
                    console.error("Failed to load 3D/UI libraries:", e);
                    if(mountRef.current) mountRef.current.innerHTML = '<p class="text-red-400">Error loading 3D/UI libraries. Check console.</p>';
                    return;
                }

                if (!isMounted || !mountRef.current) return;

                const { board_outline, nodes, edges } = graph;
                
                // Add radius to node objects
                nodes.forEach((node) => {
                    node.radius = Math.hypot(node.width * SCALE, node.height * SCALE) / 2.0;
                });
                sim.nodeMap = new Map(nodes.map(node => [node.id, node]));

                // Pre-calculate node degrees (number of component-to-component connections)
                sim.nodeDegrees = new Map();
                nodes.forEach(node => sim.nodeDegrees.set(node.id, 0));
                const connections = new Set();
                edges.forEach(edge => {
                    const sourceRef = edge.source.split('-')[0];
                    const targetRef = edge.target.split('-')[0];
                    if (sourceRef !== targetRef) {
                        const connKey1 = \`\${sourceRef}---\${targetRef}\`;
                        const connKey2 = \`\${targetRef}---\${sourceRef}\`;
                        if (!connections.has(connKey1) && !connections.has(connKey2)) {
                            sim.nodeDegrees.set(sourceRef, (sim.nodeDegrees.get(sourceRef) || 0) + 1);
                            sim.nodeDegrees.set(targetRef, (sim.nodeDegrees.get(targetRef) || 0) + 1);
                            connections.add(connKey1);
                        }
                    }
                });


                sim.scaledBoard = {
                    width: board_outline.width * SCALE,
                    height: board_outline.height * SCALE,
                    x: board_outline.x * SCALE,
                    y: board_outline.y * SCALE,
                };
                sim.boardCenter = new sim.THREE.Vector3(sim.scaledBoard.x + sim.scaledBoard.width / 2, 0, sim.scaledBoard.y + sim.scaledBoard.height / 2);

    
                // Scene setup
                sim.scene = new sim.THREE.Scene();
                sim.scene.background = new sim.THREE.Color(0x111827);
                sim.camera = new sim.THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
                sim.renderer = new sim.THREE.WebGLRenderer({ antialias: true });
                sim.renderer.setPixelRatio(window.devicePixelRatio);
                sim.renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
                mountRef.current.innerHTML = '';
                mountRef.current.appendChild(sim.renderer.domElement);
                
                sim.textureLoader = new sim.THREE.TextureLoader();
                sim.gltfLoader = new sim.GLTFLoader();
    
                // Lighting
                sim.scene.add(new sim.THREE.AmbientLight(0xffffff, 1.0));
                const dirLight = new sim.THREE.DirectionalLight(0xffffff, 2.0);
                dirLight.position.set(10, 20, 5);
                sim.scene.add(dirLight);
    
                // Controls
                sim.controls = new sim.OrbitControls(sim.camera, sim.renderer.domElement);
                sim.controls.enableDamping = true;
                
                // --- Camera Framing Logic ---
                sim.controls.target.set(sim.boardCenter.x, 0, sim.boardCenter.z);
                const boardDiagonal = Math.hypot(sim.scaledBoard.width, sim.scaledBoard.height);
                const fov = sim.camera.fov * (Math.PI / 180);
                const PADDING = 1.5;
                const distance = (boardDiagonal / 2 * PADDING) / Math.tan(fov / 2);

                const angle = sim.THREE.MathUtils.degToRad(60);
                const cameraY = distance * Math.sin(angle);
                const cameraZOffset = distance * Math.cos(angle);
                sim.camera.position.set(sim.boardCenter.x, cameraY, sim.boardCenter.z + cameraZOffset);
                sim.camera.far = (sim.camera.position.distanceTo(sim.controls.target) + boardDiagonal) * 2;
                sim.camera.updateProjectionMatrix();
                sim.controls.update();
    
                // Physics setup
                sim.world = new sim.RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 }); // Custom gravity
    
                // PCB Body
                let groundDesc = sim.RAPIER.RigidBodyDesc.fixed().setTranslation(sim.boardCenter.x, 0, sim.boardCenter.z);
                let groundBody = sim.world.createRigidBody(groundDesc);
                let groundColliderDesc = sim.RAPIER.ColliderDesc.cuboid(sim.scaledBoard.width / 2, pcbHeight / 2, sim.scaledBoard.height / 2)
                    .setCollisionGroups(GROUP_PCB);
                sim.world.createCollider(groundColliderDesc, groundBody);
    
                const pcbGeo = new sim.THREE.BoxGeometry(sim.scaledBoard.width, pcbHeight, sim.scaledBoard.height);
                const pcbMat = new sim.THREE.MeshStandardMaterial({ color: 0x004400, roughness: 0.5 });
                const pcbMesh = new sim.THREE.Mesh(pcbGeo, pcbMat);
                pcbMesh.position.copy(groundBody.translation());
                sim.scene.add(pcbMesh);

                // Invisible containment box
                const wallThickness = 1;
                const boundsHeight = 50;
                const boundsWidth = sim.scaledBoard.width + 2 * wallThickness;
                const boundsDepth = sim.scaledBoard.height + 2 * wallThickness;
                
                // Side Walls
                const wallPositions = [
                    { x: sim.boardCenter.x, z: sim.boardCenter.z - boundsDepth / 2, hx: boundsWidth / 2, hz: wallThickness / 2 }, // Front
                    { x: sim.boardCenter.x, z: sim.boardCenter.z + boundsDepth / 2, hx: boundsWidth / 2, hz: wallThickness / 2 }, // Back
                    { x: sim.boardCenter.x - boundsWidth / 2, z: sim.boardCenter.z, hx: wallThickness / 2, hz: boundsDepth / 2 }, // Left
                    { x: sim.boardCenter.x + boundsWidth / 2, z: sim.boardCenter.z, hx: wallThickness / 2, hz: boundsDepth / 2 }  // Right
                ];
                wallPositions.forEach(p => {
                    let wallBody = sim.world.createRigidBody(sim.RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, 0, p.z));
                    sim.world.createCollider(sim.RAPIER.ColliderDesc.cuboid(p.hx, boundsHeight / 2, p.hz).setCollisionGroups(GROUP_WALLS), wallBody);
                });
                
                // Top and Bottom planes
                const topPlaneY = COMPONENT_Y_TOP + 10;
                const bottomPlaneY = COMPONENT_Y_BOTTOM - 10;
                let topPlaneBody = sim.world.createRigidBody(sim.RAPIER.RigidBodyDesc.fixed().setTranslation(sim.boardCenter.x, topPlaneY, sim.boardCenter.z));
                sim.world.createCollider(sim.RAPIER.ColliderDesc.cuboid(boundsWidth / 2, wallThickness / 2, boundsDepth / 2).setCollisionGroups(GROUP_WALLS), topPlaneBody);
                
                let bottomPlaneBody = sim.world.createRigidBody(sim.RAPIER.RigidBodyDesc.fixed().setTranslation(sim.boardCenter.x, bottomPlaneY, sim.boardCenter.z));
                sim.world.createCollider(sim.RAPIER.ColliderDesc.cuboid(boundsWidth / 2, wallThickness / 2, boundsDepth / 2).setCollisionGroups(GROUP_WALLS), bottomPlaneBody);

    
                // Component Bodies & Meshes
                sim.bodies = new Map();
                sim.meshes = new Map();
                sim.pinMeshes = new Map(); // For quick lookup of pin meshes
                
                const pinMaterial = new sim.THREE.MeshBasicMaterial({ color: 0xffff00 });
                const pinGeometry = new sim.THREE.SphereGeometry(0.3, 8, 8);
                
                sim.initializePositions = () => {
                    const numNodes = nodes.length;
                    if (numNodes === 0) return;

                    const numCols = Math.ceil(Math.sqrt(numNodes));
                    const numRows = Math.ceil(numNodes / numCols);

                    const cellWidth = sim.scaledBoard.width / numCols;
                    const cellHeight = sim.scaledBoard.height / numRows;

                    const startX = sim.scaledBoard.x + cellWidth / 2;
                    const startZ = sim.scaledBoard.y + cellHeight / 2;

                    nodes.forEach((node, i) => {
                        const body = sim.bodies.get(node.id);
                        const mesh = sim.meshes.get(node.id);
                        if (body && mesh) {
                            const row = Math.floor(i / numCols);
                            const col = i % numCols;

                            const x = startX + col * cellWidth;
                            const z = startZ + row * cellHeight;
                            const y = COMPONENT_Y_TOP;

                            const positionVec = new sim.RAPIER.Vector3(x, y, z);
                            
                            if (body.isFixed()) {
                                body.setBodyType(sim.RAPIER.RigidBodyType.Dynamic, true);
                            }

                            body.setTranslation(positionVec, true);
                            body.setRotation({ w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, true);
                            body.setLinvel(new sim.RAPIER.Vector3(0, 0, 0), true);
                            body.setAngvel(new sim.RAPIER.Vector3(0, 0, 0), true);
                            body.resetForces(true);
                            body.resetTorques(true);

                            mesh.userData.side = 'top';
                        }
                    });
                };
                
                const createFallbackBox = (node) => {
                    const scaledWidth = node.width * SCALE;
                    const scaledHeight = node.height * SCALE;
                    const geo = new sim.THREE.BoxGeometry(scaledWidth, sim.componentHeight, scaledHeight);
                    const defaultMaterial = new sim.THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8, emissive: 0x000000 });
                    const materials = Array(6).fill(null).map(() => defaultMaterial.clone());
                    
                    if (node.svgPath) {
                        const topMaterial = new sim.THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8, emissive: 0x000000 });
                        const fullSvgUrl = \`\${serverUrl}/\${node.svgPath.replace(/\\\\/g, '/')}\`;
                        sim.textureLoader.load(fullSvgUrl,
                            (texture) => {
                                texture.flipY = false;
                                topMaterial.map = texture;
                                topMaterial.needsUpdate = true;
                            },
                            undefined,
                            (err) => { console.warn(\`Could not load SVG for \${node.id}\`, err); }
                        );
                        materials[2] = topMaterial; // Top face
                    }
                    return new sim.THREE.Mesh(geo, materials);
                };

                nodes.forEach((node) => {
                    const scaledWidth = node.width * SCALE;
                    const scaledHeight = node.height * SCALE;
                    const bodyDesc = sim.RAPIER.RigidBodyDesc.dynamic()
                        .setLinearDamping(physicsParams.linearDamping)
                        .setAngularDamping(physicsParams.angularDamping)
                        .enabledRotations(false, true, false); // Lock X and Z rotation
    
                    const body = sim.world.createRigidBody(bodyDesc);
                    
                    // --- Compound Collider Shape for Component + Keepout ---

                    // 1. Main keep-out collider for the component body. This is larger than the visual model.
                    const keepoutMarginScaled = physicsParams.keepoutMargin * SCALE;
                    const mainColliderDesc = sim.RAPIER.ColliderDesc.cuboid(
                        (scaledWidth / 2) + keepoutMarginScaled,
                        sim.componentHeight / 2,
                        (scaledHeight / 2) + keepoutMarginScaled
                    )
                    .setCollisionGroups(GROUP_COMPONENT);
                    sim.world.createCollider(mainColliderDesc, body);

                    // 2. Individual colliders for each pin to create a keep-out area around them.
                    const pinBaseSize = 0.4 * SCALE; // Aprox physical pin size
                    const pinKeepoutColliderSize = pinBaseSize + (keepoutMarginScaled * 2); // Diameter of pin keepout
                    
                    node.pins.forEach(pin => {
                        const pinColliderDesc = sim.RAPIER.ColliderDesc.cuboid(
                            pinKeepoutColliderSize / 2, 
                            sim.componentHeight / 2, 
                            pinKeepoutColliderSize / 2
                        )
                        .setTranslation(pin.x * SCALE, 0, pin.y * SCALE) // Position relative to the body center
                        .setCollisionGroups(GROUP_COMPONENT);
                        sim.world.createCollider(pinColliderDesc, body);
                    });

                    sim.bodies.set(node.id, body);
    
                    const componentGroup = new sim.THREE.Group();
                    componentGroup.userData = { rapierBody: body, id: node.id, side: 'top' };
                    sim.scene.add(componentGroup);
                    sim.meshes.set(node.id, componentGroup);
                    
                    const visualGroup = new sim.THREE.Group();
                    visualGroup.rotation.x = Math.PI; // Start face up
                    componentGroup.add(visualGroup);

                    if (node.glbPath) {
                        sim.gltfLoader.load(
                             \`\${serverUrl}/\${node.glbPath.replace(/\\\\/g, '/')}\`,
                             (gltf) => {
                                const model = gltf.scene;
                                const props = node.model3d_props;
                                if (props) {
                                     model.scale.set(props.scale.x, props.scale.y, props.scale.z);
                                     model.position.set(props.offset.x, props.offset.z, -props.offset.y);
                                     model.rotation.set(
                                        sim.THREE.MathUtils.degToRad(props.rotation.x),
                                        sim.THREE.MathUtils.degToRad(props.rotation.z),
                                        sim.THREE.MathUtils.degToRad(-props.rotation.y)
                                     );
                                }
                                visualGroup.add(model);
                             },
                             undefined,
                             (error) => {
                                console.error(\`Failed to load GLB for \${node.id}: \`, error);
                                visualGroup.add(createFallbackBox(node));
                             }
                        );
                    } else {
                        visualGroup.add(createFallbackBox(node));
                    }
    
                    node.pins.forEach(pin => {
                        const pinMesh = new sim.THREE.Mesh(pinGeometry, pinMaterial);
                        pinMesh.position.set(pin.x * SCALE, (sim.componentHeight / 2) + 0.1, pin.y * SCALE);
                        pinMesh.userData = { nodeId: node.id, pinName: pin.name };
                        visualGroup.add(pinMesh);
                        sim.pinMeshes.set(\`\${node.id}-\${pin.name}\`, pinMesh);
                    });
                });
                
                sim.initializePositions();
    
                sim.netLines = [];
                edges.forEach(() => {
                    const material = new sim.THREE.LineBasicMaterial({
                        color: 0x99ff99,
                        transparent: true,
                        opacity: 0.7,
                        depthTest: false,
                        depthWrite: false
                    });
                    const geometry = new sim.THREE.BufferGeometry().setFromPoints([new sim.THREE.Vector3(), new sim.THREE.Vector3()]);
                    const line = new sim.THREE.Line(geometry, material);
                    line.renderOrder = 999; // Render on top of everything
                    sim.scene.add(line);
                    sim.netLines.push(line);
                });
    
                // Interaction state
                sim.raycaster = new sim.THREE.Raycaster();
                sim.dragPlane = new sim.THREE.Plane(new sim.THREE.Vector3(0, 1, 0), 0);
                sim.hoveredObject = null;
                sim.isDragging = false;
                sim.draggedObject = null;
                sim.draggedBody = null;
                sim.lastClickTime = 0;
                sim.lastClickedObject = null;
                
                // State for drag-and-throw
                sim.lastDragPosition = null;
                sim.currentDragVelocity = null;
                sim.lastDragTime = 0;

    
                sim.renderer.domElement.addEventListener('pointerdown', onPointerDown);
                sim.renderer.domElement.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('keydown', onKeyDown);
                
                const updateGridHelper = () => {
                    if (sim.gridHelper) {
                        sim.scene.remove(sim.gridHelper);
                        sim.gridHelper.geometry.dispose();
                        sim.gridHelper.material.dispose();
                        sim.gridHelper = null;
                    }
                    if (!snappingParams.enabled || snappingParams.gridSize <= 0) return;
                    const scaledGridSize = snappingParams.gridSize * SCALE;
                    const gridSize = Math.ceil(Math.max(sim.scaledBoard.width, sim.scaledBoard.height) / scaledGridSize) * scaledGridSize * 1.2;
                    const divisions = Math.floor(gridSize / scaledGridSize);
                    sim.gridHelper = new sim.THREE.GridHelper(gridSize, divisions, 0x555555, 0x333333);
                    sim.gridHelper.position.set(sim.boardCenter.x, pcbHeight / 2 + 0.01, sim.boardCenter.z);
                    sim.scene.add(sim.gridHelper);
                };

                // GUI Setup
                sim.gui = new sim.GUI();
                const snapFolder = sim.gui.addFolder('Snapping & Grid');
                snapFolder.add(snappingParams, 'enabled').name('Enable Snapping').onChange(updateGridHelper);
                snapFolder.add(snappingParams, 'gridSize', { 'Off': 0, '5.08mm (200mil)': 5.08, '2.54mm (100mil)': 2.54, '1.27mm (50mil)': 1.27, '0.635mm (25mil)': 0.635, '0.5mm': 0.5, '0.254mm (10mil)': 0.254, '0.1mm': 0.1, }).name('Grid Snap').onChange(updateGridHelper);
                snapFolder.add(snappingParams, 'angleSnap', { 'Off': 0, '90°': 90, '45°': 45, '30°': 30, '15°': 15 }).name('Angle Snap');

                const controlsFolder = sim.gui.addFolder('Controls');
                controlsFolder.add(simulationControls, 'isSimulating').name('Run Simulation');
                controlsFolder.add(simulationControls, 'resetPositions').name('Reset Positions');
                controlsFolder.add(simulationControls, 'resetParameters').name('Reset Parameters');

                const physFolder = sim.gui.addFolder('Physics Parameters');
                physFolder.add(physicsParams, 'pinAttraction', 0, 2000).step(1).name('Pin Attraction');
                physFolder.add(physicsParams, 'separationForce', 0, 2000).step(1).name('Separation Force');
                physFolder.add(physicsParams, 'separationFactor', 1.0, 10.0).step(0.1).name('Separation Factor');
                physFolder.add(physicsParams, 'centerAttraction', 0, 2000).step(1).name('Center Attraction');
                physFolder.add(physicsParams, 'boardGravity', 0, 100).step(1).name('Board Gravity');
                physFolder.add(physicsParams, 'linearDamping', 0, 2000).step(1).name('Linear Damping');
                physFolder.add(physicsParams, 'angularDamping', 0, 2000).step(1).name('Angular Damping');
                physFolder.add(physicsParams, 'gridAttraction', 0, 2000).step(1).name('Grid Attraction');
                physFolder.add(physicsParams, 'angleAttraction', 0, 2000).step(1).name('Angle Attraction');
                physFolder.add(physicsParams, 'keepoutMargin', 0, 5).step(0.1).name('Keep-out Margin (mm)');
    
                updateGridHelper();

                const handleResize = () => {
                    if (!isMounted || !mountRef.current || !sim.renderer) return;
                    const container = mountRef.current;
                    const width = container.clientWidth;
                    const height = container.clientHeight;

                    sim.camera.aspect = width / height;
                    sim.camera.updateProjectionMatrix();
                    sim.renderer.setSize(width, height);
                };

                window.addEventListener('resize', handleResize);
                handleResize(); // Initial call to set size correctly

                animate();
            };
    
            const getPinPosition = (nodeId, pinName) => {
                const pinKey = \`\${nodeId}-\${pinName}\`;
                const pinMesh = sim.pinMeshes.get(pinKey);
                if (!pinMesh) {
                    const body = sim.bodies.get(nodeId);
                    if (body) return new sim.THREE.Vector3().copy(body.translation());
                    return null;
                }
                return pinMesh.getWorldPosition(new sim.THREE.Vector3());
            };
    
            const animate = () => {
                if (!isMounted || !sim.renderer) return;
    
                if (simulationControls.isSimulating) {
                    sim.bodies.forEach(body => {
                        if (body.isDynamic()) {
                            body.resetForces(true);
                            body.resetTorques(true);
                            body.setLinearDamping(physicsParams.linearDamping);
                            body.setAngularDamping(physicsParams.angularDamping);
                        }
                    });
                    
                    const bodyEntries = Array.from(sim.bodies.entries());

                    // --- CONTINUOUS SNAPPING FORCES ---
                    if (snappingParams.enabled) {
                        sim.bodies.forEach((body, id) => {
                            if (!body.isDynamic()) return;
                            
                            const bodyMass = body.mass();
                            const bodyInertia = body.effectiveAngularInertia().y;
                    
                            // --- Position Snapping (Grid Attraction) ---
                            if (snappingParams.gridSize > 0 && physicsParams.gridAttraction > 0) {
                                const scaledGridSize = snappingParams.gridSize * SCALE;
                                const boardOriginX = sim.scaledBoard.x;
                                const boardOriginZ = sim.scaledBoard.y;
                    
                                const currentPos = body.translation();
                    
                                const snappedX = Math.round((currentPos.x - boardOriginX) / scaledGridSize) * scaledGridSize + boardOriginX;
                                const snappedZ = Math.round((currentPos.z - boardOriginZ) / scaledGridSize) * scaledGridSize + boardOriginZ;
                                
                                const forceDirection = {
                                    x: snappedX - currentPos.x,
                                    y: 0,
                                    z: snappedZ - currentPos.z
                                };
                                
                                const gridForce = new sim.RAPIER.Vector3(
                                    forceDirection.x * physicsParams.gridAttraction * bodyMass,
                                    0,
                                    forceDirection.z * physicsParams.gridAttraction * bodyMass
                                );
                                
                                body.addForce(gridForce, true);
                            }
                    
                            // --- Rotation Snapping (Angle Attraction) ---
                            if (snappingParams.angleSnap > 0 && physicsParams.angleAttraction > 0 && bodyInertia > 0) {
                                const snapAngleRad = sim.THREE.MathUtils.degToRad(snappingParams.angleSnap);
                    
                                const currentRot = body.rotation();
                                const euler = new sim.THREE.Euler().setFromQuaternion(new sim.THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w), 'YXZ');
                                
                                const targetAngleRad = Math.round(euler.y / snapAngleRad) * snapAngleRad;
                                
                                let angleError = targetAngleRad - euler.y;
                                
                                while (angleError <= -Math.PI) angleError += 2 * Math.PI;
                                while (angleError > Math.PI) angleError -= 2 * Math.PI;
                    
                                const torque = new sim.RAPIER.Vector3(0, angleError * physicsParams.angleAttraction * bodyInertia, 0);
                                body.addTorque(torque, true);
                            }
                        });
                    }

                    // 1. Repulsion and Global Forces
                    for (let i = 0; i < bodyEntries.length; i++) {
                        const [idA, bodyA] = bodyEntries[i];
                        if (!bodyA.isDynamic()) continue;
                        
                        const massA = bodyA.mass();
                        if (massA <= 0) continue;

                        const posA = bodyA.translation();
                        const meshA = sim.meshes.get(idA);
                        const nodeA = sim.nodeMap.get(idA);
                        if (!nodeA || !meshA) continue;
                        
                        // Center Attraction (per-body)
                        const vectorToCenter = { x: sim.boardCenter.x - posA.x, y: 0, z: sim.boardCenter.z - posA.z };
                        const centerForceVec = new sim.RAPIER.Vector3(
                            vectorToCenter.x * physicsParams.centerAttraction * massA, 
                            0, 
                            vectorToCenter.z * physicsParams.centerAttraction * massA
                        );
                        bodyA.addForce(centerForceVec, true);
                        
                        // Board Side "Gravity" (PD Controller for Y-axis stabilization)
                        const targetY = meshA.userData.side === 'top' ? COMPONENT_Y_TOP : COMPONENT_Y_BOTTOM;
                        const posErrorY = targetY - posA.y;
                        const velY = bodyA.linvel().y;

                        // Proportional term (the "spring")
                        const springConstant = physicsParams.boardGravity;
                        const springForce = springConstant * posErrorY * massA;

                        // Derivative term (the "damper") to prevent oscillation
                        // For a critically damped spring, Kd = 2 * sqrt(m * Kp_eff). Here Kp_eff = springConstant * massA.
                        // So, Kd_eff = 2 * massA * sqrt(springConstant)
                        const dampingCoefficient = 2 * Math.sqrt(springConstant) * massA;
                        const dampingForce = -dampingCoefficient * velY;
                        
                        const restoringForce = new sim.RAPIER.Vector3(0, springForce + dampingForce, 0);
                        bodyA.addForce(restoringForce, true);


                        // Separation Force (Repulsion-only spring)
                        for (let j = i + 1; j < bodyEntries.length; j++) {
                            const [idB, bodyB] = bodyEntries[j];
                            const nodeB = sim.nodeMap.get(idB);
                            const meshB = sim.meshes.get(idB);
                            if (!nodeB || !meshB || !bodyB.isDynamic()) continue;
                            
                            const massB = bodyB.mass();
                            if (massB <= 0) continue;

                            if (meshA.userData.side !== meshB.userData.side) continue;

                            const posB = bodyB.translation();
                            const deltaX = posA.x - posB.x;
                            const deltaZ = posA.z - posB.z;
                            const distSq = deltaX * deltaX + deltaZ * deltaZ;

                            if (distSq > 1e-6) {
                                const dist = Math.sqrt(distSq);
                                const targetDistance = (nodeA.radius + nodeB.radius) * physicsParams.separationFactor;

                                if (dist < targetDistance) {
                                    const penetration = targetDistance - dist;
                                    const combinedMass = Math.sqrt(massA * massB); // Geometric mean of masses
                                    const forceMag = physicsParams.separationForce * penetration * combinedMass;
                                    const scalar = forceMag / dist;
                                    
                                    const forceVector = { x: deltaX * scalar, y: 0, z: deltaZ * scalar };
                                    
                                    bodyA.addForce(forceVector, true);
                                    bodyB.addForce({ x: -forceVector.x, y: 0, z: -forceVector.z }, true);
                                }
                            }
                        }
                    }

                    // 2. Pin Attraction (Springs)
                    graph.edges.forEach((edge) => {
                        const [sourceRef, sourcePinName] = edge.source.split('-');
                        const [targetRef, targetPinName] = edge.target.split('-');
                        const bodyA = sim.bodies.get(sourceRef);
                        const bodyB = sim.bodies.get(targetRef);
                        const pinA_world = getPinPosition(sourceRef, sourcePinName);
                        const pinB_world = getPinPosition(targetRef, targetPinName);

                        if (bodyA && bodyB && pinA_world && pinB_world && sourceRef !== targetRef) {
                            const massA = bodyA.mass();
                            const massB = bodyB.mass();
                            if (massA <= 0 || massB <= 0) return;

                            const combinedMass = Math.sqrt(massA * massB);
                            const delta = pinB_world.clone().sub(pinA_world);
                            const force = delta.multiplyScalar(physicsParams.pinAttraction * combinedMass);
                            
                            const rapierForce = new sim.RAPIER.Vector3(force.x, 0, force.z);
                            
                            // Apply force at the pin's XZ location, but at the body's Y center-of-mass to avoid unwanted torque.
                            const rapierPinA_at_com_y = new sim.RAPIER.Vector3(pinA_world.x, bodyA.translation().y, pinA_world.z);
                            const rapierPinB_at_com_y = new sim.RAPIER.Vector3(pinB_world.x, bodyB.translation().y, pinB_world.z);
                            
                            const oppositeForce = { x: -rapierForce.x, y: -rapierForce.y, z: -rapierForce.z };

                            if(bodyA.isDynamic()) bodyA.addForceAtPoint(rapierForce, rapierPinA_at_com_y, true);
                            if(bodyB.isDynamic()) bodyB.addForceAtPoint(oppositeForce, rapierPinB_at_com_y, true);
                        }
                    });

                    sim.world.step();
                }

                graph.edges.forEach((edge, i) => {
                    const line = sim.netLines[i];
                    if (line) {
                        const [sourceRef, sourcePinName] = edge.source.split('-');
                        const [targetRef, targetPinName] = edge.target.split('-');
                        const pos1 = getPinPosition(sourceRef, sourcePinName);
                        const pos2 = getPinPosition(targetRef, targetPinName);
                        if (pos1 && pos2) {
                            line.geometry.setFromPoints([pos1, pos2]);
                        }
                    }
                });
    
                sim.meshes.forEach(mesh => {
                    const body = mesh.userData.rapierBody;
                    const pos = body.translation();
                    const rot = body.rotation();
                    mesh.position.set(pos.x, pos.y, pos.z);
                    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
                });
    
                sim.controls.update();
                sim.renderer.render(sim.scene, sim.camera);
                sim.animationFrameId = requestAnimationFrame(animate);
            };

            const updateMousePosition = (event) => {
                 if (!sim.renderer || !sim.renderer.domElement) return new sim.THREE.Vector2(0,0);
                 const rect = sim.renderer.domElement.getBoundingClientRect();
                 return new sim.THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                 );
            };
            
            const onPointerDown = (event) => {
                const now = Date.now();
                if (sim.hoveredObject) {
                    if (sim.hoveredObject === sim.lastClickedObject && now - sim.lastClickTime < 300) {
                        // Double-click to flip
                        event.preventDefault();
                        const body = sim.hoveredObject.userData.rapierBody;
                        const mesh = sim.hoveredObject;
                        const visualGroup = mesh.children[0];

                        mesh.userData.side = mesh.userData.side === 'top' ? 'bottom' : 'top';
                        const currentPos = body.translation();
                        const newY = mesh.userData.side === 'top' ? COMPONENT_Y_TOP : COMPONENT_Y_BOTTOM;
                        
                        body.setTranslation({ x: currentPos.x, y: newY, z: currentPos.z }, true);
                        body.setLinvel({ x: 0, y: 0, z: 0 }, true); // Stop momentum on flip
                        visualGroup.rotation.x = mesh.userData.side === 'top' ? Math.PI : 0;

                        sim.lastClickTime = 0;
                        sim.lastClickedObject = null;
                        return;
                    }

                    // Single-click to start drag
                    sim.lastClickTime = now;
                    sim.lastClickedObject = sim.hoveredObject;

                    sim.controls.enabled = false;
                    sim.isDragging = true;
                    sim.draggedObject = sim.hoveredObject;
                    sim.draggedBody = sim.draggedObject.userData.rapierBody;

                    sim.lastDragPosition = sim.draggedBody.translation();
                    sim.lastDragTime = performance.now();
                    sim.currentDragVelocity = new sim.RAPIER.Vector3(0, 0, 0);

                    const mouse = updateMousePosition(event);
                    sim.raycaster.setFromCamera(mouse, sim.camera);
                    const bodyPosition = sim.draggedBody.translation();
                    const threeBodyPosition = new sim.THREE.Vector3(bodyPosition.x, bodyPosition.y, bodyPosition.z);
                    sim.dragPlane.setFromNormalAndCoplanarPoint(new sim.THREE.Vector3(0, 1, 0), threeBodyPosition);
                }
            };
    
            const onPointerMove = (event) => {
                 const mouse = updateMousePosition(event);
                 sim.raycaster.setFromCamera(mouse, sim.camera);

                if (sim.isDragging && sim.draggedBody) {
                    const intersection = new sim.THREE.Vector3();
                    if(sim.raycaster.ray.intersectPlane(sim.dragPlane, intersection)) {
                        const now = performance.now();
                        const deltaTime = (now - sim.lastDragTime) / 1000.0;
                        
                        const currentPos = sim.draggedBody.translation();
                        const newPos = new sim.RAPIER.Vector3(intersection.x, currentPos.y, intersection.z);
                        
                        sim.draggedBody.setTranslation(newPos, true);

                        if (deltaTime > 0.001) {
                            const velocity = {
                                x: (newPos.x - sim.lastDragPosition.x) / deltaTime,
                                y: (newPos.y - sim.lastDragPosition.y) / deltaTime,
                                z: (newPos.z - sim.lastDragPosition.z) / deltaTime,
                            };
                            sim.currentDragVelocity.x = velocity.x;
                            sim.currentDragVelocity.y = velocity.y;
                            sim.currentDragVelocity.z = velocity.z;
                        }
                        
                        sim.lastDragPosition = newPos;
                        sim.lastDragTime = now;
                    }
                } else {
                    const intersects = sim.raycaster.intersectObjects(Array.from(sim.meshes.values()), true);
                    let newHovered = null;
                    if (intersects.length > 0) {
                        let object = intersects[0].object;
                        while(object.parent && !object.userData.rapierBody) {
                            object = object.parent;
                        }
                        if (object.userData.rapierBody) {
                           newHovered = object;
                        }
                    }

                    if (sim.hoveredObject !== newHovered) {
                         const unhighlightColor = 0x000000;
                         if (sim.hoveredObject) {
                             sim.hoveredObject.traverse(child => {
                                 if(child.isMesh) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(m => { if (m.emissive) m.emissive.setHex(unhighlightColor); });
                                    } else if (child.material.emissive) {
                                        child.material.emissive.setHex(unhighlightColor);
                                    }
                                 }
                             });
                         }
                         const highlightColor = 0xffff00;
                         if (newHovered) {
                            newHovered.traverse(child => {
                                 if(child.isMesh) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(m => { if (m.emissive) m.emissive.setHex(highlightColor); });
                                    } else if (child.material.emissive) {
                                        child.material.emissive.setHex(highlightColor);
                                    }
                                 }
                            });
                         }
                         sim.hoveredObject = newHovered;
                    }
                }
            };
            
            const onKeyDown = (event) => {
                if (event.key.toLowerCase() !== 'r' || !sim.isDragging || !sim.draggedBody) return;
                event.preventDefault();

                const snapAngleRad = sim.THREE.MathUtils.degToRad(snappingParams.angleSnap);
                if (!snappingParams.enabled || snapAngleRad <= 0) return;

                const currentRot = sim.draggedBody.rotation();
                const euler = new sim.THREE.Euler().setFromQuaternion(new sim.THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w), 'YXZ');
                euler.y += snapAngleRad;
                
                const newQuat = new sim.THREE.Quaternion().setFromEuler(euler);
                sim.draggedBody.setRotation({ x: newQuat.x, y: newQuat.y, z: newQuat.z, w: newQuat.w }, true);
            };
    
            const onPointerUp = () => {
                if (sim.isDragging) {
                    sim.controls.enabled = true;
                    
                    if (sim.draggedBody && sim.currentDragVelocity) {
                        sim.draggedBody.setLinvel(sim.currentDragVelocity, true);
                    }

                    sim.isDragging = false;
                    sim.draggedObject = null;
                    sim.draggedBody = null;
                    sim.lastDragPosition = null;
                    sim.currentDragVelocity = null;
                }
            };
            
            const cleanup = () => {
                isMounted = false;
                window.removeEventListener('resize', sim.handleResize);
                window.removeEventListener('keydown', onKeyDown);
                if (sim.animationFrameId) cancelAnimationFrame(sim.animationFrameId);
                if (sim.gui) sim.gui.destroy();

                if(sim.renderer && sim.renderer.domElement) {
                    sim.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
                    sim.renderer.domElement.removeEventListener('pointermove', onPointerMove);
                }
                window.removeEventListener('pointerup', onPointerUp);
                
                if (mountRef.current && sim.renderer && sim.renderer.domElement) {
                   if (mountRef.current.contains(sim.renderer.domElement)) {
                        mountRef.current.removeChild(sim.renderer.domElement);
                   }
                }
                if (sim.renderer) sim.renderer.dispose();
                if(sim.world) sim.world.free();
                simulationRef.current = {};
            };
            
            init().then(() => {
                sim.handleResize = () => {
                    if (!isMounted || !mountRef.current || !sim.renderer) return;
                    const container = mountRef.current;
                    const width = container.clientWidth;
                    const height = container.clientHeight;

                    sim.camera.aspect = width / height;
                    sim.camera.updateProjectionMatrix();
                    sim.renderer.setSize(width, height);
                };
                window.addEventListener('resize', sim.handleResize);
            }).catch(console.error);
    
            return cleanup;
    
        }, [graph, serverUrl]);
    
        const handleCommit = React.useCallback(() => {
            if (onCommitRef.current && simulationRef.current.bodies && simulationRef.current.THREE) {
                const finalPositions = {};
                const SCALE = 0.5;
                simulationRef.current.bodies.forEach((body, id) => {
                    const pos = body.translation();
                    const rot = body.rotation();
                    const q = new simulationRef.current.THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
                    const euler = new simulationRef.current.THREE.Euler().setFromQuaternion(q, 'YXZ');
                    
                    let angleDegrees = euler.y * (180 / Math.PI);
                    angleDegrees = (angleDegrees % 360 + 360) % 360;

                    finalPositions[id] = {
                        x: pos.x / SCALE,
                        y: pos.z / SCALE, // Map Z in physics to Y in KiCad
                        rotation: angleDegrees,
                        // side: simulationRef.current.meshes.get(id).userData.side, // Could be useful later
                    };
                });
                onCommitRef.current(finalPositions);
            } else {
                console.warn("Could not commit layout - simulation state not ready.");
            }
        }, []);
    
        return (
            <div className="bg-gray-900/50 border-2 border-yellow-500/60 rounded-xl p-2 aspect-square flex flex-col">
                <div ref={mountRef} className="flex-grow bg-black/30 rounded overflow-hidden relative touch-none cursor-grab" style={{minHeight: 0}}>
                   <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-300"></div>
                        <p className="text-yellow-300 ml-3">Initializing 3D Physics...</p>
                   </div>
                </div>
                {isLayoutInteractive && (
                    <div className="mt-2">
                        <button onClick={handleCommit} className="w-full bg-green-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 min-w-[120px]">
                            Commit Layout & Continue
                        </button>
                    </div>
                )}
            </div>
        );
    `
};

export const PHYSICS_LAYOUT_TOOLS: ToolCreatorPayload[] = [
    RAPIER_LAYOUT_TOOL
];