
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
          const { robotState, personalities, handleManualControl } = props;
          const { robotStates, environmentState, observationHistory } = robotState;
          
          const pilotAgentId = 'robot-1'; // Hardcode pilot for now

          const handleDefineAgent = () => {
              handleManualControl('Define Robot Agent', { id: 'robot-1', startX: 2, startY: 2, behaviorType: 'seek_target', targetId: 'red_car' });
              handleManualControl('Define Robot Agent', { id: 'robot-2', startX: 10, startY: 10, behaviorType: 'patroller' });
          };
          
          const getStatusColor = (status) => {
            if (status.includes('FAIL')) return 'text-red-400';
            if (status.includes('SUCCESS')) return 'text-green-400';
            return 'text-gray-300';
          };
      
          return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
              <h3 className="text-lg font-bold text-indigo-300">Robotics Control</h3>
              
              {/* Simulation Controls */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleManualControl('Start Robot Simulation')} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg">Start</button>
                <button onClick={() => handleManualControl('Step Robot Simulation')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg">Step</button>
                <button onClick={() => handleManualControl('Stop Robot Simulation')} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-lg">Stop</button>
              </div>

              {/* Agent Definition */}
               <button onClick={handleDefineAgent} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3 rounded-lg">Define Agents</button>
              
              {/* Manual Piloting */}
              <div className="pt-2 border-t border-gray-700">
                  <h4 className="font-semibold text-gray-300 text-center mb-2">Manual Pilot for {pilotAgentId}</h4>
                  <div className="grid grid-cols-3 gap-2 justify-items-center">
                      <div></div>
                      <button onClick={() => handleManualControl('Move Forward', { agentId: pilotAgentId })} className="bg-gray-600 hover:bg-gray-500 rounded-md p-3">⬆️</button>
                      <div></div>
                      <button onClick={() => handleManualControl('Turn Left', { agentId: pilotAgentId })} className="bg-gray-600 hover:bg-gray-500 rounded-md p-3">⬅️</button>
                      <button onClick={() => handleManualControl('Create Skill From Observation', { skillName: 'LearnedPatrol', skillDescription: 'A pattern learned from manual piloting.' })} className="bg-yellow-600 hover:bg-yellow-500 rounded-md p-3 text-sm font-bold">Learn</button>
                      <button onClick={() => handleManualControl('Turn Right', { agentId: pilotAgentId })} className="bg-gray-600 hover:bg-gray-500 rounded-md p-3">➡️</button>
                  </div>
              </div>
              
               {/* Agent Status Display */}
               <div className="pt-2 border-t border-gray-700">
                  <h4 className="font-semibold text-gray-300 mb-2">Agent Status</h4>
                   <div className="space-y-2">
                     {robotStates.map(agent => (
                       <div key={agent.id} className="bg-gray-900/50 p-2 rounded-lg text-sm">
                         <div className="flex justify-between">
                           <span className="font-bold">{agent.id}</span>
                           <span className="font-mono">({agent.x}, {agent.y}) rot: {agent.rotation}°</span>
                         </div>
                       </div>
                     ))}
                     {robotStates.length === 0 && <p className="text-gray-500 text-sm">No active agents.</p>}
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