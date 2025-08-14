
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
        mountNode.innerHTML = '';
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
        this.footprintMaterial = new this.THREE.MeshBasicMaterial({ color: 0x00ff00, side: this.THREE.DoubleSide, transparent: true, opacity: 0.5 });

        this.meshes = new Map();
        this.simulation = null;
        this.boardY = 0;
        
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
            const width = node.width * scale;
            const depth = node.height * scale;
            const footprint = node.footprint || '';
            
            if (footprint.includes('pogo_pin')) {
                geomHeight = 10 * scale; // Based on d5x10mm
                const radius = (node.width / 2) * scale;
                geom = new this.THREE.CylinderGeometry(radius, radius, geomHeight, 32);
                mat = this.connectorMaterial.clone();
            } else if (footprint.includes('LQFP') || node.id.startsWith('U')) {
                geomHeight = 2 * scale;
                geom = new this.THREE.BoxGeometry(width, geomHeight, depth);
                mat = this.icMaterial.clone();
            } else if (footprint.includes('PinHeader')) {
                geomHeight = 6 * scale;
                geom = new this.THREE.BoxGeometry(width, geomHeight, depth);
                mat = new this.THREE.MeshStandardMaterial({ color: 0x111111 });
            } else {
                geomHeight = 1 * scale;
                geom = new this.THREE.BoxGeometry(width, geomHeight, depth);
                mat = this.smdMaterial.clone();
            }
            
            // Translate geometry so its base is at Y=0. Rotation will handle flipping.
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

        const meshEntry = { placeholder: placeholder, glb: null, footprint: null };
        this.meshes.set(id, meshEntry);
        
        if (mode === 'pcb' && node.svgPath) {
            const fullSvgUrl = node.svgPath.startsWith('http') ? node.svgPath : 'http://localhost:3001/' + node.svgPath;
            this.svgLoader.load(fullSvgUrl, (data) => {
                const group = new this.THREE.Group();
                data.paths.forEach(path => {
                    const shapes = this.SVGLoader.createShapes(path);
                    shapes.forEach(shape => {
                        const geometry = new this.THREE.ShapeGeometry(shape);
                        const mesh = new this.THREE.Mesh(geometry, this.footprintMaterial);
                        group.add(mesh);
                    });
                });

                group.scale.y *= -1; // Flip Y for SVG coordinate system

                // --- UPDATE DIMENSIONS FROM SVG ---
                const box = new this.THREE.Box3().setFromObject(group);
                const size = new this.THREE.Vector3();
                box.getSize(size);
                
                // Use the raw SVG dimensions (before scene scaling) as the new source of truth.
                if (size.x > 0 && size.y > 0 && this.simulation) {
                    const newWidth = size.x;
                    const newHeight = size.y;
                    
                    // Update simulation state with real dimensions.
                    this.simulation.updateNodeDimensions(id, newWidth, newHeight);
                    
                    // Re-create the 3D placeholder with the correct dimensions.
                    if (meshEntry.placeholder) {
                        this.scene.remove(meshEntry.placeholder);
                    }
                    const updatedNode = this.simulation.getNode(id); // Get updated node data from simulation
                    meshEntry.placeholder = this.createPlaceholderMesh(updatedNode, mode, scale);
                    meshEntry.placeholder.userData.agentId = id;
                    this.scene.add(meshEntry.placeholder);
                    
                    if (meshEntry.glb) { // Re-hide placeholder if GLB is already loaded
                         meshEntry.placeholder.visible = false;
                    }
                }
                // --- END DIMENSION UPDATE ---

                // Apply explicit transforms from config, no automatic centering.
                const transforms = node.assetTransforms?.svg;
                if (transforms) {
                    if (transforms.scale) {
                         if (Array.isArray(transforms.scale)) group.scale.multiply(new this.THREE.Vector3(...transforms.scale));
                         else group.scale.multiplyScalar(transforms.scale);
                    }
                    if (transforms.rotation) {
                        const rot = transforms.rotation;
                        group.rotation.set(rot[0] * Math.PI / 180, rot[1] * Math.PI / 180, rot[2] * Math.PI / 180);
                    }
                    if (transforms.offset) {
                         // Apply offset directly. Note: SVG's local origin might not be its center.
                        group.position.set(...transforms.offset);
                    }
                }
                
                // Apply final scene-level scale
                group.scale.multiplyScalar(scale);

                group.userData.agentId = id;
                meshEntry.footprint = group;
                this.scene.add(group);
            });
        }

        if (mode === 'pcb' && node.glbPath) {
            const fullGlbUrl = node.glbPath.startsWith('http') ? node.glbPath : 'http://localhost:3001/' + node.glbPath;
            console.log(\`[3D] -> Loading GLB for '\${id}' from \${fullGlbUrl}\`);

            this.loader.load(fullGlbUrl,
                (gltf) => { // On Success
                    const model = gltf.scene;
                    const group = new this.THREE.Group(); // This will be the root object for the agent, positioned by the simulation.
                    group.userData.agentId = id;
                    group.add(model); // The GLB model is a child of this group.
                    
                    // Apply ONLY the transformations from assetTransforms to the inner model.
                    const transforms = node.assetTransforms?.glb;
                    if (transforms) {
                        // 1. Scale
                        if (transforms.scale) {
                            if (Array.isArray(transforms.scale)) {
                                model.scale.set(...transforms.scale);
                            } else {
                                model.scale.set(transforms.scale, transforms.scale, transforms.scale);
                            }
                        }
                        // 2. Rotate
                        if (transforms.rotation) {
                            const rot = transforms.rotation; // degrees
                            model.rotation.set(
                                rot[0] * Math.PI / 180,
                                rot[1] * Math.PI / 180,
                                rot[2] * Math.PI / 180
                            );
                        }
                        // 3. Offset (Translate)
                        if (transforms.offset) {
                            const offset = transforms.offset;
                            model.position.set(offset[0], offset[1], offset[2]);
                        }
                    }

                    // Apply final scene-level scale for unit conversion to the parent group.
                    const glbScale = 1000 * scale;
                    group.scale.set(glbScale, glbScale, glbScale);

                    if (meshEntry.placeholder) {
                        meshEntry.placeholder.visible = false;
                    }
                    
                    meshEntry.glb = group;
                    this.scene.add(group);
                    console.log(\`[3D] ✅ Successfully loaded and positioned GLB for '\${id}'.\`);
                },
                undefined,
                (errorEvent) => {
                    console.error(\`[3D] ❌ FAILED TO LOAD GLB FOR '\${id}'. Using placeholder only. Error:\`, errorEvent.message);
                }
            );
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
            if (!pos || !simRot) return;

            if (meshEntry.placeholder) {
                meshEntry.placeholder.position.set(pos.x, pos.y, pos.z);
                meshEntry.placeholder.quaternion.copy(simRot);
            }
            if (meshEntry.glb) {
                meshEntry.glb.position.set(pos.x, pos.y, pos.z);
                meshEntry.glb.quaternion.copy(simRot);
            }
            if (meshEntry.footprint) {
                meshEntry.footprint.position.set(pos.x, this.boardY + 0.1, pos.z);
                meshEntry.footprint.quaternion.copy(simRot);
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
        if (this.renderer) this.renderer.dispose();
    }
}
`