// bootstrap/sim/simulation_collisions.ts
// This file is now intentionally empty.
// All collision detection and resolution is handled by the Rapier.js engine
// inside of agent_simulation.ts to ensure correctness and performance.

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

    updateDRCStatus(eventQueue) {
        this.agents.forEach(agent => { agent.drcStatus = 'ok'; });

        eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (started) {
                const collider1 = this.world.getCollider(handle1);
                const collider2 = this.world.getCollider(handle2);

                if (!collider1 || !collider2) return;

                const body1Handle = collider1.parent().handle;
                const body2Handle = collider2.parent().handle;

                const idA = this.handleToAgentIdMap.get(body1Handle);
                const idB = this.handleToAgentIdMap.get(body2Handle);

                if (idA && this.agents.has(idA)) this.agents.get(idA).drcStatus = 'overlap';
                if (idB && this.agents.has(idB)) this.agents.get(idB).drcStatus = 'overlap';
            }
        });

        if (this.graph.board_outline) {
            const { x, y, width, height, shape } = this.graph.board_outline;
            this.agents.forEach((agent, id) => {
                if (agent.drcStatus === 'ok') {
                    const node = this.nodeMap.get(id);
                    const { drcDims } = this.getEffectiveDrcInfo(node);
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