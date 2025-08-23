// bootstrap/sim/graphics.ts

export const GraphicsClassString = `
class Graphics {
    constructor(mountNode, THREE, OrbitControls, GLTFLoader, SVGLoader, boardOutline, scale, isServerConnected) {
        this.THREE = THREE;
        this.GLTFLoader = GLTFLoader;
        this.SVGLoader = SVGLoader;
        this.loader = new this.GLTFLoader();
        this.svgLoader = new this.SVGLoader();
        this.isServerConnected = isServerConnected;

        this.scene = new this.THREE.Scene();
        this.scene.background = new this.THREE.Color(0x111827); // bg-gray-900
        this.camera = new this.THREE.PerspectiveCamera(75, mountNode.clientWidth / mountNode.clientHeight, 0.1, 5000);
        this.camera.position.set(0, 100, 150);
        this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
        mountNode.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.scene.add(new this.THREE.AmbientLight(0xffffff, 1.5));
        const dirLight = new this.THREE.DirectionalLight(0xffffff, 3.0);
        dirLight.position.set(50, 100, 75);
        this.scene.add(dirLight);

        this.icMaterial = new this.THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.1, roughness: 0.6 });
        this.smdMaterial = new this.THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.1, roughness: 0.8 });
        this.connectorMaterial = new this.THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.3 });
        this.robotMaterial = new this.THREE.MeshStandardMaterial({ color: 0x3b82f6 });
        this.envMaterial = new this.THREE.MeshStandardMaterial({ color: 0x6b7280 });
        this.highlightMaterial = new this.THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5 });
        this.selectMaterial = new this.THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
        
        this.materials = {
            footprint: {
                top: new this.THREE.MeshBasicMaterial({ color: 0xff0000, side: this.THREE.DoubleSide, transparent: true, opacity: 0.5 }),
                bottom: new this.THREE.MeshBasicMaterial({ color: 0x0000ff, side: this.THREE.DoubleSide, transparent: true, opacity: 0.5 }),
            },
            courtyard: {
                top: {
                    fill: new this.THREE.MeshBasicMaterial({ color: 0xffc0cb, transparent: true, opacity: 0.1, side: this.THREE.DoubleSide }),
                    line: new this.THREE.LineBasicMaterial({ color: 0xffc0cb, linewidth: 2 })
                },
                bottom: {
                    fill: new this.THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.1, side: this.THREE.DoubleSide }),
                    line: new this.THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
                }
            }
        };

        this.meshes = new Map();
        this.simulation = null;
        this.boardY = 0;
        this.visibility = { placeholders: true, courtyards: true, svg: true, glb: true, nets: true };
        this.boardMesh = null;
        
        this.netLinesGroup = new this.THREE.Group();
        this.scene.add(this.netLinesGroup);
        this.netLines = new Map();
        this.netLineMaterial = new this.THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.7 });
        this.gndLineMaterial = new this.THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
        this.boardOutlineData = null;

        if (boardOutline) this.updateBoardMesh(boardOutline, scale);
        
        this.raycaster = new this.THREE.Raycaster();
        this.mouse = new this.THREE.Vector2();
        this.plane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0);
        this.draggedObject = null;
        this.hoveredObject = null;
        
        this.boundPointerDown = this.onPointerDown.bind(this);
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
        this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
        this.renderer.domElement.addEventListener('pointermove', this.boundPointerMove);
        this.renderer.domElement.addEventListener('pointerup', this.boundPointerUp);

        this.boundDoubleClick = this.handleDoubleClick.bind(this);
        this.renderer.domElement.addEventListener('dblclick', this.boundDoubleClick);
        
        // Use a ResizeObserver to handle canvas resizing dynamically.
        this.resizeObserver = new ResizeObserver(() => {
            this.onWindowResize();
        });
        this.resizeObserver.observe(mountNode);
    }
    
    getClosestPointOnBoard(worldPos) {
        if (!this.boardOutlineData) return worldPos;

        const { x, y, width, height, shape } = this.boardOutlineData;
        const scale = this.simulation.SCALE;

        const boardMinX = x * scale;
        const boardMaxX = (x + width) * scale;
        const boardMinZ = y * scale;
        const boardMaxZ = (y + height) * scale;
        const boardY = this.boardY;

        if (shape === 'circle') {
            const centerX = (boardMinX + boardMaxX) / 2;
            const centerZ = (boardMinZ + boardMaxZ) / 2;
            const radius = (boardMaxX - boardMinX) / 2;
            
            const vecToCenter = new this.THREE.Vector3(worldPos.x - centerX, 0, worldPos.z - centerZ);
            if (vecToCenter.lengthSq() < 1e-9) { // If point is at the center
                 return new this.THREE.Vector3(centerX + radius, boardY, centerZ);
            }
            vecToCenter.normalize().multiplyScalar(radius);
            
            return new this.THREE.Vector3(centerX + vecToCenter.x, worldPos.y, centerZ + vecToCenter.z);

        } else { // rectangle
            const closestX = Math.max(boardMinX, Math.min(worldPos.x, boardMaxX));
            const closestZ = Math.max(boardMinZ, Math.min(worldPos.z, boardMaxZ));
            
            const distToMinX = Math.abs(worldPos.x - boardMinX);
            const distToMaxX = Math.abs(worldPos.x - boardMaxX);
            const distToMinZ = Math.abs(worldPos.z - boardMinZ);
            const distToMaxZ = Math.abs(worldPos.z - boardMaxZ);

            const minDist = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);

            if (minDist === distToMinX) return new this.THREE.Vector3(boardMinX, worldPos.y, closestZ);
            if (minDist === distToMaxX) return new this.THREE.Vector3(boardMaxX, worldPos.y, closestZ);
            if (minDist === distToMinZ) return new this.THREE.Vector3(closestX, worldPos.y, boardMinZ);
            return new this.THREE.Vector3(closestX, worldPos.y, boardMaxZ);
        }
    }
    
    updateNetVisuals(graph) {
        if (!graph || !this.netLinesGroup) return;

        this.netLinesGroup.clear();
        this.netLines.clear();

        const hasGndPour = graph.copper_pours?.some(p => p.net && p.net.toLowerCase() === 'gnd');
        
        // If a ground pour exists, create individual lines for each GND pin.
        if (hasGndPour) {
            const gndPins = new Set();
            (graph.edges || []).forEach(edge => {
                if (edge.label && edge.label.toLowerCase() === 'gnd') {
                    gndPins.add(edge.source);
                    gndPins.add(edge.target);
                }
            });

            gndPins.forEach(pinId => {
                const key = \`gnd_pour-\\\${pinId}\`;
                const geometry = new this.THREE.BufferGeometry().setFromPoints([new this.THREE.Vector3(), new this.THREE.Vector3()]);
                const line = new this.THREE.Line(geometry, this.gndLineMaterial);
                line.userData = { type: 'gnd_pour', pin: pinId };
                this.netLines.set(key, line);
                this.netLinesGroup.add(line);
            });
        }

        // Process all edges. If a GND pour exists, GND edges are skipped here.
        // Otherwise, GND edges are created just like any other net.
        (graph.edges || []).forEach(edge => {
            const isGnd = edge.label && edge.label.toLowerCase() === 'gnd';
            if (isGnd && hasGndPour) {
                return; // Handled by the 'gnd_pour' lines above
            }
            
            const key = [edge.source, edge.target].sort().join('-');
            if (!this.netLines.has(key)) {
                const geometry = new this.THREE.BufferGeometry().setFromPoints([new this.THREE.Vector3(), new this.THREE.Vector3()]);
                const material = isGnd ? this.gndLineMaterial : this.netLineMaterial;
                const line = new this.THREE.Line(geometry, material);
                line.userData = { type: 'net', source: edge.source, target: edge.target };
                this.netLines.set(key, line);
                this.netLinesGroup.add(line);
            }
        });
    }

    updateConnectionStatus(isConnected) {
        this.isServerConnected = isConnected;
    }

    updateVisibility(newVisibility) {
        this.visibility = newVisibility;
        if (this.netLinesGroup) {
            this.netLinesGroup.visible = this.visibility.nets;
        }
    }

    updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    onPointerDown(event) {
        if (event.button !== 0 || !this.simulation) return;
        this.updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const allMeshes = Array.from(this.meshes.values()).flatMap(m => [m.placeholder, m.glb, m.footprint]).filter(Boolean);
        const intersects = this.raycaster.intersectObjects(allMeshes, true);

        if (intersects.length > 0) {
            this.draggedObject = this.findRootMesh(intersects[0].object);
            this.controls.enabled = false;
            this.plane.set(new this.THREE.Vector3(0, 1, 0), -this.draggedObject.position.y);
        }
    }
    
    findRootMesh(object) {
        let current = object;
        while (current.parent && current.parent !== this.scene && current.userData.agentId === undefined) {
            current = current.parent;
        }
        return current;
    }

    onPointerMove(event) {
        this.updateMouse(event);

        if (this.draggedObject && this.simulation) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersection = new this.THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.plane, intersection)) {
                 if (this.draggedObject.userData.agentId) {
                    this.simulation.dragAgent(this.draggedObject.userData.agentId, intersection);
                }
            }
        } else { 
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const allMeshes = Array.from(this.meshes.values()).flatMap(m => [m.placeholder, m.glb, m.footprint]).filter(Boolean);
            const intersects = this.raycaster.intersectObjects(allMeshes, true);
            const firstHitRoot = intersects.length > 0 ? this.findRootMesh(intersects[0].object) : null;
            
            const newHoverId = firstHitRoot ? firstHitRoot.userData.agentId : null;
            const oldHoverId = this.hoveredObject ? this.hoveredObject.userData.agentId : null;

            if (oldHoverId !== newHoverId) {
                if (oldHoverId) this.highlightMesh(oldHoverId, false);
                this.hoveredObject = firstHitRoot;
                if (newHoverId) this.highlightMesh(newHoverId, true);
            }
        }
    }

    onPointerUp(event) {
        this.controls.enabled = true;
        if (this.draggedObject && this.simulation) {
            this.simulation.stopDragAgent();
            this.draggedObject = null;
        }
    }
    
    handleDoubleClick(event) {
        if (!this.simulation) return;
        this.updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const allMeshes = Array.from(this.meshes.values()).flatMap(m => [m.placeholder, m.glb, m.footprint]).filter(Boolean);
        const intersects = this.raycaster.intersectObjects(allMeshes, true);

        if (intersects.length > 0) {
            const clickedObject = this.findRootMesh(intersects[0].object);
            if (clickedObject.userData.agentId) {
                this.simulation.toggleComponentSide(clickedObject.userData.agentId);
            }
        }
    }

    updateBoardMesh(outline, scale) {
        this.boardOutlineData = outline;
        if (this.boardMesh) {
            this.scene.remove(this.boardMesh);
            this.boardMesh.geometry.dispose();
            if (this.boardMesh.material.dispose) this.boardMesh.material.dispose();
            this.boardMesh = null;
        }

        if (!outline || !outline.width || !outline.height) return;

        const boardMaterial = new this.THREE.MeshStandardMaterial({ color: 0x004d00, metalness: 0.2, roughness: 0.8, side: this.THREE.DoubleSide });
        const boardHeight = 1.6 * scale;
        this.boardY = boardHeight / 2;
        let boardGeom;

        if (outline.shape === 'circle') {
            const radius = (outline.width / 2) * scale;
            boardGeom = new this.THREE.CylinderGeometry(radius, radius, boardHeight, 64);
        } else {
            const width = outline.width * scale;
            const depth = outline.height * scale;
            boardGeom = new this.THREE.BoxGeometry(width, boardHeight, depth);
        }
        this.boardMesh = new this.THREE.Mesh(boardGeom, boardMaterial);
        const centerX = (outline.x + outline.width / 2) * scale;
        const centerZ = (outline.y + outline.height / 2) * scale;
        this.boardMesh.position.set(centerX, 0, centerZ);
        this.scene.add(this.boardMesh);
    }

    onWindowResize() {
        const mountNode = this.renderer.domElement.parentElement;
        if(!mountNode) return;
        this.camera.aspect = mountNode.clientWidth / mountNode.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    }
    
    setSimulation(simulation) { this.simulation = simulation; }

    createPlaceholderMesh(node, mode, scale) {
        let geom, mat, geomHeight;
         if (mode === 'pcb') {
            const { placeholder_dimensions, placeholder_shape, footprint, side } = node;
            const isBottom = side === 'bottom';
            
            const visDims = placeholder_dimensions || { width: 2.54, height: 2.54 };
            const visShape = placeholder_shape || 'rectangle';

            const width = visDims.width * scale;
            const depth = visDims.height * scale;

            // Determine height and material based on footprint heuristics
            if (footprint && footprint.toLowerCase().includes('pogo_pin')) {
                geomHeight = 10 * scale;
                mat = this.connectorMaterial.clone();
            } else if (footprint && (footprint.includes('LQFP') || node.id.startsWith('U'))) {
                geomHeight = 2 * scale;
                mat = this.icMaterial.clone();
            } else if (footprint && footprint.includes('PinHeader')) {
                geomHeight = 6 * scale;
                mat = new this.THREE.MeshStandardMaterial({ color: 0x111111 });
            } else {
                geomHeight = 1 * scale;
                mat = this.smdMaterial.clone();
            }
            
            if (visShape === 'circle') {
                const radius = width / 2;
                geom = new this.THREE.CylinderGeometry(radius, radius, geomHeight, 32);
            } else { // rectangle (default)
                geom = new this.THREE.BoxGeometry(width, geomHeight, depth);
            }
            
            geom.translate(0, geomHeight / 2, 0);

        } else { // robotics
             const agentSize = scale;
             if (node.type === 'robot') {
                 const agentGeom = new this.THREE.ConeGeometry(agentSize/2, agentSize, 8);
                 geom = agentGeom;
                 mat = this.robotMaterial.clone();
             } else {
                geom = new this.THREE.BoxGeometry(agentSize, agentSize, agentSize);
                mat = this.envMaterial.clone();
             }
        }
        const mesh = new this.THREE.Mesh(geom, mat);
        if(node.type === 'robot') mesh.rotation.x = Math.PI / 2;
        mesh.userData.originalMaterial = mesh.material;
        return mesh;
    }

    addMesh(id, node, mode, scale) {
        const placeholder = this.createPlaceholderMesh(node, mode, scale);
        placeholder.userData.agentId = id;
        this.scene.add(placeholder);

        const meshEntry = { placeholder: placeholder, glb: null, footprint: null, courtyard: null };
        this.meshes.set(id, meshEntry);

        if (mode === 'pcb' && node.drc_dimensions) {
            const isBottom = node.side === 'bottom';
            const courtyardMaterials = this.materials.courtyard[isBottom ? 'bottom' : 'top'];
            const { drc_dimensions, drc_shape } = node;
            const width = drc_dimensions.width * scale;
            const depth = drc_dimensions.height * scale;
            const courtyardHeight = 0.1 * scale;
            let courtyardGeom;

            if (drc_shape === 'circle') {
                const radius = width / 2;
                courtyardGeom = new this.THREE.CylinderGeometry(radius, radius, courtyardHeight, 32);
            } else { // rectangle
                courtyardGeom = new this.THREE.BoxGeometry(width, courtyardHeight, depth);
            }
            
            const fillMesh = new this.THREE.Mesh(courtyardGeom, courtyardMaterials.fill);
            const edgesGeom = new this.THREE.EdgesGeometry(courtyardGeom);
            const lineMesh = new this.THREE.LineSegments(edgesGeom, courtyardMaterials.line);
            const courtyardGroup = new this.THREE.Group();
            courtyardGroup.add(fillMesh);
            courtyardGroup.add(lineMesh);
            
            courtyardGroup.userData.agentId = id;
            this.scene.add(courtyardGroup);
            meshEntry.courtyard = courtyardGroup;
        }

        if (mode === 'pcb' && node.svgPath) {
            const isBottom = node.side === 'bottom';
            const footprintMaterial = this.materials.footprint[isBottom ? 'bottom' : 'top'];

            const loadSvgFromText = (svgText) => {
                const data = this.svgLoader.parse(svgText);
                const group = new this.THREE.Group();
                group.userData.agentId = id;

                data.paths.forEach(path => {
                    const shapes = this.SVGLoader.createShapes(path);
                    shapes.forEach(shape => {
                        const geometry = new this.THREE.ShapeGeometry(shape);
                        const mesh = new this.THREE.Mesh(geometry, footprintMaterial);
                        group.add(mesh);
                    });
                });
                
                const svgBbox = new this.THREE.Box3().setFromObject(group);
                const svgSize = new this.THREE.Vector3();
                svgBbox.getSize(svgSize);

                if (this.simulation && (svgSize.x > 0 || svgSize.y > 0)) {
                    this.simulation.updateNodeDimensions(id, svgSize.x, svgSize.y);
                }

                const box = new this.THREE.Box3().setFromObject(group);
                const center = new this.THREE.Vector3();
                box.getCenter(center);
                
                group.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.translate(-center.x, -center.y, -center.z);
                    }
                });
                
                group.scale.multiplyScalar(scale);

                meshEntry.footprint = group;
                this.scene.add(group);
            };

            const attemptLoadSvg = (url, isFallback = false) => {
                const cacheBuster = '?t=' + new Date().getTime();
                if (window.cacheService) {
                    window.cacheService.getAssetBlob(url).then(async (blob) => {
                        if (blob) {
                            loadSvgFromText(await blob.text());
                        } else {
                            fetch(url + cacheBuster)
                                .then(res => {
                                    if (res.ok) return res.text();
                                    if (!isFallback && this.isServerConnected) {
                                        console.warn(\`[SVG] Failed to load from server '\\\${url}'. Falling back to local path.\`);
                                        attemptLoadSvg(node.svgPath, true);
                                        return null;
                                    }
                                    return Promise.reject(new Error(\`HTTP \\\${res.status} for \\\${url}\`));
                                })
                                .then(svgText => {
                                    if (svgText) {
                                        window.cacheService.setAssetBlob(url, new Blob([svgText], {type: 'image/svg+xml'}));
                                        loadSvgFromText(svgText);
                                    }
                                })
                                .catch(err => {
                                    if (isFallback || !this.isServerConnected) {
                                        console.error(\`[SVG] Final attempt to load '\\\${url}' failed:\`, err);
                                    }
                                });
                        }
                    });
                }
            };
            
            const initialSvgUrl = (this.isServerConnected && !node.svgPath.startsWith('http'))
                ? 'http://localhost:3001/' + node.svgPath
                : node.svgPath;
            
            attemptLoadSvg(initialSvgUrl, !this.isServerConnected);
        }
        
        const assetPath = (mode === 'pcb' && node.glbPath) ? node.glbPath :
                          (mode === 'robotics' && node.asset_glb) ? node.asset_glb : null;

        if (assetPath) {
            const loadGltfFromBlob = (blob) => {
                const url = URL.createObjectURL(blob);
                this.loader.load(url, (gltf) => {
                    if (!gltf || !gltf.scene) {
                        console.error(\`[GLB] GLTF object for ID \\\${id} loaded, but it has no scene.\`);
                        URL.revokeObjectURL(url);
                        return;
                    }
                    const originalScene = gltf.scene;
                    
                    let modelRoot;

                    if (mode === 'pcb') {
                        const componentNode = originalScene.getObjectByName('REF**');
                        if (!componentNode) {
                            console.warn(\`[GLB] KiCad mode: Could not find component node 'REF**' in GLB for ID: \\\${id}. The 3D model might be missing. Proceeding with placeholder.\`);
                            URL.revokeObjectURL(url);
                            return;
                        }
                        modelRoot = new this.THREE.Group();
                        modelRoot.add(componentNode);
                    } else {
                        modelRoot = originalScene.clone();
                    }

                    modelRoot.userData.agentId = id;
                    
                    if (mode === 'pcb') {
                        const componentNodeForTransform = modelRoot.children[0];
                        const transforms = node.assetTransforms?.glb || {};
                        const customOffset = transforms.offset || [0, 0, 0];
                        
                        if (transforms.rotation) {
                            const rot = transforms.rotation; // degrees
                            componentNodeForTransform.rotation.set(
                                rot[0] * this.THREE.MathUtils.DEG2RAD,
                                rot[1] * this.THREE.MathUtils.DEG2RAD,
                                rot[2] * this.THREE.MathUtils.DEG2RAD
                            );
                        }

                        componentNodeForTransform.position.set(customOffset[0], customOffset[1], customOffset[2]);
                        const glbScale = 1000 * scale;
                        modelRoot.scale.set(glbScale, glbScale, glbScale);

                    } else { // robotics
                        const box = new this.THREE.Box3().setFromObject(modelRoot);
                        const size = box.getSize(new this.THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const desiredSize = scale * (node.type === 'robot' ? 1.5 : 1.0);
                        const scaleFactor = maxDim > 0 ? desiredSize / maxDim : 1.0;
                        modelRoot.scale.set(scaleFactor, scaleFactor, scaleFactor);
                        
                        const newBox = new this.THREE.Box3().setFromObject(modelRoot);
                        const center = newBox.getCenter(new this.THREE.Vector3());
                        modelRoot.position.sub(center).sub(new this.THREE.Vector3(0, newBox.min.y, 0));
                    }


                    if (meshEntry.placeholder) {
                        meshEntry.placeholder.visible = false;
                    }
                    
                    meshEntry.glb = modelRoot;
                    this.scene.add(modelRoot);
                    
                    URL.revokeObjectURL(url);
                }, undefined, (error) => console.error(\`[GLB] Error loading model from blob for \\\${id}:\`, error));
            };

            const attemptLoadGlb = (url, isFallback = false) => {
                const cacheBuster = '?t=' + new Date().getTime();
                if (window.cacheService) {
                    window.cacheService.getAssetBlob(url).then(async (blob) => {
                        if (blob) {
                            loadGltfFromBlob(blob);
                        } else {
                            fetch(url + cacheBuster)
                                .then(res => {
                                    if (res.ok) return res.blob();
                                    if (!isFallback && this.isServerConnected) {
                                        console.warn(\`[GLB] Failed to load from server '\\\${url}'. Falling back to local path.\`);
                                        attemptLoadGlb(assetPath, true);
                                        return null;
                                    }
                                    return Promise.reject(new Error(\`HTTP \\\${res.status} for \\\${url}\`));
                                })
                                .then(blob => {
                                    if (blob) {
                                        window.cacheService.setAssetBlob(url, blob);
                                        loadGltfFromBlob(blob);
                                    }
                                })
                                .catch(err => {
                                    if (isFallback || !this.isServerConnected) {
                                        console.error(\`[GLB] Final attempt to load '\\\${url}' failed:\`, err);
                                    }
                                });
                        }
                    });
                }
            };
            
            const initialGlbUrl = (this.isServerConnected && !assetPath.startsWith('http'))
                ? 'http://localhost:3001/' + assetPath
                : assetPath;
            
            attemptLoadGlb(initialGlbUrl, !this.isServerConnected);
        }
    }

    highlightMesh(agentId, isHovering) {
        if (!agentId) return;
        const meshEntry = this.meshes.get(agentId);
        if (!meshEntry || meshEntry.placeholder.userData.isSelected) return;

        const objectToHighlight = meshEntry.glb || meshEntry.placeholder;
        if (!objectToHighlight) return;

        objectToHighlight.traverse(child => {
            if (child.isMesh) {
                if (isHovering) {
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material;
                    }
                    child.material = this.highlightMaterial;
                } else {
                    if (child.userData.originalMaterial) {
                        child.material = child.userData.originalMaterial;
                    } else {
                        // Fallback to the root placeholder's material
                        child.material = meshEntry.placeholder.userData.originalMaterial;
                    }
                }
            }
        });
    }

    selectMesh(agentId, isSelected) {
        const meshEntry = this.meshes.get(agentId);
        if (!meshEntry) return;

        // Store selection state on the placeholder, which is always present.
        meshEntry.placeholder.userData.isSelected = isSelected;
        
        const objectToUpdate = meshEntry.glb || meshEntry.placeholder;
        if (!objectToUpdate) return;
        
        // If we are de-selecting, revert materials by calling highlight(false).
        if (!isSelected) {
            this.highlightMesh(agentId, false);
            return;
        }

        // Apply selection material to all children.
        objectToUpdate.traverse(child => {
            if (child.isMesh) {
                // Store original material if it hasn't been stored yet.
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                }
                child.material = this.selectMaterial;
            }
        });
    }
    
    focusOn(id) {
        if (!this.simulation) return;
        const pos = this.simulation.getPosition(id);
        if (pos) this.controls.target.set(pos.x, pos.y, pos.z);
    }

    render() {
        if (!this.simulation) return;
        
        this.meshes.forEach((meshEntry, id) => {
            const pos = this.simulation.getPosition(id);
            const simRot = this.simulation.getRotation(id);
            const node = this.simulation.getNode(id);
            if (!pos || !simRot || !node) return;

            const isBottom = node.side === 'bottom';

            if (meshEntry.placeholder) {
                meshEntry.placeholder.position.set(pos.x, pos.y, pos.z);
                meshEntry.placeholder.quaternion.copy(simRot);
                meshEntry.placeholder.visible = this.visibility.placeholders && (!meshEntry.glb || !this.visibility.glb);
            }
            if (meshEntry.glb) {
                meshEntry.glb.position.set(pos.x, pos.y, pos.z);
                meshEntry.glb.quaternion.copy(simRot);
                meshEntry.glb.visible = this.visibility.glb;
            }
            if (meshEntry.courtyard) {
                const courtyardY = isBottom ? -this.boardY : this.boardY;
                meshEntry.courtyard.position.set(pos.x, courtyardY, pos.z);
                meshEntry.courtyard.quaternion.copy(simRot);
                meshEntry.courtyard.visible = this.visibility.courtyards;
                
                const targetMaterials = this.materials.courtyard[isBottom ? 'bottom' : 'top'];
                meshEntry.courtyard.traverse(child => {
                    if (child.isMesh && child.material !== targetMaterials.fill) child.material = targetMaterials.fill;
                    if (child.isLineSegments && child.material !== targetMaterials.line) child.material = targetMaterials.line;
                });
            }
            
            if (meshEntry.footprint) {
                const zUpToYUpQuaternion = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(-Math.PI / 2, 0, 0));
                const footprintY = isBottom ? -this.boardY - 0.1 : this.boardY + 0.1;
                meshEntry.footprint.position.set(pos.x, footprintY, pos.z);
                
                const finalFootprintRot = new this.THREE.Quaternion().multiplyQuaternions(simRot, zUpToYUpQuaternion);
                meshEntry.footprint.quaternion.copy(finalFootprintRot);
                meshEntry.footprint.visible = this.visibility.svg;

                const targetMaterial = this.materials.footprint[isBottom ? 'bottom' : 'top'];
                meshEntry.footprint.traverse(child => {
                    if (child.isMesh && child.material !== targetMaterial) {
                        child.material = targetMaterial;
                    }
                });
            }
        });

        if (this.visibility.nets && this.simulation && this.netLines.size > 0) {
            this.netLines.forEach(line => {
                const positions = line.geometry.attributes.position.array;
                let p1, p2;
    
                if (line.userData.type === 'gnd_pour') {
                    const [comp, pin] = line.userData.pin.split('-');
                    p1 = this.simulation.getPinWorldPos(comp)?.[pin];
                    if (!p1) p1 = this.simulation.getPosition(comp);
                    p2 = p1 ? this.getClosestPointOnBoard(p1) : null;
                } else if (line.userData.type === 'net') {
                    const [sComp, sPin] = line.userData.source.split('-');
                    const [tComp, tPin] = line.userData.target.split('-');
                    p1 = this.simulation.getPinWorldPos(sComp)?.[sPin];
                    p2 = this.simulation.getPinWorldPos(tComp)?.[tPin];
                    if (!p1) p1 = this.simulation.getPosition(sComp);
                    if (!p2) p2 = this.simulation.getPosition(tComp);
                }
    
                if (p1 && p2) {
                    const yOffset = p1.y || 0; // Use the component's y-level for the line
                    positions[0] = p1.x; positions[1] = yOffset; positions[2] = p1.z;
                    positions[3] = p2.x; positions[4] = yOffset; positions[5] = p2.z;
                    line.geometry.attributes.position.needsUpdate = true;
                    line.visible = true;
                } else {
                    line.visible = false;
                }
            });
        }
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    cleanup() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.renderer.domElement.removeEventListener('dblclick', this.boundDoubleClick);
        this.renderer.domElement.removeEventListener('pointerdown', this.boundPointerDown);
        this.renderer.domElement.removeEventListener('pointermove', this.boundPointerMove);
        this.renderer.domElement.removeEventListener('pointerup', this.boundPointerUp);
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
        if (this.renderer) this.renderer.dispose();
    }
}
`