import type { LLMTool } from '../../types';

export const agentControlsTools: LLMTool[] = [
  {
      id: 'system_controls',
      name: 'System Controls',
      description: 'Provides system-level actions like resetting the application state.',
      category: 'UI Component',
      version: 3,
      parameters: [
          { name: 'handleResetTools', type: 'string', description: 'Function to reset all tools to their default state.', required: true },
      ],
      implementationCode: `
        return (
          <div className="w-full max-w-7xl mx-auto p-4 bg-slate-800/50 border border-slate-700/80 rounded-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-md font-semibold text-slate-200">System Recovery</h3>
                <p className="text-sm text-slate-400 max-w-2xl">If the agent becomes unstable or critical tools are deleted, you can reset all tools to their original state. This action cannot be undone.</p>
              </div>
              <button
                onClick={handleResetTools}
                className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
              >
                Reset All Tools
              </button>
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
      version: 3,
      parameters: [
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'setOperatingMode', type: 'string', description: 'Function to change the operating mode.', required: true },
        { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
        { name: 'proposedAction', type: 'object', description: 'Any pending action requires user approval.', required: false },
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
        { name: 'isTaskLoopRunning', type: 'boolean', description: 'Whether the task loop is running.', required: true },
      ],
      implementationCode: `
        const modes = [
          { id: 'COMMAND', name: 'Command', description: 'Agent acts only on direct user instructions.' },
          { id: 'ASSIST', name: 'Assist', description: 'Agent suggests actions and requires user approval.' },
          { id: 'TASK', name: 'Task', description: 'Agent works autonomously to complete the current user task, then stops.' },
          { id: 'AUTONOMOUS', name: 'Autonomous', description: 'Agent acts on its own to achieve long-term goals.' },
        ];
        
        // This is imported from types.ts, but we need it available in the scope of the dynamic component
        const OperatingMode = { Command: 'COMMAND', Assist: 'ASSIST', Task: 'TASK', Autonomous: 'AUTONOMOUS' };
        const isLoopRunning = isAutonomousLoopRunning || isTaskLoopRunning;

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
      id: 'autonomous_resource_monitor',
      name: 'Autonomous Resource Monitor',
      description: "Displays the agent's remaining daily autonomous action credits.",
      category: 'UI Component',
      version: 1,
      parameters: [
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'autonomousActionCount', type: 'number', description: 'Number of autonomous actions taken today.', required: true },
        { name: 'autonomousActionLimit', type: 'number', description: 'The daily limit of autonomous actions.', required: true },
      ],
      implementationCode: `
        // This is imported from types.ts, but we need it available in the scope of the dynamic component
        const OperatingMode = { Command: 'COMMAND', Assist: 'ASSIST', Task: 'TASK', Autonomous: 'AUTONOMOUS' };
        
        const isUnlimited = autonomousActionLimit === -1;
        const percentage = !isUnlimited && autonomousActionLimit > 0 ? (autonomousActionCount / autonomousActionLimit) * 100 : 0;
        const isDepleted = !isUnlimited && autonomousActionCount >= autonomousActionLimit;

        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Autonomous Actions Today</h3>
            <div className="flex items-center gap-4">
                 {isUnlimited ? (
                    <p className="text-2xl font-bold text-green-400">Unlimited</p>
                 ) : (
                    <>
                        <p className={\`text-2xl font-bold \${isDepleted ? 'text-red-500' : 'text-white'}\`}>
                            {autonomousActionCount}
                        </p>
                        <p className="text-2xl font-light text-slate-400">/</p>
                        <p className="text-2xl text-slate-400">{autonomousActionLimit}</p>
                    </>
                 )}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-3">
              <div 
                className={\`h-2.5 rounded-full \${isUnlimited ? 'bg-green-500' : (isDepleted ? 'bg-red-600' : 'bg-green-500')}\`}
                style={{ width: \`\${isUnlimited ? 100 : Math.min(percentage, 100)}%\` }}
              ></div>
            </div>
             <p className="text-xs text-slate-500 mt-1">
                {isUnlimited ? 'Running without limits.' : \`Resets daily. Remaining: \${Math.max(0, autonomousActionLimit - autonomousActionCount)}\`}
            </p>
          </div>
        );
      `
    },
    {
      id: 'autonomous_action_limiter',
      name: 'Autonomous Action Limiter',
      description: "Configures the daily action limit for the autonomous agent.",
      category: 'UI Component',
      version: 2,
      parameters: [
        { name: 'autonomousActionLimit', type: 'number', description: 'The current daily limit.', required: true },
        { name: 'setAutonomousActionLimit', type: 'string', description: 'Function to update the daily limit.', required: true },
      ],
      implementationCode: `
        const isInfinite = autonomousActionLimit === -1;

        const handleLimitChange = (e) => {
          const value = parseInt(e.target.value, 10);
          if (!isNaN(value) && value >= 0 && value <= 500) {
            setAutonomousActionLimit(value);
          }
        };
        
        const handleInputChange = (e) => {
             const value = parseInt(e.target.value, 10);
             if (!isNaN(value)) {
                setAutonomousActionLimit(value);
             } else if (e.target.value === '') {
                 setAutonomousActionLimit(0);
             }
        }

        const toggleInfinite = () => {
          setAutonomousActionLimit(isInfinite ? 20 : -1);
        };

        return (
          <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 h-full flex flex-col">
            <h3 className="text-md font-semibold text-slate-200 mb-2">Daily Action Limit</h3>
            <div className="flex items-center gap-4 flex-grow">
              {isInfinite ? (
                <p className="text-2xl font-bold text-green-400">Unlimited</p>
              ) : (
                <input 
                  type="number"
                  value={String(autonomousActionLimit)}
                  onChange={handleInputChange}
                  className="w-24 text-2xl font-bold bg-transparent text-white focus:outline-none focus:ring-0 p-0"
                />
              )}
            </div>
            {!isInfinite && (
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={autonomousActionLimit}
                onChange={handleLimitChange}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mt-2"
              />
            )}
            <div className="mt-3">
              <label className="flex items-center text-xs text-gray-400 gap-2 cursor-pointer">
                <input type="checkbox" checked={isInfinite} onChange={toggleInfinite} className="form-checkbox h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-600 focus:ring-indigo-500" />
                Enable Unlimited Actions
              </label>
            </div>
            <p className="text-xs text-slate-500 mt-1">Set to -1 for unlimited. Saved automatically.</p>
          </div>
        );
      `
    },
    {
      id: 'autonomous_control_panel',
      name: 'Autonomous Control Panel',
      description: 'Controls and displays logs for the autonomous agent loop.',
      category: 'UI Component',
      version: 5,
      parameters: [
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
        { name: 'handleToggleAutonomousLoop', type: 'string', description: 'Function to start or stop the loop.', required: true },
        { name: 'autonomousLog', type: 'array', description: 'Array of log messages from the agent.', required: true },
        { name: 'handleClearLog', type: 'string', description: 'Function to clear the activity log.', required: true },
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
        { name: 'isTaskLoopRunning', type: 'boolean', description: 'Whether the task loop is running.', required: true },
        { name: 'handleStopTask', type: 'string', description: 'Function to stop the task loop.', required: true },
      ],
      implementationCode: `
        const OperatingMode = { Autonomous: 'AUTONOMOUS', Task: 'TASK' };
        
        const isRunning = isAutonomousLoopRunning;
        const logContainerRef = React.useRef(null);
        
        const isAutonomousMode = operatingMode === OperatingMode.Autonomous;
        const isTaskMode = operatingMode === OperatingMode.Task;

        // Auto-scroll to top when a new log entry is added (since new logs are prepended)
        React.useEffect(() => {
            if (logContainerRef.current) {
                logContainerRef.current.scrollTop = 0;
            }
        }, [autonomousLog]);

        const title = isAutonomousMode ? 'Autonomous Control' : 'Task Execution Log';
        const description = isAutonomousMode ? 'Start the loop to let the agent work on its own.' : 'Agent is working on the submitted task.';

        const getLogClassName = (logText) => {
          if (logText.includes('❌') || logText.includes('⏹️')) return 'text-red-400';
          if (logText.includes('✅')) return 'text-green-400';
          if (logText.includes('🎯') || logText.includes('🚀')) return 'text-yellow-300';
          return 'text-gray-300';
        };

        return (
            <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 mt-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3">
                    <div>
                        <h3 className="text-md font-semibold text-slate-200">{title}</h3>
                        <p className="text-sm text-slate-400">{description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAutonomousMode && (
                            <button
                                onClick={handleToggleAutonomousLoop}
                                className={\`font-bold py-2 px-4 rounded-lg transition-colors flex-shrink-0 w-full sm:w-auto \${
                                    isRunning
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                }\`}
                            >
                                {isRunning ? 'Stop Autonomous Loop' : 'Start Autonomous Loop'}
                            </button>
                        )}
                        {isTaskMode && isTaskLoopRunning && (
                            <button
                                onClick={handleStopTask}
                                className="font-bold py-2 px-4 rounded-lg transition-colors flex-shrink-0 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white"
                            >
                                Stop Task
                            </button>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-700 pt-3">
                     <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold text-slate-300">Activity Log</h4>
                        <button
                            onClick={handleClearLog}
                            className="text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-2 py-1 rounded-md"
                        >
                            Clear Log
                        </button>
                    </div>
                    <div 
                        ref={logContainerRef}
                        className="bg-gray-900/70 p-3 rounded-md h-48 overflow-y-auto font-mono text-xs text-gray-300 border border-gray-700"
                    >
                        {autonomousLog && autonomousLog.length > 0 ? (
                            <div>
                                {autonomousLog.map((log, index) => (
                                    <p key={index} className="whitespace-pre-wrap leading-relaxed animate-fade-in" style={{animation: 'fadein 0.5s'}}>
                                        <span className={getLogClassName(log)}>{log}</span>
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 italic">{isTaskLoopRunning ? "Task is running..." : "Log is empty. Start a process to see output."}</p>
                        )}
                    </div>
                </div>
            </div>
        );
      `
    },
      {
    id: 'action_proposal_panel',
    name: 'Action Proposal Panel',
    description: 'Displays a proposed action from the AI and allows the user to approve or reject it.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'proposedAction', type: 'object', description: 'The action proposed by the AI.', required: true },
      { name: 'handleApproveAction', type: 'string', description: 'Function to execute the proposed action.', required: true },
      { name: 'handleRejectAction', type: 'string', description: 'Function to reject the proposed action.', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing an action.', required: true },
    ],
    implementationCode: `
      if (!proposedAction) return null;

      const { name, arguments: args } = proposedAction;

      return (
        <div className="w-full max-w-2xl mx-auto my-4 p-4 bg-blue-900/40 border-2 border-dashed border-blue-500 rounded-lg shadow-lg">
          <h3 className="text-lg font-bold text-blue-200 mb-2">Agent Suggestion</h3>
          <p className="text-sm text-blue-300 mb-4">The AI wants to perform the following action:</p>

          <div className="bg-gray-900/60 p-3 rounded-md">
            <p className="text-md font-semibold text-white">
              Execute Tool: <span className="font-bold text-teal-300">{name}</span>
            </p>
            <div className="mt-2">
              <p className="text-sm text-gray-400">With arguments:</p>
              <pre className="mt-1 text-xs bg-gray-800 p-2 rounded whitespace-pre-wrap text-gray-200">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-4 mt-4">
             <button
                onClick={handleRejectAction}
                disabled={isLoading}
                className="bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                Reject
              </button>
              <button
                onClick={handleApproveAction}
                disabled={isLoading}
                className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-800 disabled:cursor-wait"
              >
                {isLoading ? 'Executing...' : 'Approve'}
              </button>
          </div>
        </div>
      );
    `
  },
];
