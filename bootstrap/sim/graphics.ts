// bootstrap/sim/graphics.ts

export const GraphicsClassString = `
class Graphics {
    constructor(mountNode, THREE, OrbitControls, GLTFLoader, SVGLoader, boardOutline, scale) {
        this.THREE = THREE;
        this.GLTFLoader = GLTFLoader;
        this.SVGLoader = SVGLoader;
        this.loader = new this.GLTFLoader();
        this.svgLoader = new this.SVGLoader();

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
        this.visibility = { placeholders: true, courtyards: true, svg: true, glb: true };
        
        if (boardOutline) this.addBoardMesh(boardOutline, scale);
        
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
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    updateVisibility(newVisibility) {
        this.visibility = newVisibility;
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

    addBoardMesh(outline, scale) {
        const boardMaterial = new this.THREE.MeshStandardMaterial({ color: 0x004d00, metalness: 0.2, roughness: 0.8, side: this.THREE.DoubleSide });
        const boardHeight = 1.6 * scale; // Scale the thickness too
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
        const boardMesh = new this.THREE.Mesh(boardGeom, boardMaterial);
        const centerX = (outline.x + outline.width / 2) * scale;
        const centerZ = (outline.y + outline.height / 2) * scale;
        // Position the board so its center is at Y=0.
        boardMesh.position.set(centerX, 0, centerZ);
        this.scene.add(boardMesh);
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
            const fullSvgUrl = node.svgPath.startsWith('http') ? node.svgPath : 'http://localhost:3001/' + node.svgPath;
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

            if (window.cacheService) {
                window.cacheService.getAssetBlob(fullSvgUrl).then(async (blob) => {
                    if (blob) {
                        const svgText = await blob.text();
                        loadSvgFromText(svgText);
                    } else {
                        fetch(fullSvgUrl)
                            .then(res => res.ok ? res.text() : Promise.reject(new Error(\`HTTP \${res.status}\`)))
                            .then(svgText => {
                                window.cacheService.setAssetBlob(fullSvgUrl, new Blob([svgText], {type: 'image/svg+xml'}));
                                loadSvgFromText(svgText);
                            })
                            .catch(err => { console.error(\`[SVG] Failed to load '\${fullSvgUrl}':\`, err); });
                    }
                });
            } else {
                 this.svgLoader.load(fullSvgUrl, (data) => { /* original logic */ }, undefined, () => {});
            }
        }
        
        const assetPath = (mode === 'pcb' && node.glbPath) ? node.glbPath :
                          (mode === 'robotics' && node.asset_glb) ? node.asset_glb : null;

        if (assetPath) {
            const fullGlbUrl = assetPath.startsWith('http') ? assetPath : 'http://localhost:3001/' + assetPath;
            
            const loadGltfFromBlob = (blob) => {
                const url = URL.createObjectURL(blob);
                this.loader.load(url, (gltf) => {
                    if (!gltf || !gltf.scene) {
                        console.error(\`[GLB] GLTF object for ID \${id} loaded, but it has no scene.\`);
                        URL.revokeObjectURL(url);
                        return;
                    }
                    const originalScene = gltf.scene;
                    
                    const componentNode = originalScene.getObjectByName('REF**');

                    if (!componentNode) {
                        console.warn(\`[GLB] Could not find component node 'REF**' in GLB for ID: \${id}. The 3D model might be missing. Proceeding with placeholder.\`);
                        URL.revokeObjectURL(url);
                        return;
                    }
                    
                    const group = new this.THREE.Group();
                    group.add(componentNode);
                    group.userData.agentId = id;
                    
                    if (mode === 'pcb') {
                        const transforms = node.assetTransforms?.glb || {};
                        const customOffset = transforms.offset || [0, 0, 0];
                        
                        if (transforms.rotation) {
                            const rot = transforms.rotation; // degrees
                            componentNode.rotation.set(
                                rot[0] * this.THREE.MathUtils.DEG2RAD,
                                rot[1] * this.THREE.MathUtils.DEG2RAD,
                                rot[2] * this.THREE.MathUtils.DEG2RAD
                            );
                        }

                        componentNode.position.set(
                            customOffset[0],
                            customOffset[1],
                            customOffset[2]
                        );

                        const glbScale = 1000 * scale;
                        group.scale.set(glbScale, glbScale, glbScale);

                    } else { // robotics
                        const box = new this.THREE.Box3().setFromObject(componentNode);
                        const size = box.getSize(new this.THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const desiredSize = scale * (node.type === 'robot' ? 1.5 : 1.0);
                        const scaleFactor = maxDim > 0 ? desiredSize / maxDim : 1.0;
                        group.scale.set(scaleFactor, scaleFactor, scaleFactor);
                        
                        const newBox = new this.THREE.Box3().setFromObject(group);
                        const center = newBox.getCenter(new this.THREE.Vector3());
                        group.position.sub(center).sub(new this.THREE.Vector3(0, newBox.min.y, 0));
                    }


                    if (meshEntry.placeholder) {
                        meshEntry.placeholder.visible = false;
                    }
                    
                    meshEntry.glb = group;
                    this.scene.add(group);
                    
                    URL.revokeObjectURL(url);
                }, undefined, (error) => console.error(\`[GLB] Error loading model from blob for \${id}:\`, error));
            };

            if (window.cacheService) {
                window.cacheService.getAssetBlob(fullGlbUrl).then(async (blob) => {
                    if (blob) {
                        loadGltfFromBlob(blob);
                    } else {
                        fetch(fullGlbUrl)
                            .then(res => res.ok ? res.blob() : Promise.reject(new Error(\`HTTP \${res.status}\`)))
                            .then(blob => {
                                window.cacheService.setAssetBlob(fullGlbUrl, blob);
                                loadGltfFromBlob(blob);
                            })
                            .catch(err => console.error(\`[GLB] Failed to fetch and cache '\${fullGlbUrl}':\`, err));
                    }
                });
            }
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
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    cleanup() {
        window.removeEventListener('resize', this.onWindowResize);
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