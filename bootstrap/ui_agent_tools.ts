import type { ToolCreatorPayload } from '../types';

export const UI_AGENT_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Agent Control Panel',
        description: 'A unified UI for managing the robotics simulation, including defining agents, controlling the simulation, and manual piloting for skill observation.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide a comprehensive control interface for the robotics simulation and learning environment.',
        parameters: [
          { name: 'robotState', type: 'object', description: 'The current state of all robots and the environment.', required: true },
          { name: 'personalities', type: 'array', description: 'The defined personalities for the agents.', required: true },
          { name: 'handleManualControl', type: 'object', description: 'Function to execute a manual command.', required: true },
        ],
        implementationCode: `
          const { robotStates, environmentState, observationHistory } = robotState;
          
          const pilotAgentId = 'Scout-Drone-1'; // Pilot the scout drone

          const handleDefineAgent = () => {
              // Deploys a team for the mission
              handleManualControl('Define Robot Agent', { id: 'Scout-Drone-1', asset_glb: 'assets/drone_scout.glb', startX: 2, startY: 2, behaviorType: 'seek_target', targetId: 'red_car_1' });
              // You can define other agents here if needed, for example a resource collector for depleted batteries.
          };
          
          // --- Multi-input Control System ---
          const [gamepadStatus, setGamepadStatus] = React.useState('Disconnected');
          const joystickBaseRef = React.useRef(null);
          const joystickKnobRef = React.useRef(null);
          const inputState = React.useRef({
              joyX: 0, joyY: 0, joyActive: false,
              keyF: 0, keyB: 0, keyL: 0, keyR: 0,
              padX: 0, padY: 0, padConnected: false,
          });
          const lastCommandTimeRef = React.useRef(0);
          const animationFrameId = React.useRef(null);
          
          const COMMAND_INTERVAL = 150; // ms between commands

          React.useEffect(() => {
            const handleGamepadConnected = (e) => {
                inputState.current.padConnected = true;
                setGamepadStatus(\`Connected: \${e.gamepad.id}\`);
            };
            const handleGamepadDisconnected = (e) => {
                inputState.current.padConnected = false;
                setGamepadStatus('Disconnected');
            };
            window.addEventListener('gamepadconnected', handleGamepadConnected);
            window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

            const handleKeyDown = (e) => {
                if (e.repeat) return;
                if (e.key === 'w' || e.key === 'ArrowUp') inputState.current.keyF = 1;
                if (e.key === 's' || e.key === 'ArrowDown') inputState.current.keyB = 1;
                if (e.key === 'a' || e.key === 'ArrowLeft') inputState.current.keyL = 1;
                if (e.key === 'd' || e.key === 'ArrowRight') inputState.current.keyR = 1;
            };
            const handleKeyUp = (e) => {
                if (e.key === 'w' || e.key === 'ArrowUp') inputState.current.keyF = 0;
                if (e.key === 's' || e.key === 'ArrowDown') inputState.current.keyB = 0;
                if (e.key === 'a' || e.key === 'ArrowLeft') inputState.current.keyL = 0;
                if (e.key === 'd' || e.key === 'ArrowRight') inputState.current.keyR = 0;
            };
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            
            const base = joystickBaseRef.current;
            const knob = joystickKnobRef.current;
            if (!base || !knob) return;
            
            const handlePointerDown = (e) => {
                e.preventDefault();
                inputState.current.joyActive = true;
            };
            const handlePointerMove = (e) => {
                if (!inputState.current.joyActive) return;
                e.preventDefault();
                const rect = base.getBoundingClientRect();
                const size = rect.width;
                const halfSize = size / 2;
                let x = e.clientX - rect.left - halfSize;
                let y = e.clientY - rect.top - halfSize;
                const dist = Math.min(halfSize, Math.hypot(x, y));
                const angle = Math.atan2(y, x);
                x = Math.cos(angle) * dist;
                y = Math.sin(angle) * dist;
                knob.style.transform = \`translate(-50%, -50%) translate(\${x}px, \${y}px)\`;
                inputState.current.joyX = x / halfSize;
                inputState.current.joyY = y / halfSize;
            };
            const handlePointerUp = (e) => {
                e.preventDefault();
                inputState.current.joyActive = false;
                knob.style.transform = 'translate(-50%, -50%)';
                inputState.current.joyX = 0;
                inputState.current.joyY = 0;
            };
            
            base.addEventListener('pointerdown', handlePointerDown);
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);

            const gameLoop = () => {
                const now = performance.now();
                
                if (inputState.current.padConnected) {
                    const gp = navigator.getGamepads()[0];
                    if (gp) {
                        const deadzone = 0.2;
                        const rawX = gp.axes[0] || 0;
                        const rawY = gp.axes[1] || 0;
                        inputState.current.padX = Math.abs(rawX) > deadzone ? rawX : 0;
                        inputState.current.padY = Math.abs(rawY) > deadzone ? rawY : 0;
                    }
                }
                
                // Combine inputs (gamepad takes precedence)
                const finalY = inputState.current.padConnected ? -inputState.current.padY : -inputState.current.joyY + (inputState.current.keyF - inputState.current.keyB);
                const finalX = inputState.current.padConnected ? inputState.current.padX : inputState.current.joyX + (inputState.current.keyR - inputState.current.keyL);

                if (now - lastCommandTimeRef.current > COMMAND_INTERVAL) {
                    let command = null;
                    if (finalY > 0.5) command = 'Move Forward';
                    else if (finalY < -0.5) command = 'Move Backward';
                    else if (finalX < -0.5) command = 'Turn Left';
                    else if (finalX > 0.5) command = 'Turn Right';
                    
                    if (command) {
                        handleManualControl(command, { agentId: pilotAgentId });
                        lastCommandTimeRef.current = now;
                    }
                }
                animationFrameId.current = requestAnimationFrame(gameLoop);
            };
            gameLoop();

            return () => {
                window.removeEventListener('gamepadconnected', handleGamepadConnected);
                window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
                if (base) base.removeEventListener('pointerdown', handlePointerDown);
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            };
          }, [handleManualControl]);

          return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
              <h3 className="text-lg font-bold text-indigo-300">Robotics Control</h3>
              
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleManualControl('Start Robot Simulation')} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg">Start</button>
                <button onClick={() => handleManualControl('Step Robot Simulation')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg">Step</button>
                <button onClick={() => handleManualControl('Stop Robot Simulation')} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-lg">Stop</button>
              </div>

              <button onClick={handleDefineAgent} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3 rounded-lg">Define Agents</button>
              
              <div className="pt-2 border-t border-gray-700">
                  <h4 className="font-semibold text-gray-300 text-center mb-2">Manual Pilot for {pilotAgentId}</h4>
                  <p className="text-xs text-center text-gray-400 mb-2">Use Joystick, WASD/Arrows, or connect a Gamepad.</p>
                  <div className="flex items-center justify-center gap-4">
                      <div ref={joystickBaseRef} className="relative w-32 h-32 bg-gray-700/50 rounded-full flex-shrink-0 touch-none select-none">
                          <div ref={joystickKnobRef} className="absolute w-16 h-16 bg-gray-500 rounded-full border-2 border-gray-400" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', transition: 'transform 0.1s' }}></div>
                      </div>
                      <div className="flex flex-col gap-2">
                          <button onClick={() => handleManualControl('Create Skill From Observation', { skillName: 'LearnedPatrol', skillDescription: 'A pattern learned from manual piloting.' })} className="bg-yellow-600 hover:bg-yellow-500 rounded-lg p-3 text-sm font-bold">
                              Learn Skill
                          </button>
                          <div className="text-center text-xs p-2 bg-gray-900/50 rounded-lg">
                              <p className="font-semibold text-gray-300">Gamepad:</p>
                              <p className={\`\${inputState.current.padConnected ? 'text-green-400' : 'text-gray-500'}\`}>
                                  {gamepadStatus}
                              </p>
                          </div>
                      </div>
                  </div>
              </div>
              
               <div className="pt-2 border-t border-gray-700">
                  <h4 className="font-semibold text-gray-300 mb-2">Agent Status</h4>
                   <div className="space-y-2 max-h-48 overflow-y-auto">
                     {personalities.map(p => {
                        const activeAgent = robotStates.find(r => r.id === p.id);
                        const statusColor = activeAgent ? 'text-green-400' : 'text-yellow-400';
                        const statusText = activeAgent ? 'Active' : 'Defined';

                        const powerLevel = activeAgent?.powerLevel || 0;
                        const powerColor = powerLevel > 50 ? 'text-green-400' : powerLevel > 20 ? 'text-yellow-400' : 'text-red-500';

                        return (
                           <div key={p.id} className="bg-gray-900/50 p-2 rounded-lg text-sm">
                                <div className="flex justify-between">
                                   <span className="font-bold">{p.id}</span>
                                   <span className={\`font-mono \${statusColor}\`}>{statusText}</span>
                                </div>
                                {activeAgent ? (
                                    <div className="font-mono text-xs text-gray-400 flex justify-between items-center">
                                      <span>({activeAgent.x.toFixed(0)}, {activeAgent.y.toFixed(0)}) rot: {activeAgent.rotation}°</span>
                                      <span className={powerColor}>PWR: {powerLevel}%</span>
                                    </div>
                                ) : (
                                    <div className="font-mono text-xs text-gray-400">Behavior: {p.behaviorType}</div>
                                )}
                           </div>
                        );
                     })}
                     {personalities.length === 0 && <p className="text-gray-500 text-sm">No agents defined.</p>}
                   </div>
               </div>
            </div>
          );
        `
    },
    {
        name: 'Agent Status Display',
        description: 'Visualizes the status and activity of the agent swarm master.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: "To provide a real-time visualization of the agent's state, actions, and health.",
        parameters: [
          { name: 'agentSwarm', type: 'array', description: 'The array of agent workers (usually just one).', required: true },
          { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the agent is running.', required: true },
          { name: 'handleStopSwarm', type: 'object', description: 'Function to stop the agent task.', required: true },
          { name: 'currentUserTask', type: 'object', description: 'The current high-level task for the agent.', required: true },
        ],
        implementationCode: `
              const getStatusStyles = (status) => {
                  switch (status) {
                      case 'working': return { bg: 'bg-blue-900/50', border: 'border-blue-500', text: 'text-blue-300', icon: '🧠' };
                      case 'succeeded': return { bg: 'bg-green-900/50', border: 'border-green-500', text: 'text-green-300', icon: '✅' };
                      case 'paused': return { bg: 'bg-orange-900/50', border: 'border-orange-500', text: 'text-orange-300', icon: '⏸️' };
                      case 'failed': return { bg: 'bg-yellow-900/50', border: 'border-yellow-500', text: 'text-yellow-300', icon: '⚠️' };
                      case 'terminated': return { bg: 'bg-red-900/50', border: 'border-red-500', text: 'text-red-300', icon: '❌' };
                      default: return { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-400', icon: '💤' }; // idle
                  }
              };
              
              if (!isSwarmRunning && (!agentSwarm || agentSwarm.length === 0 || agentSwarm.every(a => a.status === 'idle'))) {
                  return (
                      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full flex items-center justify-center">
                          <p className="text-gray-400">Agent is idle. Assign a task to activate.</p>
                      </div>
                  );
              }

              const taskText = typeof currentUserTask === 'string' 
                ? currentUserTask 
                : currentUserTask?.userRequest?.text || 'None';
      
              return (
                  <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                       <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
                        <div>
                           <h3 className="text-lg font-bold text-indigo-300">Agent Status</h3>
                           <p className="text-sm text-gray-400">Current Goal: {taskText}</p>
                        </div>
                        <button
                            onClick={() => handleStopSwarm()}
                            disabled={!isSwarmRunning}
                            className="px-4 py-2 font-semibold rounded-lg transition-colors text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            Stop Task
                        </button>
                      </div>
      
                      <div className="space-y-3">
                          {agentSwarm && agentSwarm.map(agent => {
                              const styles = getStatusStyles(agent.status);
                              return (
                                  <div key={agent.id} className={\`\${styles.bg} border \${styles.border} rounded-lg p-3 transition-all\`} >
                                      <div className="flex justify-between items-center mb-2">
                                          <h4 className="font-bold text-white">{agent.id}</h4>
                                          <span className={\`px-2 py-0.5 rounded-full text-xs font-semibold \${styles.text} \${styles.bg}\`}>{styles.icon} {agent.status}</span>
                                      </div>
                                      <div className="text-xs text-slate-300 min-h-[40px] bg-black/20 p-2 rounded-md">
                                          <p className="font-semibold">Last Action:</p>
                                          <p className="whitespace-pre-wrap break-words">{agent.lastAction || 'None'}</p>
                                      </div>
                                      {agent.error && <p className="text-xs text-red-400 mt-2">Error: {agent.error}</p>}
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              );
          `
    }
];