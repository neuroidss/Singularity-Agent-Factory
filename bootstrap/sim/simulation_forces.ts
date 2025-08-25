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

                const { drcDims: dimsA } = this.getDrcInfo(nodeA);
                const { drcDims: dimsB } = this.getDrcInfo(nodeB);

                const radiusA = Math.hypot(dimsA.width, dimsA.height) / 2 * this.SCALE;
                const radiusB = Math.hypot(dimsB.width, dimsB.height) / 2 * this.SCALE;
                
                const dx = agentA.pos.x - agentB.pos.x;
                const dz = agentA.pos.z - agentB.pos.z;
                const distSq = dx * dx + dz * dz;
                const radiiSum = radiusA + radiusB;

                const anchorOfA = this.satelliteToAnchorMap.get(idA);
                const anchorOfB = this.satelliteToAnchorMap.get(idB);
                
                let pushA = true;
                let pushB = true;
                if (anchorOfA === idB) pushB = false;
                if (anchorOfB === idA) pushA = false;

                if (distSq < (radiiSum * radiiSum) && distSq > 1e-6) {
                    const dist = Math.sqrt(distSq);
                    const overlap = radiiSum - dist;
                    const forceMag = K_REPULSION * overlap * rampUpFactor;
                    
                    const fx = (dx / dist) * forceMag;
                    const fz = (dz / dist) * forceMag;
                    
                    if (pushA) {
                        agentA.force.x += fx;
                        agentA.force.z += fz;
                    }
                    if (pushB) {
                        agentB.force.x -= fx;
                        agentB.force.z -= fz;
                    }
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
        
        // The agent's rotation quaternion and position vector from the simulation state
        const agentQuaternion = new this.THREE.Quaternion(agent.rot.x, agent.rot.y, agent.rot.z, agent.rot.w);
        const agentPosition = new this.THREE.Vector3(agent.pos.x, agent.pos.y, agent.pos.z);

        pinMap.forEach((pin, pinName) => {
            // Create a vector for the pin's local position.
            // KiCad's Y-axis (down) maps to the simulation's negative Z-axis.
            const localPinVector = new this.THREE.Vector3(
                pin.x * this.SCALE,
                0, // Pins are on the X-Z plane relative to the component center
                -pin.y * this.SCALE 
            );

            // Apply the agent's rotation to the local pin position.
            localPinVector.applyQuaternion(agentQuaternion);

            // Add the agent's world position to get the pin's final world position.
            const worldPinVector = localPinVector.add(agentPosition);
            
            // We only care about the X and Z for 2D layout forces.
            worldPositions[pinName] = { x: worldPinVector.x, z: worldPinVector.z };
        });
        return worldPositions;
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    applyNetForcesForAgent(agentId, allPinWorldPos) {
        const K_SPRING = this.params.netLengthWeight; 
        if (!K_SPRING || K_SPRING === 0) return;
        const currentAgent = this.agents.get(agentId);
        const currentNode = this.nodeMap.get(agentId);
        if (!currentAgent || !currentNode) return;
    
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
                const otherNode = this.nodeMap.get(otherCompId);
                if (!otherNode) return;

                // Asymmetrical force: only the smaller component is pulled.
                const mySize = (currentNode.placeholder_dimensions?.width ?? 0) * (currentNode.placeholder_dimensions?.height ?? 0);
                const otherSize = (otherNode.placeholder_dimensions?.width ?? 0) * (otherNode.placeholder_dimensions?.height ?? 0);

                if (mySize > otherSize) {
                    return; // This component is larger, so it acts as an anchor and is not pulled.
                }

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
                    currentAgent.lastForces['Net Attraction'] = (currentAgent.lastForces['Net Attraction'] || 0) + forceMag;
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
        if (!agent || !node || !this.graph || !this.graph.board_outline || K_CONTAINMENT === 0) return;

        const { x, y, width, height, shape } = this.graph.board_outline;
        const { drcDims } = this.getDrcInfo(node);

        if (shape === 'circle') {
            const centerX = (x + width / 2) * this.SCALE;
            const centerZ = (y + height / 2) * this.SCALE;
            const radius = (width / 2) * this.SCALE;
            const dx = agent.pos.x - centerX;
            const dz = agent.pos.z - centerZ;
            const dist = Math.hypot(dx, dz);
            
            const node_w2 = (drcDims.width / 2) * this.SCALE;
            const node_h2 = (drcDims.height / 2) * this.SCALE;
            const max_extent = Math.hypot(node_w2, node_h2); // Simple approximation for corner
            
            if (dist + max_extent > radius) {
                if (dist < 1e-6) return; // Prevent division by zero if agent is at the center
                const penetration = (dist + max_extent) - radius;
                const forceMagnitude = penetration * K_CONTAINMENT * 0.5;
                const forceX = -(dx / dist) * forceMagnitude;
                const forceZ = -(dz / dist) * forceMagnitude;
                agent.force.x += forceX;
                agent.force.z += forceZ;
                agent.lastForces['Board Edge Force'] = (agent.lastForces['Board Edge Force'] || 0) + Math.hypot(forceX, forceZ);
            }
        } else { // Rectangular board
            const left = x * this.SCALE;
            const right = (x + width) * this.SCALE;
            const top = y * this.SCALE; // z-min
            const bottom = (y + height) * this.SCALE; // z-max

            // We consider the bounding box of the rotated component for simplicity and robustness.
            const corners = this.getRotatedRectCorners(agent, drcDims);
            let minCompX = Infinity, maxCompX = -Infinity, minCompZ = Infinity, maxCompZ = -Infinity;
            corners.forEach(c => {
                minCompX = Math.min(minCompX, c.x);
                maxCompX = Math.max(maxCompX, c.x);
                minCompZ = Math.min(minCompZ, c.z);
                maxCompZ = Math.max(maxCompZ, c.z);
            });
            
            let fx = 0;
            let fz = 0;
            const forceMultiplier = K_CONTAINMENT * 0.5;

            // Use a spring-like force based on penetration. This is more stable and intuitive.
            if (minCompX < left) {
                fx += (left - minCompX) * forceMultiplier;
            }
            if (maxCompX > right) {
                fx -= (maxCompX - right) * forceMultiplier;
            }
            if (minCompZ < top) {
                fz += (top - minCompZ) * forceMultiplier;
            }
            if (maxCompZ > bottom) {
                fz -= (maxCompZ - bottom) * forceMultiplier;
            }

            if (Math.abs(fx) > 0 || Math.abs(fz) > 0) {
                agent.force.x += fx;
                agent.force.z += fz;
                agent.lastForces['Board Edge Force'] = (agent.lastForces['Board Edge Force'] || 0) + Math.hypot(fx, fz);
            }
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
            // Rotational part: Align rotations to be the same, not mirrored.
            const Kp_rot = this.params.symmetryRotationStrength * 100;
            const Kd_rot = Kp_rot / 10;
            const currentRotA = new this.THREE.Euler().setFromQuaternion(agentA.rot, 'YXZ').y;
            const currentRotB = new this.THREE.Euler().setFromQuaternion(agentB.rot, 'YXZ').y;
            
            // The new logic: make their rotations equal.
            const targetAngleA = currentRotB;

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
        const K_PROXIMITY = this.params.proximityStrength * 10.0;
        if (K_PROXIMITY === 0) return;
    
        const satelliteAgent = this.agents.get(agentId);
        if (!satelliteAgent) return;
    
        rule.groups.forEach(group => {
            if (!Array.isArray(group) || group.length < 2 || !group.includes(agentId)) {
                return;
            }
    
            const anchorId = group[0];
            // CRITICAL FIX: The force is only calculated for satellites. If the current agent is the anchor, do nothing.
            if (agentId === anchorId) {
                return;
            }
    
            const anchorAgent = this.agents.get(anchorId);
            if (!anchorAgent) return;
    
            let targetPoint, sourcePoint;
            
            // --- Pin-to-Pin Attraction (Primary) ---
            const anchorPins = allPinWorldPos[anchorId] || {};
            const satellitePins = allPinWorldPos[agentId] || {};
            const sharedPinPairs = [];
            (this.graph.edges || []).forEach(edge => {
                const [sComp, sPin] = edge.source.split('-');
                const [tComp, tPin] = edge.target.split('-');
                if ((sComp === anchorId && tComp === agentId) || (sComp === agentId && tComp === anchorId)) {
                    const anchorPinPos = (sComp === anchorId) ? anchorPins[sPin] : anchorPins[tPin];
                    const satellitePinPos = (sComp === agentId) ? satellitePins[sPin] : satellitePins[tPin];
                    if (anchorPinPos && satellitePinPos) {
                        sharedPinPairs.push({ anchor: anchorPinPos, satellite: satellitePinPos });
                    }
                }
            });
    
            if (sharedPinPairs.length > 0) {
                // Average the positions of all connected pins to find a centroid target.
                targetPoint = sharedPinPairs.reduce((acc, p) => ({ x: acc.x + p.anchor.x, z: acc.z + p.anchor.z }), { x: 0, z: 0 });
                targetPoint.x /= sharedPinPairs.length;
                targetPoint.z /= sharedPinPairs.length;
                sourcePoint = sharedPinPairs.reduce((acc, p) => ({ x: acc.x + p.satellite.x, z: acc.z + p.satellite.z }), { x: 0, z: 0 });
                sourcePoint.x /= sharedPinPairs.length;
                sourcePoint.z /= sharedPinPairs.length;
            } else {
                // --- Center-to-Center Attraction (Fallback) ---
                targetPoint = { x: anchorAgent.pos.x, z: anchorAgent.pos.z };
                sourcePoint = { x: satelliteAgent.pos.x, z: satelliteAgent.pos.z };
            }
    
            const dx = targetPoint.x - sourcePoint.x;
            const dz = targetPoint.z - sourcePoint.z;
            
            // Apply a simple spring-like force.
            const fx = dx * K_PROXIMITY;
            const fz = dz * K_PROXIMITY;
            
            // The force is ONLY applied to the satellite, ensuring the anchor is not pushed.
            satelliteAgent.force.x += fx;
            satelliteAgent.force.z += fz;
            
            satelliteAgent.lastForces['Proximity'] = (satelliteAgent.lastForces['Proximity'] || 0) + Math.hypot(fx, fz);
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
            this.applyNetForcesForAgent(id, allPinWorldPos);
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