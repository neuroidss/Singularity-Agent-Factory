//bootstrap/sim/agent_simulation.ts
// This file now only contains the core simulation loop and state management.
// Force and collision logic has been moved to separate files.

export const AgentSimulationCoreString = `
    constructor(graphData, scale, THREE, mode, onUpdateLayout, RAPIER) {
        this.THREE = THREE;
        this.RAPIER = RAPIER;
        this.graph = graphData;
        this.SCALE = scale;
        this.mode = mode;
        this.onUpdateLayout = onUpdateLayout;

        this.nodeMap = new Map();
        this.agents = new Map();
        this.draggedAgentId = null;
        this.draggedBodyOriginalType = null;
        this.step_count = 0;
        this.satelliteToAnchorMap = new Map();
        this.boundaryWalls = []; // To store wall bodies
        this.joints = new Map(); // Maps rule identifier to an array of joint handles
        this.pidControllers = new Map(); // Maps a unique key (e.g., 'prox-U1-C1') to { controller, ruleInfo }

        // --- AI State for Robotics ---
        this.agentAIState = new Map();
        this.PATROLLER_SPEED = 5.0 * this.SCALE;
        this.PATROLLER_TARGET_RADIUS = 1.0 * this.SCALE;

        // --- Rapier World Setup ---
        const gravity = { x: 0.0, y: (mode === 'robotics' ? -9.81 : 0.0) * this.SCALE, z: 0.0 };
        this.world = new this.RAPIER.World(gravity);
        this.eventQueue = new this.RAPIER.EventQueue(true); // Create event queue once
        this.rigidBodyMap = new Map(); // agentId -> RAPIER.RigidBody
        this.handleToAgentIdMap = new Map(); // RAPIER.RigidBody.handle -> agentId

        // --- Simulation Parameters (Heuristics) ---
        this.params = {
            componentSpacing: 200.0, netLengthWeight: 0.03,
            settlingSpeed: 0.99, repulsionRampUpTime: 600, distributionStrength: 0.5,
            boardPadding: 5.0, viaClearance: 0.6,
            proximityKp: 5.0,
            proximityKi: 0.0,
            proximityKd: 1.5,
            symmetryStrength: 10.0, alignmentStrength: 10.0,
            absolutePositionStrength: 10.0,
            fixedRotationStrength: 5.0, symmetryRotationStrength: 1.0, circularRotationStrength: 1.0,
        };
        
        if (this.mode === 'robotics') {
            this.params = { ...this.params, componentSpacing: 10.0, netLengthWeight: 0,
                 distributionStrength: 0, proximityKp: 0,
                symmetryStrength: 0, alignmentStrength: 0,
                absolutePositionStrength: 0, fixedRotationStrength: 0, symmetryRotationStrength: 0, circularRotationStrength: 0,
            };
        }
        
        if (this.graph.board_outline) this.updateBoundaryWalls();


        this.pinDataMap = new Map();
        
        // --- Stability detection ---
        this.totalForceHistory = [];
        this.STABILITY_THRESHOLD = 0.5;
        this.STABILITY_WINDOW = 100;
        this.isStable = false;
    }

    setAuthoritativeState(entities) {
        if (!this.world || this.mode !== 'robotics') return;
        entities.forEach(entity => {
            const body = this.rigidBodyMap.get(entity.id);
            if (body && body.isKinematic()) {
                const pos = {
                    x: entity.x * this.SCALE,
                    y: 1.0 * this.SCALE, // Keep entities on the ground plane
                    z: entity.y * this.SCALE
                };
                const rot = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(0, (entity.rotation || 0) * Math.PI / 180, 0));
                
                body.setNextKinematicTranslation(pos);
                body.setNextKinematicRotation(rot);
            }
        });
    }

    getRandomTarget() {
        if (!this.graph.board_outline) return { x: 0, z: 0 };
        const { x, y, width, height } = this.graph.board_outline;
        const randX = (x + Math.random() * width) * this.SCALE;
        const randZ = (y + Math.random() * height) * this.SCALE;
        return { x: randX, z: randZ };
    }

    getEffectiveDrcInfo(node) {
        const { drcDims, drcShape } = this.getDrcInfo(node);
        const viaClearance = this.params.viaClearance || 0;
        
        const effectiveDims = {
            width: drcDims.width + viaClearance,
            height: drcDims.height + viaClearance
        };
        return { drcDims: effectiveDims, drcShape };
    }

    updateGraph(newGraph) {
        if (!newGraph) return;

        const oldOutline = this.graph.board_outline;
        const newOutline = newGraph.board_outline;
        
        this.graph = newGraph; // Update the graph first
    
        if (JSON.stringify(oldOutline) !== JSON.stringify(newOutline)) {
            this.updateBoundaryWalls();
        }
    }
    
    addAgent(node) {
        if (this.agents.has(node.id)) return;

        this.nodeMap.set(node.id, { ...node });
        if (node.pins) this.pinDataMap.set(node.id, new Map(node.pins.map(p => [p.name, p])));

        const boardThickness = 1.6 * this.SCALE;
        const isGameMode = this.mode === 'robotics';
        
        const initialY = isGameMode 
            ? 1.0 * this.SCALE
            : ((node.side === 'bottom') ? -boardThickness / 2 : boardThickness / 2);

        const initialX = (node.x || (Math.random() - 0.5) * 50) * this.SCALE;
        const initialZ = (node.y || (Math.random() - 0.5) * 50) * this.SCALE;
        const initialRot = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(0, (node.rotation || 0) * Math.PI / 180, 0));
        
        this.agents.set(node.id, {
            pos: { x: initialX, y: initialY, z: initialZ },
            rot: initialRot,
            angularVel: { x: 0, y: 0, z: 0 }, // Initialize angular velocity
            drcStatus: 'ok',
            lastForces: {},
        });

        // --- Create Rapier Body and Collider ---
        const bodyType = isGameMode ? this.RAPIER.RigidBodyType.KinematicPositionBased : this.RAPIER.RigidBodyType.Dynamic;
        
        const rigidBodyDesc = new this.RAPIER.RigidBodyDesc(bodyType)
            .setTranslation(initialX, initialY, initialZ)
            .setRotation({ x: initialRot.x, y: initialRot.y, z: initialRot.z, w: initialRot.w })
            .enabledTranslations(!isGameMode, true, !isGameMode)
            .enabledRotations(false, true, false)
            .setLinearDamping(isGameMode ? 0.0 : 5.0)
            .setAngularDamping(isGameMode ? 0.0 : 5.0)
            .setCcdEnabled(true);
        
        const body = this.world.createRigidBody(rigidBodyDesc);
        
        const { drcDims, drcShape } = this.getEffectiveDrcInfo(node);
        const colliderWidth = drcDims.width * this.SCALE;
        const colliderHeight = drcDims.height * this.SCALE;
        
        let colliderDesc;
        const colliderThickness = isGameMode ? 1.0 * this.SCALE : 1.0 * this.SCALE;

        if (drcShape === 'circle') {
            const radius = Math.max(colliderWidth, colliderHeight) / 2;
            colliderDesc = this.RAPIER.ColliderDesc.cylinder(colliderThickness / 2, radius);
        } else { // rectangle
            colliderDesc = this.RAPIER.ColliderDesc.cuboid(colliderWidth / 2, colliderThickness / 2, colliderHeight / 2);
        }

        this.world.createCollider(colliderDesc, body);
        this.rigidBodyMap.set(node.id, body);
        this.handleToAgentIdMap.set(body.handle, node.id);

        if (isGameMode && node.behaviorType === 'patroller') {
            this.agentAIState.set(node.id, {
                behavior: 'patroller',
                target: this.getRandomTarget()
            });
        }
        
        this.isStable = false;
        this.step_count = 0;
    }
    
    updateNode(node) {
        if (this.nodeMap.has(node.id)) {
            this.nodeMap.set(node.id, { ...node });
            this.isStable = false;
        }
    }

    updateParams(newParams) {
        if (this.mode === 'robotics') return;

        const oldKp = this.params.proximityKp;
        const oldKd = this.params.proximityKd;

        this.params = { ...this.params, ...newParams };

        const newKp = this.params.proximityKp;
        const newKd = this.params.proximityKd;

        // If PID parameters have changed, rebuild all PID controllers
        if ((oldKp !== newKp || oldKd !== newKd) && this.world.removePidController) {
            const controllersToRebuild = new Map(this.pidControllers);
            
            this.pidControllers.forEach((pidInfo, key) => {
                this.world.removePidController(pidInfo.controller);
            });
            this.pidControllers.clear();

            controllersToRebuild.forEach((pidInfo, key) => {
                const newController = this.world.createPidController(
                    this.params.proximityKp,
                    this.params.proximityKi,
                    this.params.proximityKd,
                    pidInfo.axesMask // Use the stored axes mask
                );
                this.pidControllers.set(key, { ...pidInfo, controller: newController });
            });
        }

        this.isStable = false;
        this.step_count = 0;
    }
    
    updateEdges(newEdges) {
        if (this.graph) { this.graph.edges = newEdges; this.isStable = false; this.totalForceHistory = []; this.step_count = 0; }
    }

    updateRules(newRules) {
        if (!this.graph) return;

        this.graph.rules = newRules;
        this.isStable = false;
        this.totalForceHistory = [];
        this.step_count = 0;

        const activeRules = (newRules || []).filter(rule => rule.enabled !== false);
        const newPidKeys = new Set();
        
        activeRules.forEach((rule, ruleIndex) => {
            // --- PID Controller Management ---
            const linearAxes = this.RAPIER.PidAxesMask.LinX | this.RAPIER.PidAxesMask.LinZ;
            const allAxes = linearAxes | this.RAPIER.PidAxesMask.AngY;

            if (rule.type === 'ProximityConstraint') {
                (rule.groups || []).forEach(group => {
                    if (!Array.isArray(group) || group.length < 2) return;
                    const anchorId = group[0];
                    group.slice(1).forEach(satelliteId => {
                        const key = \`prox-\${anchorId}-\${satelliteId}\`;
                        newPidKeys.add(key);
                        if (!this.pidControllers.has(key)) {
                            const controller = this.world.createPidController(this.params.proximityKp, this.params.proximityKi, this.params.proximityKd, linearAxes);
                            this.pidControllers.set(key, { type: 'proximity', controller, rule, anchorId, satelliteId, axesMask: linearAxes });
                        }
                    });
                });
            } else if (rule.type === 'CircularConstraint') {
                 (rule.components || []).forEach(componentId => {
                    const key = \`circ-\${ruleIndex}-\${componentId}\`;
                    newPidKeys.add(key);
                    if (!this.pidControllers.has(key)) {
                        const controller = this.world.createPidController(this.params.proximityKp, this.params.proximityKi, this.params.proximityKd, allAxes);
                        this.pidControllers.set(key, { type: 'circular', controller, rule, componentId, axesMask: allAxes });
                    }
                });
            } else if (rule.type === 'SymmetricalPairConstraint') {
                const pair = rule.pair || [];
                if (Array.isArray(pair) && pair.length === 2) {
                    pair.forEach(componentId => {
                        const key = \`sym_pair-\${ruleIndex}-\${componentId}\`;
                        newPidKeys.add(key);
                        if (!this.pidControllers.has(key)) {
                             const controller = this.world.createPidController(this.params.proximityKp, this.params.proximityKi, this.params.proximityKd, allAxes);
                             this.pidControllers.set(key, { type: 'symmetrical_pair', controller, rule, componentId, axesMask: allAxes });
                        }
                    });
                }
            }
        });

        // --- Cleanup Stale PIDs ---
        for (const key of this.pidControllers.keys()) {
            if (!newPidKeys.has(key)) {
                const { controller } = this.pidControllers.get(key);
                if (this.world.removePidController) this.world.removePidController(controller);
                this.pidControllers.delete(key);
            }
        }
    }

    updateNodeDimensions(agentId, width, height) {
        const node = this.nodeMap.get(agentId);
        if (node && !node.drc_dimensions) {
            node.svg_drc_dimensions = { width, height };
            node.svg_drc_shape = 'rectangle';
            this.isStable = false;
        }
    }

    getNode(agentId) { return this.nodeMap.get(agentId); }

    dragAgent(agentId, newPosition) {
        this.draggedAgentId = agentId;
        const body = this.rigidBodyMap.get(agentId);
        if (body) {
            if (this.draggedBodyOriginalType === null) {
                this.draggedBodyOriginalType = body.bodyType();
            }
            body.setBodyType(this.RAPIER.RigidBodyType.KinematicPositionBased, true);
            const currentTranslation = body.translation();
            body.setNextKinematicTranslation({ x: newPosition.x, y: currentTranslation.y, z: newPosition.z });
        }
    }

    stopDragAgent() {
        if (this.draggedAgentId) {
            const body = this.rigidBodyMap.get(this.draggedAgentId);
            if (body && this.draggedBodyOriginalType !== null) {
                // Restore to Dynamic. The next step() will set it back to Kinematic if a rule applies.
                body.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
            }
        }
        this.draggedAgentId = null;
        this.draggedBodyOriginalType = null;
    }
    
    toggleComponentSide(id) {
        const node = this.nodeMap.get(id);
        if (node) {
            node.side = node.side === 'bottom' ? 'top' : 'bottom';
            this.isStable = false;
            // Immediately update the physical position of the rigid body
            const body = this.rigidBodyMap.get(id);
            if (body) {
                const boardThickness = 1.6 * this.SCALE;
                const targetY = (node.side === 'bottom') ? -boardThickness / 2 : boardThickness / 2;
                const currentPos = body.translation();
                body.setTranslation({ x: currentPos.x, y: targetY, z: currentPos.z }, true);
            }
        }
    }
    
    getDrcInfo(node) {
        if (this.mode === 'robotics' && (node.type === 'wall' || node.type === 'tree' || node.type === 'rough_terrain')) {
            return { drcDims: { width: 1.0, height: 1.0 }, drcShape: 'rectangle' };
        }
        if (node.drc_dimensions) return { drcDims: node.drc_dimensions, drcShape: node.drc_shape || 'rectangle' };
        if (node.svg_drc_dimensions) return { drcDims: node.svg_drc_dimensions, drcShape: node.svg_drc_shape || 'rectangle' };
        return { drcDims: { width: 2.54, height: 2.54 }, drcShape: 'rectangle' };
    }

    updateBoundaryWalls() {
        // Clear any existing walls before creating new ones.
        this.boundaryWalls.forEach(body => this.world.removeRigidBody(body));
        this.boundaryWalls = [];
    
        const outline = this.graph.board_outline;
        if (!outline || !outline.width || !outline.height) {
            return; // No outline defined, so no walls.
        }

        if (this.mode === 'robotics') {
            const groundSize = Math.max(outline.width, outline.height) * this.SCALE * 2;
            const groundBodyDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1 * this.SCALE, 0);
            const groundBody = this.world.createRigidBody(groundBodyDesc);
            const groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.1 * this.SCALE, groundSize / 2);
            this.world.createCollider(groundColliderDesc, groundBody);
            this.boundaryWalls.push(groundBody);
        }
        
        const wallHeight = 10 * this.SCALE;

        if (outline.shape === 'rectangle') {
            const { x, y, width, height } = outline;
            const wallThickness = 1 * this.SCALE;
            const wallHalfThickness = wallThickness / 2;
        
            const boardMinX = x * this.SCALE;
            const boardMaxX = (x + width) * this.SCALE;
            const boardMinZ = y * this.SCALE;
            const boardMaxZ = (y + height) * this.SCALE;
            
            const wallPositions = [
                { x: (boardMinX + boardMaxX) / 2, z: boardMinZ - wallHalfThickness, hx: (width * this.SCALE + wallThickness) / 2, hz: wallHalfThickness },
                { x: (boardMinX + boardMaxX) / 2, z: boardMaxZ + wallHalfThickness, hx: (width * this.SCALE + wallThickness) / 2, hz: wallHalfThickness },
                { x: boardMinX - wallHalfThickness, z: (boardMinZ + boardMaxZ) / 2, hx: wallHalfThickness, hz: (height * this.SCALE) / 2 },
                { x: boardMaxX + wallHalfThickness, z: (boardMinZ + boardMaxZ) / 2, hx: wallHalfThickness, hz: (height * this.SCALE) / 2 },
            ];
            
            wallPositions.forEach(pos => {
                const wallBodyDesc = this.RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, 0, pos.z);
                const wallBody = this.world.createRigidBody(wallBodyDesc);
                const wallColliderDesc = this.RAPIER.ColliderDesc.cuboid(pos.hx, wallHeight / 2, pos.hz);
                this.world.createCollider(wallColliderDesc, wallBody);
                this.boundaryWalls.push(wallBody);
            });

        } else if (outline.shape === 'circle') {
            const radius = (outline.width / 2) * this.SCALE;
            const centerX = (outline.x + outline.width / 2) * this.SCALE;
            const centerZ = (outline.y + outline.height / 2) * this.SCALE;
            const numSegments = 64; // More segments provide a better circular approximation.

            for (let i = 0; i < numSegments; i++) {
                const angle = (i / numSegments) * 2 * Math.PI;
                
                // Position of the center of the wall segment
                const wallX = centerX + radius * Math.cos(angle);
                const wallZ = centerZ + radius * Math.sin(angle);
                
                const segmentLength = (2 * Math.PI * radius) / numSegments;
                const wallThickness = 1 * this.SCALE;

                const wallBodyDesc = this.RAPIER.RigidBodyDesc.fixed()
                    .setTranslation(wallX, 0, wallZ)
                    .setRotation({ w: Math.cos((angle + Math.PI/2) / 2), x: 0, y: Math.sin((angle + Math.PI/2) / 2), z: 0 });

                const wallBody = this.world.createRigidBody(wallBodyDesc);
                const wallColliderDesc = this.RAPIER.ColliderDesc.cuboid(segmentLength / 2, wallHeight / 2, wallThickness / 2);
                
                this.world.createCollider(wallColliderDesc, wallBody);
                this.boundaryWalls.push(wallBody);
            }
        }
    }

    updateDynamicBoardOutline() {
        if (this.step_count < 100) return;

        if (!this.graph.board_outline || !this.graph.board_outline.autoSize) return;
        if (this.agents.size === 0) return;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        this.agents.forEach((agent, id) => {
            const node = this.nodeMap.get(id);
            if (!node) return;
            const body = this.rigidBodyMap.get(id);
            if (!body) return;
            const { drcDims } = this.getDrcInfo(node);
            const corners = this.getRotatedRectCorners({ pos: body.translation(), rot: body.rotation() }, drcDims);
            corners.forEach(corner => {
                minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
                minZ = Math.min(minZ, corner.z); maxZ = Math.max(maxZ, corner.z);
            });
        });
        if (minX === Infinity) return;
        const padding = this.params.boardPadding * this.SCALE;
        minX -= padding; maxX += padding; minZ -= padding; maxZ += padding;
        const boardWidth = maxX - minX; const boardHeight = maxZ - minZ;
        let newOutline;
        if (this.graph.board_outline.shape === 'circle') {
            const diameter = Math.max(boardWidth, boardHeight);
            const centerX = minX + boardWidth / 2; const centerZ = minZ + boardHeight / 2;
            newOutline = { ...this.graph.board_outline, width: diameter / this.SCALE, height: diameter / this.SCALE, x: (centerX - diameter / 2) / this.SCALE, y: (centerZ - diameter / 2) / this.SCALE };
        } else {
            newOutline = { ...this.graph.board_outline, width: boardWidth / this.SCALE, height: boardHeight / this.SCALE, x: minX / this.SCALE, y: minZ / this.SCALE };
        }
        const old = this.graph.board_outline;
        if (Math.abs(old.width - newOutline.width) > 0.1 || Math.abs(old.height - newOutline.height) > 0.1) {
            this.onUpdateLayout(prev => ({ ...prev, board_outline: newOutline }));
        }
    }

    step() {
        if (this.agents.size === 0) return;
        this.step_count++;
        if (this.mode !== 'robotics') {
            this.calculateForcesAndTorques();
        }
        this.world.step(this.eventQueue);
        this.updateAgentStateFromPhysics();
        if (this.graph.board_outline?.autoSize) this.updateDynamicBoardOutline();
        this.updateDRCStatus(this.eventQueue);
    }
    
    updateAgentStateFromPhysics() {
        this.agents.forEach((agent, id) => {
            const body = this.rigidBodyMap.get(id);
            if (body) {
                const pos = body.translation(), rot = body.rotation(), angvel = body.angvel();
                agent.pos = { x: pos.x, y: pos.y, z: pos.z };
                agent.rot = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
                agent.angularVel = { x: angvel.x, y: angvel.y, z: angvel.z };
            }
        });
    }

    getPosition(id) { return this.agents.get(id)?.pos; }
    
    getRotation(id) { 
        const agent = this.agents.get(id);
        const node = this.nodeMap.get(id);
        if (!agent || !node) return new this.THREE.Quaternion();
        
        const baseQuat = new this.THREE.Quaternion(agent.rot.x, agent.rot.y, agent.rot.z, agent.rot.w);

        if (node.side === 'bottom') {
            const flipQuat = new this.THREE.Quaternion().setFromAxisAngle(new this.THREE.Vector3(1, 0, 0), Math.PI);
            baseQuat.multiply(flipQuat);
        }

        return baseQuat;
    }
    
    getFinalPositions() {
        const positions = {};
        this.agents.forEach((agent, id) => {
            const node = this.nodeMap.get(id);
            const body = this.rigidBodyMap.get(id);
            if(!node || !body) return;
            const bodyRot = body.rotation();
            const euler = new this.THREE.Euler().setFromQuaternion(new this.THREE.Quaternion(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w), 'YXZ');
            let finalRotationDegrees = (euler.y * 180 / Math.PI) % 360;
            if(finalRotationDegrees < 0) finalRotationDegrees += 360;

            positions[id] = { 
                x: agent.pos.x / this.SCALE, y: agent.pos.z / this.SCALE, 
                rotation: Math.round(finalRotationDegrees * 100) / 100, side: node.side || 'top' 
            };
        });
        return positions;
    }
    
    cleanup() {
        if (!this.world) {
            return;
        }

        this.rigidBodyMap.forEach(body => {
            if (this.world.getRigidBody(body.handle)) {
                this.world.removeRigidBody(body);
            }
        });

        this.boundaryWalls.forEach(body => {
            if (this.world.getRigidBody(body.handle)) {
                this.world.removeRigidBody(body);
            }
        });

        if (this.world.removePidController) {
            this.pidControllers.forEach(({ controller }) => {
                this.world.removePidController(controller);
            });
        }
        this.pidControllers.clear();

        this.rigidBodyMap.clear();
        this.handleToAgentIdMap.clear();
        this.boundaryWalls = [];
        this.agents.clear();

        if (this.eventQueue) {
            this.eventQueue.free();
            this.eventQueue = null;
        }
        
        this.world.free();
        this.world = null;
    }
`