
import type { ToolCreatorPayload } from '../types';

export const ROBOTICS_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Robot Simulation Environment',
        description: 'Displays the 2D grid environment for the robot simulation, showing the robot, walls, resources, and collection points.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide a visual representation of the agent\'s "body" and its environment, making its actions and challenges understandable.',
        parameters: [
            { name: 'robotStates', type: 'array', description: 'The current states of all robots in the swarm.', required: true },
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
                    const style = { gridColumnStart: obj.x + 1, gridRowStart: obj.y + 1 };
                    let content;
                    switch (obj.type) {
                        case 'wall': content = '🧱'; break;
                        case 'tree': content = '🌳'; break;
                        case 'resource': content = '🚗'; break; // Changed to a car as per use case
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

            const renderRobots = () => {
                if (!robotStates) return null;
                return robotStates.map(robot => {
                    const robotStyle = {
                        gridColumnStart: robot.x + 1,
                        gridRowStart: robot.y + 1,
                        transform: \`rotate(\${robot.rotation}deg)\`,
                        transition: 'all 0.3s ease-in-out',
                    };
                    return (
                        <div key={robot.id} style={robotStyle} className="relative flex items-center justify-center text-3xl">
                           {robot.hasResource && <div className="absolute text-sm" style={{top: -5, left: -5}}>🚗</div>}
                           <span>🤖</span>
                           <span className="absolute -bottom-4 text-[9px] text-white bg-black/50 px-1 rounded">{robot.id}</span>
                        </div>
                    );
                });
            };

            return (
                <div className="bg-gray-800/80 border-2 border-teal-500/60 rounded-xl p-4 shadow-lg">
                    <h3 className="text-lg font-bold text-teal-300 mb-3 text-center">Robotics Simulation</h3>
                    <div className="aspect-square bg-gray-900/70 p-2 rounded-md" style={{ display: 'grid', gridTemplateColumns: \`repeat(\${GRID_SIZE}, 1fr)\`, gridTemplateRows: \`repeat(\${GRID_SIZE}, 1fr)\` }}>
                        {renderGrid()}
                        {renderObjects()}
                        {renderRobots()}
                    </div>
                </div>
            );
        `,
    },
    {
        name: 'Pathfinder',
        description: "Calculates and executes the single best next action (move forward, turn left, or turn right) to get closer to a target coordinate. This is the primary tool for navigation. It uses the A* algorithm to find the optimal path while avoiding walls and trees.",
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To provide the agent with intelligent, autonomous navigation capabilities, abstracting away the low-level logic of pathfinding.',
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
            const obstacles = new Set(environment.filter(o => o.type === 'wall' || o.type === 'tree').map(o => \`\${o.x},\${o.y}\`));
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
                    if (obstacles.has(neighborKey)) continue;

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

            const path = [];
            let temp = finalNode;
            while (temp) {
                path.unshift(temp);
                temp = cameFrom.get(\`\${temp.x},\${temp.y}\`);
            }

            if (path.length < 2) {
                return { success: true, message: 'Pathfinder: No movement needed.' };
            }
            
            const nextStep = path[1];
            const dx = nextStep.x - startX;
            const dy = nextStep.y - startY;

            let idealAngle = rotation;
            if (dx === 1) idealAngle = 90;
            else if (dx === -1) idealAngle = 270;
            else if (dy === -1) idealAngle = 0;
            else if (dy === 1) idealAngle = 180;

            if (rotation === idealAngle) {
                return await runtime.robot.moveForward();
            } else {
                const diff = (idealAngle - rotation + 360) % 360;
                return await runtime.robot.turn(diff > 180 ? 'left' : 'right');
            }
        `
    },
    {
        name: 'Move Forward',
        description: 'Moves the robot one step in the direction it is currently facing. Fails if there is an obstacle.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a basic, primitive movement action for the robot.',
        parameters: [],
        implementationCode: 'return await runtime.robot.moveForward();'
    },
    {
        name: 'Turn Left',
        description: 'Turns the robot 90 degrees to the left.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a basic, primitive turning action for the robot.',
        parameters: [],
        implementationCode: "return runtime.robot.turn('left');"
    },
    {
        name: 'Turn Right',
        description: 'Turns the robot 90 degrees to the right.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a basic, primitive turning action for the robot.',
        parameters: [],
        implementationCode: "return runtime.robot.turn('right');"
    },
    {
        name: 'Pickup Resource',
        description: 'Picks up the resource if the robot is on the same square. Fails otherwise.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To allow the agent to interact with its environment by collecting resources.',
        parameters: [],
        implementationCode: 'return runtime.robot.pickupResource();'
    },
    {
        name: 'Deliver Resource',
        description: 'Delivers the resource at the collection point. Fails if not at the correct location.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To allow the agent to complete objectives by delivering collected resources.',
        parameters: [],
        implementationCode: 'return runtime.robot.deliverResource();'
    }
];
