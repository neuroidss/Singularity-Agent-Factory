import type { LLMTool } from '../types';

export const roboticsTools: LLMTool[] = [
    {
        id: 'robot_simulation_environment',
        name: 'Robot Simulation Environment',
        description: 'Displays the 2D grid environment for the robot simulation, showing the robot, walls, package, and goal.',
        category: 'UI Component',
        version: 1,
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
                        case 'package': content = '📦'; break;
                        case 'goal': content = '🏁'; break;
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
                           {robotState.hasPackage && <div className="absolute text-sm" style={{top: -5, left: -5}}>📦</div>}
                           <span>🤖</span>
                        </div>
                    </div>
                </div>
            );
        `,
    },
    {
        id: 'scan_environment',
        name: 'Scan Environment',
        description: 'Scans the immediate surroundings and returns a description of what the robot sees.',
        category: 'Functional',
        version: 1,
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
            if (robot.hasPackage) {
                description += "Robot is carrying the package. ";
            }

            if(objectInFront) {
                description += \`Directly in front is a \${objectInFront.type}. \`;
            } else {
                description += "The space in front is clear. ";
            }

            const packageObj = environment.find(o => o.type === 'package');
            if(packageObj) {
                 description += \`The package is at (\${packageObj.x}, \${packageObj.y}). \`;
            }
            
            const goalObj = environment.find(o => o.type === 'goal');
             if(goalObj) {
                 description += \`The goal is at (\${goalObj.x}, \${goalObj.y}).\`;
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
        parameters: [],
        implementationCode: 'return await runtime.robot.moveForward();'
    },
    {
        id: 'turn_left',
        name: 'Turn Left',
        description: 'Turns the robot 90 degrees to the left.',
        category: 'Functional',
        version: 1,
        parameters: [],
        implementationCode: "return runtime.robot.turn('left');"
    },
    {
        id: 'turn_right',
        name: 'Turn Right',
        description: 'Turns the robot 90 degrees to the right.',
        category: 'Functional',
        version: 1,
        parameters: [],
        implementationCode: "return runtime.robot.turn('right');"
    },
    {
        id: 'pickup_package',
        name: 'Pickup Package',
        description: 'Picks up the package if the robot is on the same square. Fails otherwise.',
        category: 'Functional',
        version: 1,
        parameters: [],
        implementationCode: 'return runtime.robot.grip();'
    },
    {
        id: 'drop_package',
        name: 'Drop Package',
        description: 'Drops the package at the robot\'s current location. Used to deliver the package at the goal.',
        category: 'Functional',
        version: 1,
        parameters: [],
        implementationCode: 'return runtime.robot.release();'
    }
];
