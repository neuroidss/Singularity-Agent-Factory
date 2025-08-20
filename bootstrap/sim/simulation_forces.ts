// bootstrap/sim/simulation_forces.ts

export const ForceSimulationFunctionsString = `
    applySoftRepulsion() {
        if (!this.params.componentSpacing || this.params.componentSpacing === 0) return;

        const agentIds = Array.from(this.agents.keys());
        const rampUpFactor = Math.min(1.0, this.step_count / this.params.repulsionRampUpTime);
        const K_REPULSION = this.params.componentSpacing * 0.01;

        for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
                const idA = agentIds[i], idB = agentIds[j];
                const agentA = this.agents.get(idA), agentB = this.agents.get(idB);
                const nodeA = this.nodeMap.get(idA), nodeB = this.nodeMap.get(idB);
                if (!agentA || !agentB || !nodeA || !nodeB || nodeA.side !== nodeB.side) continue;

                // --- THIS IS THE KEY CHANGE: Use DRC dimensions for soft repulsion ---
                const { drcDims: dimsA } = this.getDrcInfo(nodeA);
                const { drcDims: dimsB } = this.getDrcInfo(nodeB);

                const radiusA = Math.hypot(dimsA.width, dimsA.height) / 2 * this.SCALE;
                const radiusB = Math.hypot(dimsB.width, dimsB.height) / 2 * this.SCALE;
                
                const dx = agentA.pos.x - agentB.pos.x;
                const dz = agentA.pos.z - agentB.pos.z;
                const distSq = dx * dx + dz * dz;
                const radiiSum = radiusA + radiusB;

                if (distSq < (radiiSum * radiiSum) && distSq > 1e-6) {
                    const dist = Math.sqrt(distSq);
                    const overlap = radiiSum - dist;
                    const forceMag = K_REPULSION * overlap * rampUpFactor;
                    
                    const fx = (dx / dist) * forceMag;
                    const fz = (dz / dist) * forceMag;
                    
                    agentA.force.x += fx;
                    agentA.force.z += fz;
                    agentB.force.x -= fx;
                    agentB.force.z -= fz;
                }
            }
        }
    }

    getPinWorldPos(agentId) {
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node) return {};
        const pinMap = this.pinDataMap.get(agentId);
        if (!pinMap) return {};

        const worldPositions = {};
        
        const agentRotation = new this.THREE.Euler().setFromQuaternion(agent.rot, 'YXZ');
        const angleRad = agentRotation.y;
        
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

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    applyNetAttractionForAgent(agentId, allPinWorldPos) {
        const K_SPRING = this.params.netLengthWeight; 
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
                    currentAgent.lastForces['Net Attraction Strength'] = (currentAgent.lastForces['Net Attraction Strength'] || 0) + forceMag;
                }
            }
        });
    }

    applyDistributionForceForAgent(agentId) {
        const K_DIST = this.params.distributionStrength;
        if (K_DIST === 0) return;

        const agent = this.agents.get(agentId);
        if (!agent) return;

        const numAgents = this.agents.size;
        if (numAgents <= 1) return;
        
        // Calculate center of mass of all *other* agents
        let comX = 0, comZ = 0;
        this.agents.forEach((otherAgent, otherId) => {
            if (otherId !== agentId) {
                comX += otherAgent.pos.x;
                comZ += otherAgent.pos.z;
            }
        });
        comX /= (numAgents - 1);
        comZ /= (numAgents - 1);

        const dx = agent.pos.x - comX;
        const dz = agent.pos.z - comZ;
        
        // Apply force pushing away from the center of mass
        const forceX = dx * K_DIST;
        const forceZ = dz * K_DIST;

        agent.force.x += forceX;
        agent.force.z += forceZ;

        const forceMag = Math.hypot(forceX, forceZ);
        if (forceMag > 0.1) {
            agent.lastForces['Center Repulsion'] = (agent.lastForces['Center Repulsion'] || 0) + forceMag;
        }
    }
    
     applyContainmentForAgent(agentId) {
        const K_CONTAINMENT = this.params.boardEdgeConstraint;
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node || !this.graph.board_outline) return;

        const { x, y, width, height, shape } = this.graph.board_outline;
        const { drcDims } = this.getDrcInfo(node);
        const node_w2 = (drcDims.width / 2) * this.SCALE;
        const node_h2 = (drcDims.height / 2) * this.SCALE;

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
                agent.lastForces['Board Edge Force'] = (agent.lastForces['Board Edge Force'] || 0) + Math.hypot(forceX, forceZ);
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
            if (f > 0) agent.lastForces['Board Edge Force'] = (agent.lastForces['Board Edge Force'] || 0) + f;
        }
    }

    applySymmetryForAgent(agentId, rule) {
        const K_SYMMETRY = this.params.symmetryStrength;
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
        agentA.lastForces['Symmetry Strength'] = (agentA.lastForces['Symmetry Strength'] || 0) + Math.hypot(fx, fz);

        const nodeA = this.nodeMap.get(agentId);
        const nodeB = this.nodeMap.get(otherId);
        if (nodeA && nodeB) {
            const Kp_rot = this.params.symmetryRotationStrength * 100;
            const Kd_rot = Kp_rot / 10;
            const currentRotA = new this.THREE.Euler().setFromQuaternion(agentA.rot, 'YXZ').y;
            const currentRotB = new this.THREE.Euler().setFromQuaternion(agentB.rot, 'YXZ').y;
            let targetAngleA;
            if (axis === 'vertical') {
                targetAngleA = Math.PI - currentRotB;
            } else {
                targetAngleA = -currentRotB;
            }
            let error = targetAngleA - currentRotA;
            while (error < -Math.PI) error += 2 * Math.PI;
            while (error > Math.PI) error -= 2 * Math.PI;
            const torqueY = Kp_rot * error - Kd_rot * agentA.angularVel.y;
            agentA.torque.y += torqueY;
            agentA.lastForces['Symmetry Rotation'] = (agentA.lastForces['Symmetry Rotation'] || 0) + Math.abs(torqueY);
        }
    }

    applySymmetricalPairForAgent(agentId, rule) {
        const { pair, axis, separation } = rule;
        const agent = this.agents.get(agentId);
        if (!agent || !pair.includes(agentId)) return;

        const otherId = pair[0] === agentId ? pair[1] : pair[0];
        const otherAgent = this.agents.get(otherId);
        if (!otherAgent) return;
        
        const K_PAIR = this.params.symmetricalPairStrength;
        const sep = separation * this.SCALE;

        if (axis === 'vertical') {
            const midZ = (agent.pos.z + otherAgent.pos.z) / 2;
            const fz_align = (midZ - agent.pos.z) * K_PAIR;
            agent.force.z += fz_align;
            const targetSign = (agentId === pair[0]) ? -1 : 1;
            const targetX = targetSign * sep / 2;
            const fx_sep = (targetX - agent.pos.x) * K_PAIR;
            agent.force.x += fx_sep;
            agent.lastForces['Symmetrical Pair Strength'] = (agent.lastForces['Symmetrical Pair Strength'] || 0) + Math.hypot(fx_sep, fz_align);
        } else {
            const midX = (agent.pos.x + otherAgent.pos.x) / 2;
            const fx_align = (midX - agent.pos.x) * K_PAIR;
            agent.force.x += fx_align;
            const targetSign = (agentId === pair[0]) ? -1 : 1;
            const targetZ = targetSign * sep / 2;
            const fz_sep = (targetZ - agent.pos.z) * K_PAIR;
            agent.force.z += fz_sep;
            agent.lastForces['Symmetrical Pair Strength'] = (agent.lastForces['Symmetrical Pair Strength'] || 0) + Math.hypot(fx_align, fz_sep);
        }
    }
    
    applyGroupAlignmentForAgent(agentId, rule) {
        const { components, axis } = rule;
        if (!components.includes(agentId)) return;
        const K_GROUP_ALIGN = 0.5; // This force is typically weaker
        const groupAgents = components.map(id => this.agents.get(id)).filter(Boolean);
        if (groupAgents.length < 2) return;
        const currentAgent = this.agents.get(agentId);
        if (!currentAgent) return;

        if (axis === 'horizontal') {
            const avgZ = groupAgents.reduce((sum, a) => sum + a.pos.z, 0) / groupAgents.length;
            const forceZ = (avgZ - currentAgent.pos.z) * K_GROUP_ALIGN;
            currentAgent.force.z += forceZ;
            currentAgent.lastForces['Group Alignment'] = (currentAgent.lastForces['Group Alignment'] || 0) + Math.abs(forceZ);
        } else {
            const avgX = groupAgents.reduce((sum, a) => sum + a.pos.x, 0) / groupAgents.length;
            const forceX = (avgX - currentAgent.pos.x) * K_GROUP_ALIGN;
            currentAgent.force.x += forceX;
            currentAgent.lastForces['Group Alignment'] = (currentAgent.lastForces['Group Alignment'] || 0) + Math.abs(forceX);
        }
    }

    applyAlignmentForAgent(agentId, rule) {
        const K_ALIGN = this.params.alignmentStrength;
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
        agent.lastForces['Alignment Strength'] = (agent.lastForces['Alignment Strength'] || 0) + force;
    }

    applyProximityForAgent(agentId, rule, allPinWorldPos) {
        const K_PROXIMITY = this.params.proximityStrength;
        const currentAgent = this.agents.get(agentId);
        if (!currentAgent) return;

        rule.groups.forEach(group => {
            if (!group.includes(agentId)) return;

            // New logic for simple pairs, e.g., ["U1", "C1"]
            if (group.length === 2) {
                const otherId = group[0] === agentId ? group[1] : group[0];
                const otherAgent = this.agents.get(otherId);
                if (!otherAgent) return;

                let targetPos = null;
                let foundConnection = false;

                // Find a net that connects this agent to the other agent in the group
                for (const edge of (this.graph.edges || [])) {
                    const [sourceComp, sourcePin] = edge.source.split('-');
                    const [targetComp, targetPin] = edge.target.split('-');

                    if ((sourceComp === agentId && targetComp === otherId)) {
                        targetPos = allPinWorldPos[otherId]?.[targetPin];
                        foundConnection = true;
                        break;
                    }
                    if ((targetComp === agentId && sourceComp === otherId)) {
                        targetPos = allPinWorldPos[otherId]?.[sourcePin];
                        foundConnection = true;
                        break;
                    }
                }
                
                // If a specific pin connection is found, attract to that pin.
                // Otherwise, fall back to attracting to the component center.
                const finalTargetPos = foundConnection && targetPos ? targetPos : otherAgent.pos;

                const dx = finalTargetPos.x - currentAgent.pos.x;
                const dz = finalTargetPos.z - currentAgent.pos.z;
                
                const fx = dx * K_PROXIMITY;
                const fz = dz * K_PROXIMITY;
                currentAgent.force.x += fx;
                currentAgent.force.z += fz;
                currentAgent.lastForces['Proximity Strength'] = (currentAgent.lastForces['Proximity Strength'] || 0) + Math.hypot(fx, fz);
            } else {
                // Fallback for groups with more than 2 components (original logic)
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
                        currentAgent.lastForces['Proximity Strength'] = (currentAgent.lastForces['Proximity Strength'] || 0) + Math.hypot(fx, fz);
                    }
                });
            }
        });
    }

    applyCircularForAgent(agentId, rule) {
        const K_CIRCULAR = this.params.circularStrength;
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
        agent.lastForces['Circular Strength'] = (agent.lastForces['Circular Strength'] || 0) + Math.hypot(fx, fz);

        const Kp_rot = this.params.circularRotationStrength * 100;
        const Kd_rot = Kp_rot / 10;
        const currentAngle = new this.THREE.Euler().setFromQuaternion(agent.rot, 'YXZ').y;
        const targetRotDegrees = (angle * 180 / Math.PI) - 90;
        const targetAngle = targetRotDegrees * Math.PI / 180;
        let error = targetAngle - currentAngle;
        while (error < -Math.PI) error += 2 * Math.PI;
        while (error > Math.PI) error -= 2 * Math.PI;
        const torqueY = Kp_rot * error - Kd_rot * agent.angularVel.y;
        agent.torque.y += torqueY;
        agent.lastForces['Circular Rotation'] = (agent.lastForces['Circular Rotation'] || 0) + Math.abs(torqueY);
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
            if (Math.abs(forceY) > 0.1) agent.lastForces['Layer Force'] = (agent.lastForces['Layer Force'] || 0) + Math.abs(forceY);
        });
    }

    applyFixedPropertyForAgent(agentId, rule) {
        const { properties } = rule;
        const agent = this.agents.get(agentId);
        if (!agent || !properties || !('rotation' in properties)) return;

        const Kp = this.params.fixedRotationStrength * 100;
        const Kd = Kp / 10;
        const currentAngle = new this.THREE.Euler().setFromQuaternion(agent.rot, 'YXZ').y;
        const targetAngle = properties.rotation * Math.PI / 180;
        
        let error = targetAngle - currentAngle;
        while (error < -Math.PI) error += 2 * Math.PI;
        while (error > Math.PI) error -= 2 * Math.PI;
        
        const torqueY = Kp * error - Kd * agent.angularVel.y;
        
        agent.torque.y += torqueY;
        agent.lastForces['Fixed Rotation'] = (agent.lastForces['Fixed Rotation'] || 0) + Math.abs(torqueY);
    }

    applyAbsolutePositionForAgent(agentId, rule) {
        const K_ABSOLUTE = this.params.absolutePositionStrength;
        const agent = this.agents.get(agentId);
        if (!agent || rule.component !== agentId) return;

        let totalForceMag = 0;
        
        if (rule.x !== undefined && rule.x !== null) {
            const targetX = rule.x * this.SCALE;
            const fx = (targetX - agent.pos.x) * K_ABSOLUTE;
            agent.force.x += fx;
            totalForceMag += Math.abs(fx);
        }

        if (rule.y !== undefined && rule.y !== null) {
            const targetZ = rule.y * this.SCALE; // y from rule maps to z in sim
            const fz = (targetZ - agent.pos.z) * K_ABSOLUTE;
            agent.force.z += fz;
            totalForceMag += Math.abs(fz);
        }
        
        if (totalForceMag > 0) {
            agent.lastForces['Absolute Position Strength'] = (agent.lastForces['Absolute Position Strength'] || 0) + totalForceMag;
        }
    }

    calculateForcesForAgent(allPinWorldPos) {
        this.agents.forEach((agent, id) => {
            agent.force = { x: 0, y: 0, z: 0 };
            agent.torque = { x: 0, y: 0, z: 0 };
            agent.lastForces = {};
            this.applyContainmentForAgent(id);
            this.applyNetAttractionForAgent(id, allPinWorldPos);
            this.applyDistributionForceForAgent(id);

            (this.graph.rules || []).filter(rule => rule.enabled !== false).forEach(rule => {
                const componentList = rule.component ? [rule.component] : (rule.components || rule.pair || rule.pairs?.flat() || rule.groups?.flat());
                if (componentList && componentList.includes(id)) {
                    switch (rule.type) {
                        case 'SymmetryConstraint': this.applySymmetryForAgent(id, rule); break;
                        case 'AlignmentConstraint': this.applyAlignmentForAgent(id, rule); break;
                        case 'ProximityConstraint': this.applyProximityForAgent(id, rule, allPinWorldPos); break;
                        case 'CircularConstraint': this.applyCircularForAgent(id, rule); break;
                        case 'FixedPropertyConstraint': this.applyFixedPropertyForAgent(id, rule); break;
                        case 'SymmetricalPairConstraint': this.applySymmetricalPairForAgent(id, rule); break;
                        case 'GroupAlignmentConstraint': this.applyGroupAlignmentForAgent(id, rule); break;
                        case 'AbsolutePositionConstraint': this.applyAbsolutePositionForAgent(id, rule); break;
                    }
                }
            });
        });
    }
`