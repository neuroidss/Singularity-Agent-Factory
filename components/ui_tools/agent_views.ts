import type { LLMTool } from '../../types';

export const agentViewTools: LLMTool[] = [
  {
    id: 'manual_robot_control',
    name: 'Manual Robot Control',
    description: "Provides UI buttons for direct manual control of the lead robot ('agent-1'), and for creating new skills from observed actions.",
    category: 'UI Component',
    version: 2,
    parameters: [
      { name: 'handleManualControl', type: 'string', description: 'Function to call for a manual action.', required: true },
      { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the agent swarm is currently active.', required: true },
    ],
    implementationCode: `
      const ControlButton = ({ action, label, children, args = {} }) => (
        <button
          onClick={() => handleManualControl(action, args)}
          disabled={isSwarmRunning}
          className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-semibold transition-colors disabled:bg-slate-800 disabled:cursor-not-allowed"
          title={label}
        >
          {children}
        </button>
      );

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <h3 className="text-lg font-bold text-indigo-300 mb-2">Pilot Controls (Agent-1)</h3>
          <p className="text-xs text-gray-400 mb-4">Control the lead robot directly. The agent can learn from your actions if you later use the "Create Skill From Observation" tool.</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div></div>
            <ControlButton action="Move Forward" label="Move Forward">↑</ControlButton>
            <div></div>
            <ControlButton action="Turn Left" label="Turn Left">←</ControlButton>
            <ControlButton action="Pickup Resource" label="Pickup Resource">P</ControlButton>
            <ControlButton action="Turn Right" label="Turn Right">→</ControlButton>
            <div></div>
            <ControlButton action="Deliver Resource" label="Deliver Resource">D</ControlButton>
            <div></div>
          </div>
        </div>
      );
    `
  },
  {
      id: 'agent_swarm_display',
      name: 'Agent Swarm Display',
      description: 'Visualizes the status and activity of each agent in the swarm.',
      category: 'UI Component',
      version: 2,
      parameters: [
        { name: 'agentSwarm', type: 'array', description: 'The array of agent workers.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
        { name: 'handleStopSwarm', type: 'string', description: 'Function to stop the swarm task.', required: true },
        { name: 'currentUserTask', type: 'string', description: 'The current high-level task for the swarm.', required: true },
      ],
      implementationCode: `
          const getStatusStyles = (status) => {
              switch (status) {
                  case 'working': return { bg: 'bg-blue-900/50', border: 'border-blue-500', text: 'text-blue-300', icon: '🧠' };
                  case 'succeeded': return { bg: 'bg-green-900/50', border: 'border-green-500', text: 'text-green-300', icon: '✅' };
                  case 'failed': return { bg: 'bg-yellow-900/50', border: 'border-yellow-500', text: 'text-yellow-300', icon: '⚠️' };
                  case 'terminated': return { bg: 'bg-red-900/50', border: 'border-red-500', text: 'text-red-300', icon: '❌' };
                  default: return { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-400', icon: '💤' }; // idle
              }
          };
          
          if (!isSwarmRunning && agentSwarm.length === 0) {
              return (
                  <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full flex items-center justify-center">
                      <p className="text-gray-400">Swarm is idle. Assign a task to activate.</p>
                  </div>
              );
          }
  
          return (
              <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                   <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
                    <div>
                       <h3 className="text-lg font-bold text-indigo-300">Agent Swarm</h3>
                       <p className="text-sm text-gray-400">Current Goal: {currentUserTask}</p>
                    </div>
                    <button
                        onClick={handleStopSwarm}
                        disabled={!isSwarmRunning}
                        className="px-4 py-2 font-semibold rounded-lg transition-colors text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Stop Swarm
                    </button>
                  </div>
  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {agentSwarm.map(agent => {
                          const styles = getStatusStyles(agent.status);
                          return (
                              <div key={agent.id} className={\`\${styles.bg} border \${styles.border} rounded-lg p-3 transition-all\`} >
                                  <div className="flex justify-between items-center mb-2">
                                      <h4 className="font-bold text-white">{agent.id}</h4>
                                      <span className={\`px-2 py-0.5 rounded-full text-xs font-semibold \${styles.text} \${styles.bg}\`}>{styles.icon} {agent.status}</span>
                                  </div>
                                  <div className="text-xs text-slate-300 min-h-[40px] bg-black/20 p-2 rounded-md">
                                      <p className="font-semibold">Last Action:</p>
                                      <p className="truncate">{agent.lastAction || 'None'}</p>
                                  </div>
                                  {agent.error && <p className="text-xs text-red-400 mt-2">Error: {agent.error}</p>}
                              </div>
                          );
                      })}
                  </div>
              </div>
          );
      `
  },
];