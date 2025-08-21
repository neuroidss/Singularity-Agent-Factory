//bootstrap/sim/agent_simulation.ts
// This file now only contains the core simulation loop and state management.
// Force and collision logic has been moved to separate files.

export const AgentSimulationCoreString = `
    constructor(graphData, scale, THREE, mode) {
        this.THREE = THREE;
        this.graph = graphData; // Initially may have no nodes/edges
        this.SCALE = scale;
        this.mode = mode; // 'pcb' or 'robotics'
        this.nodeMap = new Map();
        this.agents = new Map();
        this.draggedAgentId = null;
        this.step_count = 0;

        // --- Simulation Parameters (Heuristics) ---
        this.params = {
            componentSpacing: 200.0,
            netLengthWeight: 0.01,
            boardEdgeConstraint: 10.0,
            settlingSpeed: 0.9,
            repulsionRampUpTime: 300, // Time in frames (60 frames ~ 1s)
            distributionStrength: 0.5, // New force to spread components out
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
        };
        
        if (this.mode === 'robotics') {
            this.params = {
                ...this.params,
                componentSpacing: 10.0, // Minimal repulsion between robots
                netLengthWeight: 0,
                boardEdgeConstraint: 50.0, // Strong walls
                distributionStrength: 0,   // No center repulsion
                // Disable all PCB-specific rule forces
                proximityStrength: 0,
                symmetryStrength: 0,
                alignmentStrength: 0,
                circularStrength: 0,
                symmetricalPairStrength: 0,
                absolutePositionStrength: 0,
                fixedRotationStrength: 0,
                symmetryRotationStrength: 0,
                circularRotationStrength: 0,
            };
        }


        this.pinDataMap = new Map();
        
        // --- Stability detection ---
        this.totalForceHistory = [];
        this.STABILITY_THRESHOLD = 0.5; // Avg force must be below this to be stable
        this.STABILITY_WINDOW = 100; // Over how many frames to average the force
        this.isStable = false;
    }
    
    addAgent(node) {
        if (this.agents.has(node.id)) return;

        this.nodeMap.set(node.id, { ...node });

        // Pre-calculate pin data maps for efficiency
        if (node.pins) {
            const pins = new Map(node.pins.map(p => [p.name, p]));
            this.pinDataMap.set(node.id, pins);
        }

        const boardThickness = 1.6 * this.SCALE;
        const initialY = (node.side === 'bottom') ? -boardThickness / 2 : boardThickness / 2;
        const initialX = (node.x || (Math.random() - 0.5) * 50) * this.SCALE;
        const initialZ = (node.y || (Math.random() - 0.5) * 50) * this.SCALE; // Note: graph \`y\` maps to sim \`z\`
        const initialRot = new this.THREE.Quaternion().setFromEuler(
            new this.THREE.Euler(0, (node.rotation || 0) * Math.PI / 180, 0)
        );
        
        let inertia = 1.0;
        if (this.mode === 'robotics' && (node.type === 'wall' || node.type === 'tree')) {
            // Make walls and trees heavy but not static. Robots have an inertia of 1.0.
            inertia = 100.0; 
        }
        
        this.agents.set(node.id, {
            pos: { x: initialX, y: initialY, z: initialZ },
            vel: { x: 0, y: 0, z: 0 },
            force: { x: 0, y: 0, z: 0 },
            rot: initialRot,
            angularVel: { x: 0, y: 0, z: 0 },
            torque: { x: 0, y: 0, z: 0 },
            lastForces: {},
            drcStatus: 'ok',
            placementInertia: inertia,
        });
        
        this.isStable = false;
    }
    
    updateNode(node) {
        if (this.nodeMap.has(node.id)) {
            this.nodeMap.set(node.id, { ...node });
            this.isStable = false;
        }
    }

    updateParams(newParams) {
        // In robotics mode, UI-driven param changes are ignored to keep physics stable
        if (this.mode === 'robotics') return;
        this.params = { ...this.params, ...newParams };
        this.isStable = false;
        this.step_count = 0; // Restart ramp when params change
    }

    updateAgentParam(agentId, key, value) {
        const agent = this.agents.get(agentId);
        if (agent) {
            if (key === 'placementInertia') {
                 agent.placementInertia = Math.max(0.1, value); // Ensure inertia doesn't go to zero
            }
        }
    }
    
    updateEdges(newEdges) {
        if (this.graph) {
            this.graph.edges = newEdges;
            this.isStable = false;
            this.totalForceHistory = [];
        }
    }

    updateRules(newRules) {
        if (this.graph) {
            console.log('[DEBUG] AgentSimulation.updateRules called. New rule count:', newRules.length);
            this.graph.rules = newRules;
            this.isStable = false; // Rules changed, layout is no longer stable
            this.totalForceHistory = [];
            this.step_count = 0; // Restart ramp when rules change
        }
    }

    updateNodeDimensions(agentId, width, height) {
        const node = this.nodeMap.get(agentId);
        if (node) {
            // This is the fallback mechanism. If server-provided DRC dimensions
            // are NOT present, we use the dimensions derived from the SVG.
            if (!node.drc_dimensions) {
                node.svg_drc_dimensions = { width, height };
                // The shape from a bounding box is always a rectangle.
                node.svg_drc_shape = 'rectangle';
                this.isStable = false; // Dimensions changed, re-evaluate stability
            }
        }
    }

    getNode(agentId) {
        return this.nodeMap.get(agentId);
    }

    dragAgent(agentId, newPosition) {
        this.draggedAgentId = agentId;
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.pos.x = newPosition.x;
            agent.pos.z = newPosition.z;
            agent.vel = { x: 0, y: 0, z: 0 };
        }
    }

    stopDragAgent() { this.draggedAgentId = null; }
    toggleComponentSide(id) {
        const node = this.nodeMap.get(id);
        if (node) {
            node.side = node.side === 'bottom' ? 'top' : 'bottom';
            this.isStable = false;
        }
    }
    
    getPlaceholderInfo(node) {
        const placeholderDims = node.placeholder_dimensions || { width: 2.54, height: 2.54 };
        const placeholderShape = node.placeholder_shape || 'rectangle';
        return { placeholderDims, placeholderShape };
    }

    getDrcInfo(node) {
        if (this.mode === 'robotics' && (node.type === 'wall' || node.type === 'tree' || node.type === 'rough_terrain')) {
            return { drcDims: { width: 1.0, height: 1.0 }, drcShape: 'rectangle' };
        }

        // 1. Prioritize server-provided DRC dimensions from KiCad footprints
        if (node.drc_dimensions) {
            return { drcDims: node.drc_dimensions, drcShape: node.drc_shape || 'rectangle' };
        }
        
        // 2. Fallback to dimensions derived from SVG bounding box (client-only demo)
        if (node.svg_drc_dimensions) {
            return { drcDims: node.svg_drc_dimensions, drcShape: node.svg_drc_shape || 'rectangle' };
        }

        // 3. Final fallback to a generic placeholder if no other info is available
        const defaultDims = { width: 2.54, height: 2.54 };
        return { drcDims: defaultDims, drcShape: 'rectangle' };
    }

    step() {
        this.step_count++;
        // Introduce a "settling" phase at the start with high damping to prevent explosions.
        const SETTLING_FRAMES = 200;
        const DAMPING = this.step_count < SETTLING_FRAMES ? 0.85 : this.params.settlingSpeed;
        const DT = 0.016;      
        const allPinWorldPos = {};
        this.agents.forEach((_, id) => { allPinWorldPos[id] = this.getPinWorldPos(id); });
        
        // --- Phase 1: Force Calculation ---
        this.calculateForcesForAgent(allPinWorldPos);
        this.applyLayerForces();
        
        // --- Soft Repulsion (Ramp-Up) ---
        if (this.step_count <= this.params.repulsionRampUpTime) {
            this.applySoftRepulsion();
        }
        
        // --- Physics Integration ---
        this.agents.forEach((agent, id) => {
            if (id === this.draggedAgentId) { 
                agent.vel = { x: 0, y: 0, z: 0 };
                agent.angularVel = { x: 0, y: 0, z: 0 };
                return;
            }
            
            const inertia = agent.placementInertia || 1.0;
            agent.vel.x = (agent.vel.x + (agent.force.x / inertia) * DT) * DAMPING;
            agent.vel.y = (agent.vel.y + (agent.force.y / inertia) * DT) * DAMPING;
            agent.vel.z = (agent.vel.z + (agent.force.z / inertia) * DT) * DAMPING;
            agent.pos.x += agent.vel.x * DT;
            agent.pos.y += agent.vel.y * DT;
            agent.pos.z += agent.vel.z * DT;

            const angularInertia = inertia * 100;
            agent.angularVel.y = (agent.angularVel.y + (agent.torque.y / angularInertia) * DT) * DAMPING;
            if (Math.abs(agent.angularVel.y) > 1e-6) {
                const deltaRot = new this.THREE.Quaternion().setFromAxisAngle(new this.THREE.Vector3(0, 1, 0), agent.angularVel.y * DT);
                agent.rot.premultiply(deltaRot);
                agent.rot.normalize();
            }

            if (isNaN(agent.pos.x) || isNaN(agent.pos.y) || isNaN(agent.pos.z)) {
                console.error(\`Agent \${id} position became NaN. Resetting. Force:\`, agent.force);
                agent.pos = { x: 0, y: 0, z: 0 };
                agent.vel = { x: 0, y: 0, z: 0 };
            }
        });

        // --- Phase 2: Hard Collision (Post Ramp-Up) ---
        if (this.step_count > this.params.repulsionRampUpTime) {
            const collisionIterations = 5;
            for (let i = 0; i < collisionIterations; i++) {
                this.resolveCollisions();
            }
        }

        const totalSystemForce = Array.from(this.agents.values()).reduce((sum, agent) => {
            return sum + Math.hypot(agent.force.x, agent.force.y, agent.force.z, agent.torque.y);
        }, 0);
        this.totalForceHistory.push(totalSystemForce);
        if (this.totalForceHistory.length > this.STABILITY_WINDOW) {
            this.totalForceHistory.shift();
        }
        if (!this.isStable && this.totalForceHistory.length === this.STABILITY_WINDOW) {
            const avgForce = this.totalForceHistory.reduce((a, b) => a + b, 0) / this.STABILITY_WINDOW;
            if (avgForce < this.STABILITY_THRESHOLD) {
                this.isStable = true;
            }
        }
        
        this.updateDRCStatus();
    }

    getPosition(id) { return this.agents.get(id)?.pos; }
    getRotation(id) { 
        const agent = this.agents.get(id);
        const node = this.nodeMap.get(id);
        if (!agent || !node) return new this.THREE.Quaternion();
        
        const baseQuat = agent.rot.clone();

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
            const finalEuler = new this.THREE.Euler().setFromQuaternion(agent.rot, 'YXZ');
            let finalRotationDegrees = finalEuler.y * 180 / Math.PI;
            
            finalRotationDegrees = (finalRotationDegrees % 360 + 360) % 360;

            positions[id] = { 
                x: agent.pos.x / this.SCALE, 
                y: agent.pos.z / this.SCALE, 
                rotation: finalRotationDegrees, 
                side: node?.side || 'top' 
            };
        });
        return positions;
    }
    getDebugInfo() {
        const info = {};
        this.agents.forEach((agent, id) => {
            info[id] = { totalForce: { x: agent.force.x, z: agent.force.z }, forces: agent.lastForces, drcStatus: agent.drcStatus };
        });
        return info;
    }
    cleanup() {}
`
