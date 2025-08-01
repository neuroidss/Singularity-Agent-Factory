import type { LLMTool } from '../types';

export const roboticsTools: LLMTool[] = [
    {
        id: 'robot_simulation_environment',
        name: 'Robot Simulation Environment',
        description: 'Displays the 2D grid environment for the robot simulation, showing the robot, walls, resources, and collection points.',
        category: 'UI Component',
        version: 2,
        parameters: [
            { name: 'robotState', type: 'object', description: 'The current state of the robot.', required: true },
            { name: 'environmentState', type: 'array', description: 'The list of objects in the environment.', required: true },
        ],
        implementationCode: `
            const GRID_SIZE = 12;

            const renderGrid = () => {
                const cells = [];
                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) {
                        cells.push(
                            <div key={\`\${x}-\${y}\`} className="w-full h-full border border-teal-900/50"></div>
                        );
                    }
                }
                return cells;
            };

            const renderObjects = () => {
                return environmentState.map((obj, index) => {
                    const style = {
                        gridColumnStart: obj.x + 1,
                        gridRowStart: obj.y + 1,
                    };
                    let content;
                    switch (obj.type) {
                        case 'wall': content = '🧱'; break;
                        case 'resource': content = '💎'; break;
                        case 'collection_point': content = '🏦'; break;
                        default: content = '';
                    }
                    return (
                        <div key={index} style={style} className="flex items-center justify-center text-2xl">
                           {content}
                        </div>
                    );
                });
            };

            const robotStyle = {
                gridColumnStart: robotState.x + 1,
                gridRowStart: robotState.y + 1,
                transform: \`rotate(\${robotState.rotation}deg)\`,
                transition: 'all 0.3s ease-in-out',
            };

            return (
                <div className="bg-gray-800/80 border-2 border-teal-500/60 rounded-xl p-4 shadow-lg">
                    <h3 className="text-lg font-bold text-teal-300 mb-3 text-center">Robotics Control Center</h3>
                    <div className="aspect-square bg-gray-900/70 p-2 rounded-md" style={{ display: 'grid', gridTemplateColumns: \`repeat(\${GRID_SIZE}, 1fr)\`, gridTemplateRows: \`repeat(\${GRID_SIZE}, 1fr)\` }}>
                        {renderGrid()}
                        {renderObjects()}
                        <div style={robotStyle} className="relative flex items-center justify-center text-3xl">
                           {robotState.hasResource && <div className="absolute text-sm" style={{top: -5, left: -5}}>💎</div>}
                           <span>🤖</span>
                        </div>
                    </div>
                </div>
            );
        `,
    },
    {
        id: 'pathfinder',
        name: 'Pathfinder',
        description: "Calculates and executes the single best next action (move forward, turn left, or turn right) to get closer to a target coordinate. This is the primary tool for navigation. It uses the A* algorithm to find the optimal path while avoiding walls.",
        category: 'Automation',
        version: 2,
        cost: 1,
        parameters: [
            { name: 'targetX', type: 'number', description: 'The x-coordinate of the target.', required: true },
            { name: 'targetY', type: 'number', description: 'The y-coordinate of the target.', required: true },
        ],
        implementationCode: `
            const { robot, environment } = runtime.robot.getState();
            const { x: startX, y: startY, rotation } = robot;
            const { targetX, targetY } = args;

            if (startX === targetX && startY === targetY) {
                return { success: true, message: 'Pathfinder: Already at target.' };
            }
            
            // --- A* Pathfinding Implementation ---
            const walls = new Set(environment.filter(o => o.type === 'wall').map(o => \`\${o.x},\${o.y}\`));
            const heuristic = (x, y) => Math.abs(x - targetX) + Math.abs(y - targetY);

            class PriorityQueue {
                constructor() { this.elements = []; }
                enqueue(element, priority) { this.elements.push({ element, priority }); this.sort(); }
                dequeue() { return this.elements.shift().element; }
                isEmpty() { return this.elements.length === 0; }
                sort() { this.elements.sort((a, b) => a.priority - b.priority); }
            }

            const openSet = new PriorityQueue();
            openSet.enqueue({ x: startX, y: startY }, heuristic(startX, startY));
            
            const cameFrom = new Map();
            const gScore = new Map();
            gScore.set(\`\${startX},\${startY}\`, 0);

            let pathFound = false;
            let finalNode = null;

            while (!openSet.isEmpty()) {
                const current = openSet.dequeue();
                const currentKey = \`\${current.x},\${current.y}\`;

                if (current.x === targetX && current.y === targetY) {
                    finalNode = current;
                    pathFound = true;
                    break;
                }

                const neighbors = [
                    { x: current.x, y: current.y - 1 }, // Up
                    { x: current.x, y: current.y + 1 }, // Down
                    { x: current.x - 1, y: current.y }, // Left
                    { x: current.x + 1, y: current.y }  // Right
                ];
                
                for (const neighbor of neighbors) {
                    const neighborKey = \`\${neighbor.x},\${neighbor.y}\`;
                    if (walls.has(neighborKey)) continue;

                    const tentativeGScore = gScore.get(currentKey) + 1;
                    if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
                        cameFrom.set(neighborKey, current);
                        gScore.set(neighborKey, tentativeGScore);
                        const fScore = tentativeGScore + heuristic(neighbor.x, neighbor.y);
                        openSet.enqueue(neighbor, fScore);
                    }
                }
            }
            
            if (!pathFound) {
                 throw new Error('Pathfinder: No path found to target.');
            }

            // Reconstruct path
            const path = [];
            let temp = finalNode;
            while (temp) {
                path.unshift(temp);
                temp = cameFrom.get(\`\${temp.x},\${temp.y}\`);
            }

            // --- Determine Next Action from Path ---
            if (path.length < 2) {
                return { success: true, message: 'Pathfinder: No movement needed.' };
            }
            
            const nextStep = path[1];
            const dx = nextStep.x - startX;
            const dy = nextStep.y - startY;

            let idealAngle = rotation;
            if (dx === 1) idealAngle = 90;   // East
            else if (dx === -1) idealAngle = 270; // West
            else if (dy === -1) idealAngle = 0;    // North
            else if (dy === 1) idealAngle = 180;  // South

            if (rotation === idealAngle) {
                return await runtime.robot.moveForward();
            } else {
                const diff = (idealAngle - rotation + 360) % 360;
                return await runtime.robot.turn(diff > 180 ? 'left' : 'right');
            }
        `
    },
    {
        id: 'scan_environment',
        name: 'Scan Environment',
        description: 'Scans the immediate surroundings and returns a description of what the robot sees.',
        category: 'Functional',
        version: 2,
        cost: 0,
        parameters: [],
        implementationCode: `
            const { robot, environment } = runtime.robot.getState();
            const { x, y, rotation } = robot;
            
            const getObjectAt = (tx, ty) => environment.find(obj => obj.x === tx && obj.y === ty);

            let dx = 0, dy = 0;
            let direction = '';
            if (rotation === 0) { dy = -1; direction = 'North'; }
            if (rotation === 90) { dx = 1; direction = 'East'; }
            if (rotation === 180) { dy = 1; direction = 'South'; }
            if (rotation === 270) { dx = -1; direction = 'West'; }
            
            const posInFront = { x: x + dx, y: y + dy };
            const objectInFront = getObjectAt(posInFront.x, posInFront.y);

            let description = \`Robot is at (\${x}, \${y}) facing \${direction}. \`;
            if (robot.hasResource) {
                description += "Robot is carrying the resource. ";
            }

            if(objectInFront) {
                description += \`Directly in front is a \${objectInFront.type}. \`;
            } else {
                description += "The space in front is clear. ";
            }

            const resourceObj = environment.find(o => o.type === 'resource');
            if(resourceObj) {
                 description += \`The resource is at (\${resourceObj.x}, \${resourceObj.y}). \`;
            }
            
            const collectionPointObj = environment.find(o => o.type === 'collection_point');
             if(collectionPointObj) {
                 description += \`The collection point is at (\${collectionPointObj.x}, \${collectionPointObj.y}).\`;
            }

            return { success: true, message: description };
        `
    },
    {
        id: 'move_forward',
        name: 'Move Forward',
        description: 'Moves the robot one step in the direction it is currently facing. Fails if there is a wall.',
        category: 'Functional',
        version: 1,
        cost: 0,
        parameters: [],
        implementationCode: 'return await runtime.robot.moveForward();'
    },
    {
        id: 'turn_left',
        name: 'Turn Left',
        description: 'Turns the robot 90 degrees to the left.',
        category: 'Functional',
        version: 1,
        cost: 0,
        parameters: [],
        implementationCode: "return runtime.robot.turn('left');"
    },
    {
        id: 'turn_right',
        name: 'Turn Right',
        description: 'Turns the robot 90 degrees to the right.',
        category: 'Functional',
        version: 1,
        cost: 0,
        parameters: [],
        implementationCode: "return runtime.robot.turn('right');"
    },
    {
        id: 'pickup_resource',
        name: 'Pickup Resource',
        description: 'Picks up the resource if the robot is on the same square. Fails otherwise.',
        category: 'Functional',
        version: 2,
        cost: 0,
        parameters: [],
        implementationCode: 'return runtime.robot.pickupResource();'
    },
    {
        id: 'deliver_resource',
        name: 'Deliver Resource',
        description: 'Delivers the resource at the collection point, gaining Energy. Fails if not at the correct location.',
        category: 'Functional',
        version: 2,
        cost: 0,
        parameters: [],
        implementationCode: 'return runtime.robot.deliverResource();'
    }
];