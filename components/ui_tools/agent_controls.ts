
import type { LLMTool } from '../../types';

export const agentControlsTools: LLMTool[] = [
  {
      id: 'system_controls',
      name: 'System Controls',
      description: 'Provides system-level actions like resetting the application state.',
      category: 'UI Component',
      version: 4,
      parameters: [
          { name: 'handleResetTools', type: 'string', description: 'Function to reset all tools to their default state.', required: true },
          { name: 'handleClearEmbeddingsCache', type: 'string', description: 'Function to clear the tool embeddings cache.', required: true },
      ],
      implementationCode: `
        return (
          <div className="w-full max-w-7xl mx-auto p-4 bg-slate-800/50 border border-slate-700/80 rounded-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-md font-semibold text-slate-200">System Recovery</h3>
                <p className="text-sm text-slate-400 max-w-2xl">If the agent becomes unstable or tool search behaves unexpectedly, use these recovery options. These actions cannot be undone.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <button
                    onClick={handleClearEmbeddingsCache}
                    className="bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-700 transition-colors"
                  >
                    Clear Embeddings Cache
                  </button>
                  <button
                    onClick={handleResetTools}
                    className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Reset All Tools
                  </button>
              </div>
            </div>
          </div>
        );
      `
    },
     {
      id: 'operating_mode_selector',
      name: 'Operating Mode Selector',
      description: "Controls the agent's level of autonomy.",
      category: 'UI Component',
      version: 5,
      parameters: [
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'setOperatingMode', type: 'string', description: 'Function to change the operating mode.', required: true },
        { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
        { name: 'proposedAction', type: 'object', description: 'Any pending action requires user approval.', required: false },
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
        { name: 'isTaskLoopRunning', type: 'boolean', description: 'Whether the task loop is running.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
      ],
      implementationCode: `
        const modes = [
          { id: 'COMMAND', name: 'Command', description: 'Agent acts only on direct user instructions.' },
          { id: 'ASSIST', name: 'Assist', description: 'Agent suggests actions and requires user approval.' },
          { id: 'TASK', name: 'Task', description: 'A single agent works on a multi-step user goal.' },
          { id: 'SWARM', name: 'Swarm', description: 'A resilient agent collective works on a single task.' },
          { id: 'AUTONOMOUS', name: 'Autonomous', description: 'A single agent acts on its own to achieve long-term goals.' },
        ];
        
        const isLoopRunning = isAutonomousLoopRunning || isSwarmRunning || isTaskLoopRunning;

        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Operating Mode</h3>
            <div className="flex flex-col space-y-2">
              {modes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setOperatingMode(mode.id)}
                  disabled={isLoading || !!proposedAction || isLoopRunning}
                  className={\`w-full text-left p-2 rounded-md transition-colors \${operatingMode === mode.id ? 'bg-indigo-600' : 'bg-gray-700/60 hover:bg-gray-600/80'} disabled:bg-gray-700/40 disabled:cursor-not-allowed\`}
                >
                  <p className="font-bold text-white">{mode.name}</p>
                  <p className="text-xs text-gray-300">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>
        );
      `
    },
    {
      id: 'agent_inventory',
      name: 'Agent Inventory',
      description: "Displays the agent's current resource levels.",
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'agentResources', type: 'object', description: 'A record of the agent\'s resources.', required: true },
      ],
      implementationCode: `
        const EnergyIcon = () => (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5.268l4.06-4.06a1 1 0 011.414 1.414l-4.06 4.06H18a1 1 0 011 1v2a1 1 0 01-1 1h-2.268l4.06 4.06a1 1 0 01-1.414 1.414l-4.06-4.06V18a1 1 0 01-1.7.707l-5-5a1 1 0 010-1.414l5-5A1 1 0 0111.3 1.046zM10 12.586L7.414 10 10 7.414v5.172z" clipRule="evenodd" />
            </svg>
        );

        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Agent Inventory</h3>
            <div className="flex items-center gap-4 flex-grow">
                <div className="flex items-center gap-2">
                    <EnergyIcon />
                    <span className="text-slate-300 font-semibold">Energy:</span>
                </div>
                <p className="text-2xl font-bold text-yellow-400">{agentResources.Energy || 0}</p>
            </div>
            <p className="text-xs text-slate-500 mt-1">Resources are spent to perform actions.</p>
          </div>
        );
      `
    },
    {
      id: 'autonomous_resource_monitor',
      name: 'Autonomous Resource Monitor',
      description: "Displays the agent's remaining daily autonomous action credits.",
      category: 'UI Component',
      version: 2,
      parameters: [
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'autonomousActionCount', type: 'number', description: 'Number of autonomous actions taken today.', required: true },
        { name: 'autonomousActionLimit', type: 'number', description: 'The daily limit of autonomous actions.', required: true },
      ],
      implementationCode: `
        const isUnlimited = autonomousActionLimit === -1;
        const percentage = !isUnlimited && autonomousActionLimit > 0 ? (autonomousActionCount / autonomousActionLimit) * 100 : 0;
        let usageColor = 'bg-green-600';
        if (percentage > 90) usageColor = 'bg-red-600';
        else if (percentage > 70) usageColor = 'bg-yellow-500';

        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Daily Action Quota</h3>
            <div className="flex-grow flex flex-col justify-center">
              <div className="flex justify-between items-baseline mb-1">
                  <span className="text-2xl font-bold text-white">{isUnlimited ? '∞' : autonomousActionCount}</span>
                  <span className="text-sm text-slate-400">/ {isUnlimited ? 'Unlimited' : autonomousActionLimit} actions</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2.5">
                  <div 
                    className={\`\${usageColor} h-2.5 rounded-full transition-all duration-500\`}
                    style={{ width: \`\${isUnlimited ? 0 : percentage}%\` }}
                  ></div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">Actions reset daily. Helps prevent run-away loops.</p>
          </div>
        );
      `
    },
    {
      id: 'autonomous_action_limiter',
      name: 'Autonomous Action Limiter',
      description: 'Sets the daily action limit for autonomous modes.',
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'autonomousActionLimit', type: 'number', description: 'The daily limit of autonomous actions.', required: true },
        { name: 'setAutonomousActionLimit', type: 'string', description: 'Function to update the action limit.', required: true },
        { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
      ],
      implementationCode: `
        const isUnlimited = autonomousActionLimit === -1;
    
        const handleLimitChange = (e) => {
            const value = parseInt(e.target.value, 10);
            setAutonomousActionLimit(value);
        };
        
        const handleToggleUnlimited = () => {
            setAutonomousActionLimit(isUnlimited ? 20 : -1);
        };
    
        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col justify-between">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Action Limit</h3>
            <div className="flex-grow flex flex-col justify-center">
                {isUnlimited ? (
                     <p className="text-3xl font-bold text-center text-green-400">UNLIMITED</p>
                ) : (
                    <input
                      type="number"
                      value={autonomousActionLimit}
                      onChange={handleLimitChange}
                      disabled={isLoading}
                      className="w-full text-center text-3xl font-bold bg-transparent border-0 text-white p-0 focus:ring-0"
                    />
                )}
            </div>
            <button onClick={handleToggleUnlimited} className="w-full text-xs text-center p-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300">
                {isUnlimited ? 'Set a Limit' : 'Set to Unlimited'}
            </button>
          </div>
        );
      `
    },
    {
      id: 'autonomous_cycle_delay_control',
      name: 'Autonomous Cycle Delay Control',
      description: 'Controls the delay between autonomous agent cycles.',
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'cycleDelay', type: 'number', description: 'The delay in milliseconds.', required: true },
        { name: 'setCycleDelay', type: 'string', description: 'Function to update the delay.', required: true },
        { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
      ],
      implementationCode: `
        const handleDelayChange = (e) => {
            setCycleDelay(parseInt(e.target.value, 10));
        };
    
        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col justify-between">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Cycle Delay (ms)</h3>
             <div className="flex-grow flex items-center justify-center">
                 <input
                  type="number"
                  step="100"
                  value={cycleDelay}
                  onChange={handleDelayChange}
                  disabled={isLoading}
                  className="w-full text-center text-3xl font-bold bg-transparent border-0 text-white p-0 focus:ring-0"
                />
            </div>
            <p className="text-xs text-slate-500 mt-1 text-center">Delay between automated agent actions.</p>
          </div>
        );
      `
    },
    {
      id: 'autonomous_control_panel',
      name: 'Autonomous Control Panel',
      description: 'Provides controls to start/stop autonomous agent loops (Autonomous or Task modes) and view their activity.',
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
        { name: 'handleToggleAutonomousLoop', type: 'string', description: 'Function to toggle the autonomous loop.', required: true },
        { name: 'isTaskLoopRunning', type: 'boolean', description: 'Whether the task loop is running.', required: true },
        { name: 'handleStopTask', type: 'string', description: 'Function to stop the current task.', required: true },
      ],
      implementationCode: `
          const isAutonomous = operatingMode === 'AUTONOMOUS';
          const isTask = operatingMode === 'TASK';
          
          let buttonText = '';
          let buttonAction = () => {};
          let isRunning = false;
          
          if (isAutonomous) {
              buttonText = isAutonomousLoopRunning ? 'Stop Autonomous Loop' : 'Start Autonomous Loop';
              buttonAction = handleToggleAutonomousLoop;
              isRunning = isAutonomousLoopRunning;
          } else if (isTask) {
              buttonText = 'Stop Current Task';
              buttonAction = handleStopTask;
              isRunning = isTaskLoopRunning;
          }
  
          return (
              <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                   <h3 className="text-lg font-bold text-slate-200">Activity Control Panel</h3>
                   <p className="text-sm text-slate-400">Manage the active agent process.</p>
                </div>
                <button
                    onClick={buttonAction}
                    disabled={!isAutonomous && !isTaskLoopRunning}
                    className={\`px-6 py-2 font-semibold rounded-lg transition-colors text-white \${
                        isRunning 
                            ? 'bg-red-600 hover:bg-red-700' 
                            : 'bg-green-600 hover:bg-green-700'
                    } disabled:bg-gray-600 disabled:cursor-not-allowed\`}
                >
                    {buttonText}
                </button>
              </div>
          );
      `
    },
    {
      id: 'agent_swarm_display',
      name: 'Agent Swarm Display',
      description: 'Visualizes the status and activity of each agent in the swarm.',
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'agentSwarm', type: 'array', description: 'The array of agent workers.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
        { name: 'handleStopSwarm', type: 'string', description: 'Function to stop the swarm task.', required: true },
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
  
          return (
              <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4">
                   <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div>
                       <h3 className="text-lg font-bold text-slate-200">Agent Swarm Panel</h3>
                       <p className="text-sm text-slate-400">Monitoring the collaborative agent collective.</p>
                    </div>
                    <button
                        onClick={handleStopSwarm}
                        disabled={!isSwarmRunning}
                        className="px-6 py-2 font-semibold rounded-lg transition-colors text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Stop Swarm Task
                    </button>
                  </div>
  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {agentSwarm.map(agent => {
                          const styles = getStatusStyles(agent.status);
                          return (
                              <div key={agent.id} className={\`\${styles.bg} border \${styles.border} rounded-lg p-3\`} >
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
