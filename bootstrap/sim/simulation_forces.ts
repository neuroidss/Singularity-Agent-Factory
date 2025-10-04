// bootstrap/sim/simulation_forces.ts

export const ForceSimulationFunctionsString = `
    getPinWorldPos(agentId) {
        const agent = this.agents.get(agentId);
        const node = this.nodeMap.get(agentId);
        if (!agent || !node) return {};
        const pinMap = this.pinDataMap.get(agentId);
        if (!pinMap) return {};

        const worldPositions = {};
        
        const agentQuaternion = new this.THREE.Quaternion(agent.rot.x, agent.rot.y, agent.rot.z, agent.rot.w);
        const agentPosition = new this.THREE.Vector3(agent.pos.x, agent.pos.y, agent.pos.z);

        pinMap.forEach((pin, pinName) => {
            const localPinVector = new this.THREE.Vector3(
                pin.x * this.SCALE,
                0,
                -pin.y * this.SCALE 
            );
            localPinVector.applyQuaternion(agentQuaternion);
            const worldPinVector = localPinVector.add(agentPosition);
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

                const mySize = (currentNode.placeholder_dimensions?.width ?? 0) * (currentNode.placeholder_dimensions?.height ?? 0);
                const otherSize = (otherNode.placeholder_dimensions?.width ?? 0) * (otherNode.placeholder_dimensions?.height ?? 0);

                if (mySize > otherSize) {
                    return;
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
        
        const forceX = dx * K_DIST;
        const forceZ = dz * K_DIST;

        agent.force.x += forceX;
        agent.force.z += forceZ;

        const forceMag = Math.hypot(forceX, forceZ);
        if (forceMag > 0.1) {
            agent.lastForces['Center Repulsion'] = (agent.lastForces['Center Repulsion'] || 0) + forceMag;
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
            
            const targetAngleA = currentRotB;

            let error = targetAngleA - currentRotA;
            while (error < -Math.PI) error += 2 * Math.PI;
            while (error > Math.PI) error -= 2 * Math.PI;
            const torqueY = Kp_rot * error - Kd_rot * agentA.angularVel.y;
            agentA.torque.y += torqueY;
            agentA.lastForces['Symmetry Rotation'] = (agentA.lastForces['Symmetry Rotation'] || 0) + Math.abs(torqueY);
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
    
    applyProximityPIDForAgent(pidInfo) {
        const { controller, anchorId, satelliteId } = pidInfo;
        const satelliteAgent = this.agents.get(satelliteId);
        const anchorAgent = this.agents.get(anchorId);
        const satelliteBody = this.rigidBodyMap.get(satelliteId);
        if (!satelliteAgent || !anchorAgent || !satelliteBody || !satelliteBody.isDynamic()) return;
        
        const anchorNode = this.nodeMap.get(anchorId);
        const satelliteNode = this.nodeMap.get(satelliteId);
        if (!anchorNode || !satelliteNode) return;

        const { drcDims: anchorDims } = this.getEffectiveDrcInfo(anchorNode);
        const { drcDims: satelliteDims } = this.getEffectiveDrcInfo(satelliteNode);
        const anchorRadius = Math.hypot(anchorDims.width, anchorDims.height) / 2 * this.SCALE;
        const satelliteRadius = Math.hypot(satelliteDims.width, satelliteDims.height) / 2 * this.SCALE;
        const idealSeparation = anchorRadius + satelliteRadius + (this.params.componentSpacing / 10);

        const vecToSatellite = { x: satelliteAgent.pos.x - anchorAgent.pos.x, z: satelliteAgent.pos.z - anchorAgent.pos.z };
        const dist = Math.hypot(vecToSatellite.x, vecToSatellite.z);

        if (dist > 1e-6) { vecToSatellite.x /= dist; vecToSatellite.z /= dist; } 
        else { vecToSatellite.x = 1; vecToSatellite.z = 0; }
        
        const targetPoint = { x: anchorAgent.pos.x + vecToSatellite.x * idealSeparation, y: satelliteAgent.pos.y, z: anchorAgent.pos.z + vecToSatellite.z * idealSeparation };
        controller.applyLinearCorrection(satelliteBody, targetPoint, { x: 0, y: 0, z: 0 });
        
        const forceMag = Math.hypot(targetPoint.x - satelliteAgent.pos.x, targetPoint.z - satelliteAgent.pos.z) * this.params.proximityKp;
        satelliteAgent.lastForces['Proximity (PID)'] = (satelliteAgent.lastForces['Proximity (PID)'] || 0) + forceMag;
    }

    applyCircularPIDForAgent(pidInfo) {
        const { controller, rule, componentId } = pidInfo;
        const agent = this.agents.get(componentId);
        const body = this.rigidBodyMap.get(componentId);
        if (!agent || !body || !body.isDynamic()) return;

        const { components, radius, center } = rule;
        const N = components.length;
        const componentIndex = components.indexOf(componentId);
        if (componentIndex === -1) return;

        const rad = radius * this.SCALE;
        const centerX = (center?.[0] || 0) * this.SCALE;
        const centerZ = (center?.[1] || 0) * this.SCALE;

        // --- Positional Correction ---
        const targetAngle = (componentIndex / N) * 2 * Math.PI;
        const targetPoint = {
            x: centerX + rad * Math.cos(targetAngle),
            y: agent.pos.y,
            z: centerZ + rad * Math.sin(targetAngle)
        };
        controller.applyLinearCorrection(body, targetPoint, { x: 0, y: 0, z: 0 });
        const posForceMag = Math.hypot(targetPoint.x - agent.pos.x, targetPoint.z - agent.pos.z) * this.params.proximityKp;
        agent.lastForces['Circular Position'] = (agent.lastForces['Circular Position'] || 0) + posForceMag;

        // --- Rotational Correction ---
        const vecToCenter = { x: centerX - agent.pos.x, z: centerZ - agent.pos.z };
        const targetRotY = Math.atan2(vecToCenter.z, vecToCenter.x) + Math.PI / 2;
        const targetQuat = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(0, targetRotY, 0));
        controller.applyAngularCorrection(body, {x: targetQuat.x, y: targetQuat.y, z: targetQuat.z, w: targetQuat.w}, { x: 0, y: 0, z: 0 });

        const currentRotY = new this.THREE.Euler().setFromQuaternion(agent.rot, 'YXZ').y;
        let error = targetRotY - currentRotY;
        while (error < -Math.PI) error += 2 * Math.PI;
        while (error > Math.PI) error -= 2 * Math.PI;
        agent.lastForces['Circular Rotation'] = (agent.lastForces['Circular Rotation'] || 0) + Math.abs(error) * this.params.proximityKp;
    }
    
    applySymmetricalPairPIDForAgent(pidInfo) {
        const { controller, rule, componentId } = pidInfo;
        const agentA = this.agents.get(componentId);
        const bodyA = this.rigidBodyMap.get(componentId);
        if (!agentA || !bodyA || !bodyA.isDynamic()) return;

        const pair = rule.pair;
        const otherId = pair[0] === componentId ? pair[1] : pair[0];
        const agentB = this.agents.get(otherId);
        if (!agentB) return;

        const separation = (rule.separation || 0) * this.SCALE;
        const halfSep = separation / 2.0;

        const comX = (agentA.pos.x + agentB.pos.x) / 2.0;
        const comZ = (agentA.pos.z + agentB.pos.z) / 2.0;

        let targetPoint;
        let targetAngle;
        const isFirstInPair = pair[0] === componentId;

        if (rule.axis === 'vertical') {
            targetPoint = { x: comX - (isFirstInPair ? halfSep : -halfSep), y: agentA.pos.y, z: comZ };
            targetAngle = isFirstInPair ? Math.PI / 2 : -Math.PI / 2; // Pointing towards each other
        } else { // horizontal
            targetPoint = { x: comX, y: agentA.pos.y, z: comZ - (isFirstInPair ? halfSep : -halfSep) };
            targetAngle = isFirstInPair ? 0 : Math.PI; // Pointing towards each other
        }

        // --- Positional Correction ---
        controller.applyLinearCorrection(bodyA, targetPoint, { x: 0, y: 0, z: 0 });
        const posForceMag = Math.hypot(targetPoint.x - agentA.pos.x, targetPoint.z - agentA.pos.z) * this.params.proximityKp;
        agentA.lastForces['Symmetry Position'] = (agentA.lastForces['Symmetry Position'] || 0) + posForceMag;

        // --- Rotational Correction ---
        const targetQuat = new this.THREE.Quaternion().setFromEuler(new this.THREE.Euler(0, targetAngle, 0));
        controller.applyAngularCorrection(bodyA, {x: targetQuat.x, y: targetQuat.y, z: targetQuat.z, w: targetQuat.w}, { x: 0, y: 0, z: 0 });

        const currentRotY = new this.THREE.Euler().setFromQuaternion(agentA.rot, 'YXZ').y;
        let error = targetAngle - currentRotY;
        while (error < -Math.PI) error += 2 * Math.PI;
        while (error > Math.PI) error -= 2 * Math.PI;
        agentA.lastForces['Symmetry Rotation'] = (agentA.lastForces['Symmetry Rotation'] || 0) + Math.abs(error) * this.params.proximityKp;
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

    calculateForcesAndTorques() {
        if (this.mode === 'robotics') {
            this.agents.forEach((agent, id) => {
                const body = this.rigidBodyMap.get(id);
                if (!body) return;
                
                agent.lastForces = {};
                
                const aiState = this.agentAIState.get(id);
                if (aiState && aiState.behavior === 'patroller' && body.isDynamic()) {
                    const currentPos = body.translation();
                    const targetPos = aiState.target;
                    const dx = targetPos.x - currentPos.x;
                    const dz = targetPos.z - currentPos.z;
                    const dist = Math.hypot(dx, dz);

                    if (dist < this.PATROLLER_TARGET_RADIUS) {
                        aiState.target = this.getRandomTarget();
                    }

                    const forceMagnitude = this.PATROLLER_SPEED;
                    if (dist > 0.1) {
                        const force = { x: (dx / dist) * forceMagnitude, y: 0, z: (dz / dist) * forceMagnitude };
                        body.addForce(force, true);
                        agent.lastForces['Patrol Force'] = forceMagnitude;

                        const currentVel = body.linvel();
                        if (Math.hypot(currentVel.x, currentVel.z) > 0.1 * this.SCALE) {
                            const targetAngle = Math.atan2(currentVel.x, currentVel.z);
                            const rot = body.rotation();
                            const currentAngle = new this.THREE.Euler().setFromQuaternion({x: rot.x, y: rot.y, z: rot.z, w: rot.w}, 'YXZ').y;
                            
                            let error = targetAngle - currentAngle;
                            while (error < -Math.PI) error += 2 * Math.PI;
                            while (error > Math.PI) error -= 2 * Math.PI;

                            const Kp_rot = 20.0;
                            const Kd_rot = 5.0;
                            const angVel = body.angvel();

                            const torqueY = Kp_rot * error - Kd_rot * angVel.y;
                            body.addTorque({ x: 0, y: torqueY, z: 0 }, true);
                            agent.lastForces['Patrol Torque'] = Math.abs(torqueY);
                        }
                    }
                }
            });
            return;
        }

        // --- PCB Logic ---
        const allPinWorldPos = {};
        this.agents.forEach((_, id) => {
            allPinWorldPos[id] = this.getPinWorldPos(id);
            const agent = this.agents.get(id);
            agent.force = { x: 0, y: 0, z: 0 };
            agent.torque = { x: 0, y: 0, z: 0 };
            agent.lastForces = {};
        });
    
        this.agents.forEach((_, id) => {
            this.applyNetForcesForAgent(id, allPinWorldPos);
            this.applyDistributionForceForAgent(id);
            (this.graph.rules || []).filter(r => r.enabled !== false).forEach(rule => {
                const components = rule.component ? [rule.component] : (rule.components || rule.pair || rule.pairs?.flat() || rule.groups?.flat());
                if (components && components.includes(id)) {
                    switch (rule.type) {
                        case 'SymmetryConstraint': this.applySymmetryForAgent(id, rule); break;
                        case 'AlignmentConstraint': this.applyAlignmentForAgent(id, rule); break;
                        case 'FixedPropertyConstraint': this.applyFixedPropertyForAgent(id, rule); break;
                        case 'AbsolutePositionConstraint': this.applyAbsolutePositionForAgent(id, rule); break;
                    }
                }
            });
        });

        this.pidControllers.forEach(pidInfo => {
            if (pidInfo.type === 'proximity') this.applyProximityPIDForAgent(pidInfo);
            else if (pidInfo.type === 'circular') this.applyCircularPIDForAgent(pidInfo);
            else if (pidInfo.type === 'symmetrical_pair') this.applySymmetricalPairPIDForAgent(pidInfo);
        });
        
        this.agents.forEach((agent, id) => {
            if (id === this.draggedAgentId) return;
            const body = this.rigidBodyMap.get(id);
            if (body && body.isDynamic()) {
                body.resetForces(true); body.resetTorques(true);
                const { force, torque } = agent;
                const MAX_FORCE = 1e6, MAX_TORQUE = 1e5;
                const clampedForce = { x: isFinite(force.x) ? this.clamp(force.x, -MAX_FORCE, MAX_FORCE) : 0, y: 0, z: isFinite(force.z) ? this.clamp(force.z, -MAX_FORCE, MAX_FORCE) : 0 };
                const clampedTorque = { x: 0, y: isFinite(torque.y) ? this.clamp(torque.y, -MAX_TORQUE, MAX_TORQUE) : 0, z: 0 };
                body.addForce(clampedForce, true);
                body.addTorque(clampedTorque, true);
            }
        });
    }
`