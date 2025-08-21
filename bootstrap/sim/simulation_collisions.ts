// bootstrap/sim/simulation_collisions.ts

export const CollisionSimulationFunctionsString = `
    getRotatedRectCorners(agent, drcDims) {
        const { pos, rot } = agent;
        const { width, height } = drcDims;
        const w = width * this.SCALE / 2;
        const h = height * this.SCALE / 2;
        const corners = [ { x: -w, z: -h }, { x: w, z: -h }, { x: w, z: h }, { x: -w, z: h }];
        const q = new this.THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
        return corners.map(c => {
            const vec = new this.THREE.Vector3(c.x, 0, c.z);
            vec.applyQuaternion(q);
            vec.add(new this.THREE.Vector3(pos.x, 0, pos.z));
            return { x: vec.x, z: vec.z };
        });
    }

    projectOntoAxis(corners, axis) {
        let min = Infinity, max = -Infinity;
        for (const corner of corners) {
            const dot = corner.x * axis.x + corner.z * axis.z;
            min = Math.min(min, dot);
            max = Math.max(max, dot);
        }
        return { min, max };
    }
    
    checkSAT(cornersA, cornersB) {
        const getAxes = (corners) => {
            const axes = [];
            for (let i = 0; i < corners.length; i++) {
                const p1 = corners[i];
                const p2 = corners[i + 1] || corners[0];
                const edge = { x: p2.x - p1.x, z: p2.z - p1.z };
                const length = Math.hypot(edge.x, edge.z);
                if (length > 1e-6) {
                    axes.push({ x: -edge.z / length, z: edge.x / length });
                }
            }
            return axes;
        };

        const axes = [...getAxes(cornersA), ...getAxes(cornersB)];
        let minOverlap = Infinity;
        let mtv = null;

        for (const axis of axes) {
            const projA = this.projectOntoAxis(cornersA, axis);
            const projB = this.projectOntoAxis(cornersB, axis);
            const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
            if (overlap < 0) return null; // No collision

            if (overlap < minOverlap) {
                minOverlap = overlap;
                mtv = { x: axis.x * minOverlap, z: axis.z * minOverlap };
            }
        }

        // Ensure MTV points from B to A
        const centerA = cornersA.reduce((acc, c) => ({ x: acc.x + c.x, z: acc.z + c.z }), { x: 0, z: 0 });
        centerA.x /= cornersA.length; centerA.z /= cornersA.length;
        const centerB = cornersB.reduce((acc, c) => ({ x: acc.x + c.x, z: acc.z + c.z }), { x: 0, z: 0 });
        centerB.x /= cornersB.length; centerB.z /= cornersB.length;
        
        const direction = { x: centerA.x - centerB.x, z: centerA.z - centerB.z };
        if (direction.x * mtv.x + direction.z * mtv.z < 0) {
            mtv.x = -mtv.x;
            mtv.z = -mtv.z;
        }
        return mtv;
    }

    resolveCollisions() {
        const agentIds = Array.from(this.agents.keys());

        for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
                const idA = agentIds[i], idB = agentIds[j];
                const agentA = this.agents.get(idA), agentB = this.agents.get(idB);
                const nodeA = this.nodeMap.get(idA), nodeB = this.nodeMap.get(idB);
                if (!agentA || !agentB || !nodeA || !nodeB || nodeA.side !== nodeB.side) continue;

                const { drcDims: drcDimsA, drcShape: drcShapeA } = this.getDrcInfo(nodeA);
                const { drcDims: drcDimsB, drcShape: drcShapeB } = this.getDrcInfo(nodeB);

                let mtv = null;

                // --- Collision Checks ---
                if (drcShapeA === 'rectangle' && drcShapeB === 'rectangle') {
                    const cornersA = this.getRotatedRectCorners(agentA, drcDimsA);
                    const cornersB = this.getRotatedRectCorners(agentB, drcDimsB);
                    mtv = this.checkSAT(cornersA, cornersB);
                } else if (drcShapeA === 'circle' && drcShapeB === 'circle') {
                    const rA = drcDimsA.width / 2 * this.SCALE;
                    const rB = drcDimsB.width / 2 * this.SCALE;
                    const dx = agentA.pos.x - agentB.pos.x;
                    const dz = agentA.pos.z - agentB.pos.z;
                    const dist = Math.hypot(dx, dz);
                    const overlap = (rA + rB) - dist;
                    if (overlap > 0 && dist > 1e-6) {
                        mtv = { x: (dx / dist) * overlap, z: (dz / dist) * overlap };
                    }
                } else { // Circle-Rect
                    const circleAgent = drcShapeA === 'circle' ? agentA : agentB;
                    const circleDims = drcShapeA === 'circle' ? drcDimsA : drcDimsB;
                    const rectAgent = drcShapeA === 'rectangle' ? agentA : agentB;
                    const rectDims = drcShapeA === 'rectangle' ? drcDimsA : drcDimsB;
                    const rectCorners = this.getRotatedRectCorners(rectAgent, rectDims);
                    const circleCenter = circleAgent.pos;
                    const radius = circleDims.width / 2 * this.SCALE;

                    let closestPoint = { x: rectCorners[0].x, z: rectCorners[0].z };
                    let min_dist_sq = Infinity;
                    
                    for (let k = 0; k < 4; k++) {
                        const p1 = rectCorners[k];
                        const p2 = rectCorners[(k + 1) % 4];
                        const dx_edge = p2.x - p1.x, dz_edge = p2.z - p1.z;
                        const len_sq = dx_edge * dx_edge + dz_edge * dz_edge;
                        let t = len_sq > 0 ? ((circleCenter.x - p1.x) * dx_edge + (circleCenter.z - p1.z) * dz_edge) / len_sq : 0;
                        t = Math.max(0, Math.min(1, t));
                        const proj = { x: p1.x + t * dx_edge, z: p1.z + t * dz_edge };
                        const dist_sq = Math.hypot(circleCenter.x - proj.x, circleCenter.z - proj.z);
                        if(dist_sq < min_dist_sq) {
                            min_dist_sq = dist_sq;
                            closestPoint = proj;
                        }
                    }

                    const dist_vec = { x: circleCenter.x - closestPoint.x, z: circleCenter.z - closestPoint.z };
                    const dist = Math.sqrt(min_dist_sq);
                    const overlap = radius - dist;

                    if (overlap > 0) {
                        const direction = dist > 1e-6 ? { x: dist_vec.x / dist, z: dist_vec.z / dist } : { x: 1, z: 0 };
                        mtv = { x: direction.x * overlap, z: direction.z * overlap };
                        if (drcShapeA === 'rectangle') { mtv = { x: -mtv.x, z: -mtv.z }; }
                    }
                }

                if (mtv) {
                    const isAStatic = agentA.placementInertia > 1e6;
                    const isBStatic = agentB.placementInertia > 1e6;
                
                    // Skip collision resolution between two static objects to prevent them from moving.
                    if (isAStatic && isBStatic) continue;
                
                    // --- Positional Correction ---
                    if (isAStatic) {
                        // A is static, so only B moves
                        agentB.pos.x -= mtv.x;
                        agentB.pos.z -= mtv.z;
                    } else if (isBStatic) {
                        // B is static, so only A moves
                        agentA.pos.x += mtv.x;
                        agentA.pos.z += mtv.z;
                    } else {
                        // Both are dynamic, so move them based on their mass ratio
                        const totalInertia = agentA.placementInertia + agentB.placementInertia;
                        const ratioA = totalInertia > 0 ? agentB.placementInertia / totalInertia : 0.5;
                        const ratioB = totalInertia > 0 ? agentA.placementInertia / totalInertia : 0.5;
                        agentA.pos.x += mtv.x * ratioA;
                        agentA.pos.z += mtv.z * ratioA;
                        agentB.pos.x -= mtv.x * ratioB;
                        agentB.pos.z -= mtv.z * ratioB;
                    }
                
                    // --- Velocity Correction (simplified impulse) ---
                    const mtvNorm = Math.hypot(mtv.x, mtv.z);
                    if (mtvNorm > 1e-6) {
                        const normal = { x: mtv.x / mtvNorm, z: mtv.z / mtvNorm };
                        const relVel = { x: agentA.vel.x - agentB.vel.x, z: agentA.vel.z - agentB.vel.z };
                        const velAlongNormal = relVel.x * normal.x + relVel.z * normal.z;
                
                        if (velAlongNormal < 0) { // Only resolve if they are moving towards each other
                            const restitution = 0.05; // Low bounciness for stability
                            const impulseMag = -(1 + restitution) * velAlongNormal;
                            
                            if (isAStatic) {
                                // Agent A is static, all impulse affects B
                                const impulse = { x: normal.x * impulseMag, z: normal.z * impulseMag };
                                agentB.vel.x -= impulse.x;
                                agentB.vel.z -= impulse.z;
                            } else if (isBStatic) {
                                // Agent B is static, all impulse affects A
                                const impulse = { x: normal.x * impulseMag, z: normal.z * impulseMag };
                                agentA.vel.x += impulse.x;
                                agentA.vel.z += impulse.z;
                            } else {
                                // Both are dynamic
                                const totalInertia = agentA.placementInertia + agentB.placementInertia;
                                if (totalInertia > 0) {
                                    const impulseDistributed = impulseMag / (1/agentA.placementInertia + 1/agentB.placementInertia);
                                    const impulse = { x: normal.x * impulseDistributed, z: normal.z * impulseDistributed };
                                    agentA.vel.x += impulse.x / agentA.placementInertia;
                                    agentA.vel.z += impulse.z / agentA.placementInertia;
                                    agentB.vel.x -= impulse.x / agentB.placementInertia;
                                    agentB.vel.z -= impulse.z / agentB.placementInertia;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    updateDRCStatus() {
        const agentIds = Array.from(this.agents.keys());
        this.agents.forEach((agent) => { agent.drcStatus = 'ok'; });
    
        for (let i = 0; i < agentIds.length; i++) {
            for (let j = i + 1; j < agentIds.length; j++) {
                const idA = agentIds[i], idB = agentIds[j];
                const agentA = this.agents.get(idA), agentB = this.agents.get(idB);
                const nodeA = this.nodeMap.get(idA), nodeB = this.nodeMap.get(idB);
                if (!agentA || !agentB || !nodeA || !nodeB || nodeA.side !== nodeB.side) continue;
                
                const { drcDims: drcDimsA, drcShape: drcShapeA } = this.getDrcInfo(nodeA);
                const { drcDims: drcDimsB, drcShape: drcShapeB } = this.getDrcInfo(nodeB);

                let hasOverlap = false;

                if (drcShapeA === 'circle' && drcShapeB === 'circle') {
                    const radiusA = (drcDimsA.width / 2) * this.SCALE;
                    const radiusB = (drcDimsB.width / 2) * this.SCALE;
                    const dx = agentA.pos.x - agentB.pos.x;
                    const dz = agentA.pos.z - agentB.pos.z;
                    const distSq = dx * dx + dz * dz;
                    const radiiSum = radiusA + radiusB;
                    if (distSq < (radiiSum * radiiSum)) hasOverlap = true;
                }
                else if (drcShapeA === 'rectangle' && drcShapeB === 'rectangle') {
                     const cornersA = this.getRotatedRectCorners(agentA, drcDimsA);
                     const cornersB = this.getRotatedRectCorners(agentB, drcDimsB);
                     if (this.checkSAT(cornersA, cornersB)) hasOverlap = true;
                }
                else {
                    const circleAgent = (drcShapeA === 'circle') ? agentA : agentB;
                    const circleDims = (drcShapeA === 'circle') ? drcDimsA : drcDimsB;
                    const rectAgent = (drcShapeA === 'rectangle') ? agentA : agentB;
                    const rectDims = (drcShapeA === 'rectangle') ? drcDimsA : drcDimsB;
                    const radius = (circleDims.width / 2) * this.SCALE;
                    const rectCorners = this.getRotatedRectCorners(rectAgent, rectDims);
                    let min_dist_sq = Infinity;
                    for (let k = 0; k < 4; k++) {
                        const p1 = rectCorners[k];
                        const p2 = rectCorners[(k + 1) % 4];
                        const dx_edge = p2.x - p1.x, dz_edge = p2.z - p1.z;
                        const len_sq = dx_edge * dx_edge + dz_edge * dz_edge;
                        let t = len_sq > 0 ? ((circleAgent.pos.x - p1.x) * dx_edge + (circleAgent.pos.z - p1.z) * dz_edge) / len_sq : 0;
                        t = Math.max(0, Math.min(1, t));
                        const proj = { x: p1.x + t * dx_edge, z: p1.z + t * dz_edge };
                        const dist_sq = Math.hypot(circleAgent.pos.x - proj.x, circleAgent.pos.z - proj.z);
                        if(dist_sq < min_dist_sq) min_dist_sq = dist_sq;
                    }
                    if (min_dist_sq < (radius * radius)) hasOverlap = true;
                }

                if (hasOverlap) {
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
                    const { drcDims } = this.getDrcInfo(node);
                    const node_w2 = (drcDims.width / 2) * this.SCALE;
                    const node_h2 = (drcDims.height / 2) * this.SCALE;
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
`;