//bootstrap/simagent_simulation.ts is typescript file with text variable with python code
export const AgentSimulationClassString = `
class AgentSimulation {
    constructor(graphData, scale, THREE) {
        this.THREE = THREE;
        this.graph = graphData;
        this.SCALE = scale;
        this.nodeMap = new Map(this.graph.nodes.map(n => [n.id, { ...n }]));
        this.agents = new Map();
        this.draggedAgentId = null;

        // Pre-calculate pin data maps for efficiency
        this.pinDataMap = new Map();
        this.graph.nodes.forEach(n => {
            if (n.pins) {
                const pins = new Map(n.pins.map(p => [p.name, p]));
                this.pinDataMap.set(n.id, pins);
            }
        });

        this.graph.nodes.forEach(node => {
            const boardThickness = 1.6 * this.SCALE;
            const initialY = (node.side === 'bottom') ? -boardThickness / 2 : boardThickness / 2;
            const initialX = (node.x || (Math.random() - 0.5) * 50) * this.SCALE;
            const initialZ = (node.y || (Math.random() - 0.5) * 50) * this.SCALE; // Note: graph \`y\` maps to sim \`z\`
            this.agents.set(node.id, {
                pos: { x: initialX, y: initialY, z: initialZ },
                vel: { x: 0, y: 0, z: 0 },
                force: { x: 0, y: 0, z: 0 },
                lastForces: {},
                drcStatus: 'ok',
            });
        });
        
        // --- Stability detection ---
        this.totalForceHistory = [];
        this.STABILITY_THRESHOLD = 0.5; // Avg force must be below this to be stable
        this.STABILITY_WINDOW = 100; // Over how many frames to average the force
        this.isStable = false;
    }

    updateNodeDimensions(agentId, width, height) {
        const node = this.nodeMap.get(agentId);
        if (node) {
            node.width = width;
            node.height = height;
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
        if (node) node.side = node.side === 'bottom' ? 'top' : 'bottom';
    }

    getPinWorldPos(agentId) {
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node) return {};
        const pinMap = this.pinDataMap.get(agentId);
        if (!pinMap) return {};

        const worldPositions = {};
        const angleRad = (node.rotation || 0) * (Math.PI / 180);
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        pinMap.forEach((pin, pinName) => {
            const localX = pin.x * this.SCALE;
            const localZ = pin.y * this.SCALE;
            const rotatedX = localX * cosA - localZ * sinA;
            const rotatedZ = localX * sinA + localZ * cosA;
            worldPositions[pinName] = { x: agent.pos.x + rotatedX, z: agent.pos.z + rotatedZ };
        });
        return worldPositions;
    }

    applyRepulsionForAgent(agentId) {
        const K_REPULSION = 60.0;
        const currentAgent = this.agents.get(agentId);
        const currentNode = this.nodeMap.get(agentId);
        if (!currentAgent || !currentNode) return;

        const current_w = (currentNode.CrtYdDimensions?.width || currentNode.width) * this.SCALE;
        const current_h = (currentNode.CrtYdDimensions?.height || currentNode.height) * this.SCALE;
        const current_w2 = current_w / 2;
        const current_h2 = current_h / 2;

        const current_x_min = currentAgent.pos.x - current_w2;
        const current_x_max = currentAgent.pos.x + current_w2;
        const current_z_min = currentAgent.pos.z - current_h2;
        const current_z_max = currentAgent.pos.z + current_h2;

        this.agents.forEach((otherAgent, otherId) => {
            if (agentId === otherId) return;
            const otherNode = this.nodeMap.get(otherId);
            if (!otherNode || currentNode.side !== otherNode.side) return;
            
            const other_w = (otherNode.CrtYdDimensions?.width || otherNode.width) * this.SCALE;
            const other_h = (otherNode.CrtYdDimensions?.height || otherNode.height) * this.SCALE;
            const other_w2 = other_w / 2;
            const other_h2 = other_h / 2;

            const other_x_min = otherAgent.pos.x - other_w2;
            const other_x_max = otherAgent.pos.x + other_w2;
            const other_z_min = otherAgent.pos.z - other_h2;
            const other_z_max = otherAgent.pos.z + other_h2;

            if (current_x_min < other_x_max && current_x_max > other_x_min && current_z_min < other_z_max && current_z_max > other_z_min) {
                const overlap_x = Math.min(current_x_max, other_x_max) - Math.max(current_x_min, other_x_min);
                const overlap_z = Math.min(current_z_max, other_z_max) - Math.max(current_z_min, other_z_min);
                let force_x = 0, force_z = 0;
                if (overlap_x < overlap_z) {
                    force_x = (currentAgent.pos.x < otherAgent.pos.x ? -1 : 1) * overlap_x * K_REPULSION;
                } else {
                    force_z = (currentAgent.pos.z < otherAgent.pos.z ? -1 : 1) * overlap_z * K_REPULSION;
                }
                currentAgent.force.x += force_x;
                currentAgent.force.z += force_z;
                currentAgent.lastForces['Repulsion'] = (currentAgent.lastForces['Repulsion'] || 0) + Math.hypot(force_x, force_z);
            }
        });
    }

    applyNetAttractionForAgent(agentId, allPinWorldPos) {
        const K_SPRING = 0.01; 
        const currentAgent = this.agents.get(agentId);
        if (!currentAgent) return;
    
        (this.graph.edges || []).forEach(edge => {
            const [sourceComp, sourcePin] = edge.source.split('-');
            const [targetComp, targetPin] = edge.target.split('-');
            let otherCompId = null, thisPinName = null, otherPinName = null;
            if (sourceComp === agentId) {
                otherCompId = targetComp; thisPinName = sourcePin; otherPinName = targetPin;
            } else if (targetComp === agentId) {
                otherCompId = sourceComp; thisPinName = targetPin; otherPinName = sourcePin;
            }
    
            if (otherCompId && otherCompId !== agentId) {
                const thisPinPos = allPinWorldPos[agentId]?.[thisPinName];
                const otherPinPos = allPinWorldPos[otherCompId]?.[otherPinName];
                if (thisPinPos && otherPinPos) {
                    const dx = otherPinPos.x - thisPinPos.x;
                    const dz = otherPinPos.z - thisPinPos.z;
                    const fx = dx * K_SPRING;
                    const fz = dz * K_SPRING;
                    currentAgent.force.x += fx;
                    currentAgent.force.z += fz;
                    const forceMag = Math.hypot(fx, fz);
                    currentAgent.lastForces['NetAttraction'] = (currentAgent.lastForces['NetAttraction'] || 0) + forceMag;
                }
            }
        });
    }
    
     applyContainmentForAgent(agentId) {
        const K_CONTAINMENT = 10.0;
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node || !this.graph.board_outline) return;

        const { x, y, width, height, shape } = this.graph.board_outline;
        const node_w = (node.CrtYdDimensions?.width || node.width) * this.SCALE;
        const node_h = (node.CrtYdDimensions?.height || node.height) * this.SCALE;
        const node_w2 = node_w / 2;
        const node_h2 = node_h / 2;

        if (shape === 'circle') {
            const centerX = (x + width / 2) * this.SCALE;
            const centerZ = (y + height / 2) * this.SCALE;
            const radius = (width / 2) * this.SCALE;
            const dx = agent.pos.x - centerX;
            const dz = agent.pos.z - centerZ;
            const dist = Math.hypot(dx, dz);
            const max_extent = Math.hypot(node_w2, node_h2);
            if (dist + max_extent > radius) {
                if (dist < 1e-6) return; // Prevent division by zero if agent is at the center
                const penetration = (dist + max_extent) - radius;
                const forceX = -(dx / dist) * penetration * K_CONTAINMENT;
                const forceZ = -(dz / dist) * penetration * K_CONTAINMENT;
                agent.force.x += forceX;
                agent.force.z += forceZ;
                agent.lastForces['Containment'] = (agent.lastForces['Containment'] || 0) + Math.hypot(forceX, forceZ);
            }
        } else {
            const minX = x * this.SCALE + node_w2;
            const minZ = y * this.SCALE + node_h2;
            const maxX = (x + width) * this.SCALE - node_w2;
            const maxZ = (y + height) * this.SCALE - node_h2;
            let f = 0;
            if (agent.pos.x < minX) { agent.force.x += K_CONTAINMENT; f+=K_CONTAINMENT; }
            if (agent.pos.x > maxX) { agent.force.x -= K_CONTAINMENT; f+=K_CONTAINMENT; }
            if (agent.pos.z < minZ) { agent.force.z += K_CONTAINMENT; f+=K_CONTAINMENT; }
            if (agent.pos.z > maxZ) { agent.force.z -= K_CONTAINMENT; f+=K_CONTAINMENT; }
            if (f > 0) agent.lastForces['Containment'] = (agent.lastForces['Containment'] || 0) + f;
        }
    }

    applySymmetryForAgent(agentId, rule) {
        const K_SYMMETRY = 2.0;
        const axis = rule.axis || 'vertical';
        const pair = rule.pairs.find(p => p.includes(agentId));
        if (!pair) return;

        const otherId = pair[0] === agentId ? pair[1] : pair[0];
        const agentA = this.agents.get(agentId);
        const agentB = this.agents.get(otherId);
        if (!agentA || !agentB) return;

        let targetAx, targetAz;
        if (axis === 'vertical') {
            targetAx = -agentB.pos.x;
            targetAz = agentB.pos.z;
        } else {
            targetAx = agentB.pos.x;
            targetAz = -agentB.pos.z;
        }
        const fx = (targetAx - agentA.pos.x) * K_SYMMETRY;
        const fz = (targetAz - agentA.pos.z) * K_SYMMETRY;
        agentA.force.x += fx;
        agentA.force.z += fz;
        agentA.lastForces['Symmetry'] = (agentA.lastForces['Symmetry'] || 0) + Math.hypot(fx, fz);

        const nodeA = this.nodeMap.get(agentId);
        const nodeB = this.nodeMap.get(otherId);
        if (nodeA && nodeB) {
            const currentRotB = nodeB.rotation || 0;
            if (axis === 'vertical') nodeA.rotation = (180 - currentRotB + 360) % 360;
            else nodeA.rotation = (-currentRotB + 360) % 360;
        }
    }

    applySymmetricalPairForAgent(agentId, rule) {
        const { pair, axis, separation } = rule;
        const agent = this.agents.get(agentId);
        if (!agent || !pair.includes(agentId)) return;

        const otherId = pair[0] === agentId ? pair[1] : pair[0];
        const otherAgent = this.agents.get(otherId);
        if (!otherAgent) return;
        
        const K_PAIR = 5.0;
        const sep = separation * this.SCALE;

        if (axis === 'vertical') {
            const midZ = (agent.pos.z + otherAgent.pos.z) / 2;
            const fz_align = (midZ - agent.pos.z) * K_PAIR;
            agent.force.z += fz_align;
            const targetSign = (agentId === pair[0]) ? -1 : 1;
            const targetX = targetSign * sep / 2;
            const fx_sep = (targetX - agent.pos.x) * K_PAIR;
            agent.force.x += fx_sep;
            agent.lastForces['SymmetricalPair'] = (agent.lastForces['SymmetricalPair'] || 0) + Math.hypot(fx_sep, fz_align);
        } else {
            const midX = (agent.pos.x + otherAgent.pos.x) / 2;
            const fx_align = (midX - agent.pos.x) * K_PAIR;
            agent.force.x += fx_align;
            const targetSign = (agentId === pair[0]) ? -1 : 1;
            const targetZ = targetSign * sep / 2;
            const fz_sep = (targetZ - agent.pos.z) * K_PAIR;
            agent.force.z += fz_sep;
            agent.lastForces['SymmetricalPair'] = (agent.lastForces['SymmetricalPair'] || 0) + Math.hypot(fx_align, fz_sep);
        }
    }
    
    applyGroupAlignmentForAgent(agentId, rule) {
        const { components, axis } = rule;
        if (!components.includes(agentId)) return;
        const K_GROUP_ALIGN = 0.5;
        const groupAgents = components.map(id => this.agents.get(id)).filter(Boolean);
        if (groupAgents.length < 2) return;
        const currentAgent = this.agents.get(agentId);
        if (!currentAgent) return;

        if (axis === 'horizontal') {
            const avgZ = groupAgents.reduce((sum, a) => sum + a.pos.z, 0) / groupAgents.length;
            const forceZ = (0 - avgZ) * K_GROUP_ALIGN;
            currentAgent.force.z += forceZ;
            currentAgent.lastForces['GroupAlignment'] = (currentAgent.lastForces['GroupAlignment'] || 0) + Math.abs(forceZ);
        } else {
            const avgX = groupAgents.reduce((sum, a) => sum + a.pos.x, 0) / groupAgents.length;
            const forceX = (0 - avgX) * K_GROUP_ALIGN;
            currentAgent.force.x += forceX;
            currentAgent.lastForces['GroupAlignment'] = (currentAgent.lastForces['GroupAlignment'] || 0) + Math.abs(forceX);
        }
    }

    applyAlignmentForAgent(agentId, rule) {
        const K_ALIGN = 2.0;
        const axis = rule.axis || 'vertical';
        const agent = this.agents.get(agentId);
        if (!agent) return;
        let force = 0;
        if (axis === 'vertical') {
            const f = (0 - agent.pos.x) * K_ALIGN;
            agent.force.x += f;
            force = Math.abs(f);
        } else {
            const f = (0 - agent.pos.z) * K_ALIGN;
            agent.force.z += f;
            force = Math.abs(f);
        }
        agent.lastForces['Alignment'] = (agent.lastForces['Alignment'] || 0) + force;
    }

    applyProximityForAgent(agentId, rule) {
        const K_PROXIMITY = 0.2;
        const currentAgent = this.agents.get(agentId);
        if(!currentAgent) return;
        rule.groups.forEach(group => {
            if (!group.includes(agentId)) return;
            group.forEach(otherId => {
                if (otherId === agentId) return;
                const otherAgent = this.agents.get(otherId);
                if (otherAgent) {
                    const dx = otherAgent.pos.x - currentAgent.pos.x;
                    const dz = otherAgent.pos.z - currentAgent.pos.z;
                    const fx = dx * K_PROXIMITY;
                    const fz = dz * K_PROXIMITY;
                    currentAgent.force.x += fx;
                    currentAgent.force.z += fz;
                    currentAgent.lastForces['Proximity'] = (currentAgent.lastForces['Proximity'] || 0) + Math.hypot(fx, fz);
                }
            });
        });
    }

    applyCircularForAgent(agentId, rule) {
        const K_CIRCULAR = 2.0;
        const { components, radius, center } = rule;
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node) return;

        const agentIndex = components.indexOf(agentId);
        if (agentIndex === -1) return;

        const N = components.length;
        const angle = (2 * Math.PI / N) * agentIndex;
        const targetX = (center[0] + radius * Math.cos(angle)) * this.SCALE;
        const targetZ = (center[1] + radius * Math.sin(angle)) * this.SCALE;
        const fx = (targetX - agent.pos.x) * K_CIRCULAR;
        const fz = (targetZ - agent.pos.z) * K_CIRCULAR;
        agent.force.x += fx;
        agent.force.z += fz;
        agent.lastForces['Circular'] = (agent.lastForces['Circular'] || 0) + Math.hypot(fx, fz);
        const targetRotDegrees = (angle * 180 / Math.PI) - 90;
        node.rotation = (targetRotDegrees + 360) % 360;
    }
    
    applyLayerForces() {
        const K_LAYER = 5.0;
        const boardThickness = 1.6 * this.SCALE;
        this.agents.forEach((agent, id) => {
            const node = this.nodeMap.get(id);
            if (!node) return;
            const targetY = (node.side === 'bottom') ? -boardThickness / 2 : boardThickness / 2;
            const forceY = (targetY - agent.pos.y) * K_LAYER;
            agent.force.y += forceY;
            if (Math.abs(forceY) > 0.1) agent.lastForces['Layer'] = (agent.lastForces['Layer'] || 0) + Math.abs(forceY);
        });
    }

    applyFixedPropertyForAgent(agentId, rule) {
        const { properties } = rule;
        const node = this.nodeMap.get(agentId);
        if (!node) return;
        if (properties && 'rotation' in properties) node.rotation = properties.rotation;
    }

    calculateForcesForAgent(allPinWorldPos) {
        this.agents.forEach((agent, id) => {
            agent.force = { x: 0, y: 0, z: 0 };
            agent.lastForces = {};
            this.applyRepulsionForAgent(id);
            this.applyContainmentForAgent(id);
            this.applyNetAttractionForAgent(id, allPinWorldPos);

            (this.graph.rules || []).forEach(rule => {
                const componentList = rule.components || rule.pair || rule.pairs?.flat() || rule.groups?.flat();
                if (componentList && componentList.includes(id)) {
                    switch (rule.type) {
                        case 'SymmetryConstraint': this.applySymmetryForAgent(id, rule); break;
                        case 'AlignmentConstraint': this.applyAlignmentForAgent(id, rule); break;
                        case 'ProximityConstraint': this.applyProximityForAgent(id, rule); break;
                        case 'CircularConstraint': this.applyCircularForAgent(id, rule); break;
                        case 'FixedPropertyConstraint': this.applyFixedPropertyForAgent(id, rule); break;
                        case 'SymmetricalPairConstraint': this.applySymmetricalPairForAgent(id, rule); break;
                        case 'GroupAlignmentConstraint': this.applyGroupAlignmentForAgent(id, rule); break;
                    }
                }
            });
        });
    }

    updateDRCStatus() {
        const agentIds = Array.from(this.agents.keys());
        this.agents.forEach((agent) => { agent.drcStatus = 'ok'; });

        for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
                const idA = agentIds[i], idB = agentIds[j];
                const agentA = this.agents.get(idA), agentB = this.agents.get(idB);
                const nodeA = this.nodeMap.get(idA), nodeB = this.nodeMap.get(idB);
                if(nodeA.side !== nodeB.side) continue;
                const a_x_min = agentA.pos.x - (nodeA.width / 2 * this.SCALE), a_x_max = agentA.pos.x + (nodeA.width / 2 * this.SCALE);
                const a_z_min = agentA.pos.z - (nodeA.height / 2 * this.SCALE), a_z_max = agentA.pos.z + (nodeA.height / 2 * this.SCALE);
                const b_x_min = agentB.pos.x - (nodeB.width / 2 * this.SCALE), b_x_max = agentB.pos.x + (nodeB.width / 2 * this.SCALE);
                const b_z_min = agentB.pos.z - (nodeB.height / 2 * this.SCALE), b_z_max = agentB.pos.z + (nodeB.height / 2 * this.SCALE);
                if (a_x_min < b_x_max && a_x_max > b_x_min && a_z_min < b_z_max && a_z_max > b_z_min) {
                    agentA.drcStatus = 'overlap';
                    agentB.drcStatus = 'overlap';
                }
            }
        }
        if (this.graph.board_outline) {
             const { x, y, width, height, shape } = this.graph.board_outline;
            this.agents.forEach((agent, id) => {
                if (agent.drcStatus === 'ok') {
                    const node = this.nodeMap.get(id);
                    const node_w2 = (node.width / 2 * this.SCALE), node_h2 = (node.height / 2 * this.SCALE);
                    let isOutOfBounds = false;
                    if (shape === 'circle') {
                        const centerX = (x + width / 2) * this.SCALE, centerZ = (y + height / 2) * this.SCALE;
                        const radius = (width / 2) * this.SCALE;
                        const max_extent = Math.hypot(node_w2, node_h2);
                        const dist = Math.hypot(agent.pos.x - centerX, agent.pos.z - centerZ);
                        if (dist + max_extent > radius) isOutOfBounds = true;
                    } else {
                        const minX = x * this.SCALE, minZ = y * this.SCALE;
                        const maxX = (x + width) * this.SCALE, maxZ = (y + height) * this.SCALE;
                        if ( (agent.pos.x - node_w2) < minX || (agent.pos.x + node_w2) > maxX || (agent.pos.z - node_h2) < minZ || (agent.pos.z + node_h2) > maxZ ) isOutOfBounds = true;
                    }
                    if(isOutOfBounds) agent.drcStatus = 'out_of_bounds';
                }
            });
        }
    }
    step() {
        const DAMPING = 0.9, DT = 0.016;      
        const allPinWorldPos = {};
        this.agents.forEach((_, id) => { allPinWorldPos[id] = this.getPinWorldPos(id); });
        this.calculateForcesForAgent(allPinWorldPos);
        this.applyLayerForces();
        this.agents.forEach((agent, id) => {
            if (id === this.draggedAgentId) { agent.vel = { x: 0, y: 0, z: 0 }; return; }
            agent.vel.x = (agent.vel.x + agent.force.x * DT) * DAMPING;
            agent.vel.y = (agent.vel.y + agent.force.y * DT) * DAMPING;
            agent.vel.z = (agent.vel.z + agent.force.z * DT) * DAMPING;
            agent.pos.x += agent.vel.x * DT;
            agent.pos.y += agent.vel.y * DT;
            agent.pos.z += agent.vel.z * DT;

            if (isNaN(agent.pos.x) || isNaN(agent.pos.y) || isNaN(agent.pos.z)) {
                console.error(\`Agent \${id} position became NaN. Resetting. Force:\`, agent.force);
                agent.pos = { x: 0, y: 0, z: 0 };
                agent.vel = { x: 0, y: 0, z: 0 };
            }
        });

        const totalSystemForce = Array.from(this.agents.values()).reduce((sum, agent) => {
            return sum + Math.hypot(agent.force.x, agent.force.y, agent.force.z);
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
        const node = this.nodeMap.get(id);
        if (!node) return new this.THREE.Quaternion();
        
        const rotY = (node.rotation || 0) * (Math.PI / 180);
        const baseQuat = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(0, rotY, 0));

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
            positions[id] = { x: agent.pos.x / this.SCALE, y: agent.pos.z / this.SCALE, rotation: node?.rotation || 0, side: node?.side || 'top' };
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
}
`