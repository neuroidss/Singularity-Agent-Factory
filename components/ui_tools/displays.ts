

import type { LLMTool } from '../../types';

export const displayTools: LLMTool[] = [
  {
    id: 'user_input_form',
    name: 'User Input Form',
    description: 'Renders the main textarea for user input and the submit button.',
    category: 'UI Component',
    version: 6,
    parameters: [
        {name: 'userInput', type: 'string', description: 'Current value of the input', required: true},
        {name: 'setUserInput', type: 'string', description: 'Function to update the input value', required: true},
        {name: 'handleSubmit', type: 'string', description: 'Function to call on submit', required: true},
        {name: 'isLoading', type: 'boolean', description: 'Whether the app is processing', required: true},
        { name: 'proposedAction', type: 'object', description: 'Any pending action requires user approval.', required: false },
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
        { name: 'isTaskLoopRunning', type: 'boolean', description: 'Whether the task loop is running.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
        { name: 'operatingMode', type: 'string', description: 'The current operating mode.', required: true },
    ],
    implementationCode: `
      const Spinner = () => (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
      
      const OperatingMode = { Command: 'COMMAND', Assist: 'ASSIST', Task: 'TASK', Autonomous: 'AUTONOMOUS', Swarm: 'SWARM' };
      const isDisabled = isLoading || !!proposedAction || isAutonomousLoopRunning || isSwarmRunning || isTaskLoopRunning;
      
      let buttonText = 'Submit';
      if (isLoading) {
          buttonText = 'Processing...';
      } else if (operatingMode === OperatingMode.Task) {
          buttonText = 'Start Task';
      } else if (operatingMode === OperatingMode.Swarm) {
          buttonText = 'Start Swarm Task';
      }
      
      let placeholderText = "Describe a task, create a tool, or change the UI...";
      if(isAutonomousLoopRunning) placeholderText = "Autonomous loop is active...";
      if(isSwarmRunning) placeholderText = "Swarm task is running...";
      if(isTaskLoopRunning) placeholderText = "Task is in progress...";
      if(!!proposedAction) placeholderText = "Waiting for user action on suggestion...";

      return (
        <div className="w-full max-w-2xl mx-auto bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <div className="relative w-full group">
                <textarea
                    id="userInput"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder={placeholderText}
                    className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-200 resize-y disabled:cursor-not-allowed"
                    disabled={isDisabled}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!isDisabled) handleSubmit();
                        }
                    }}
                />
            </div>
            <button
                onClick={handleSubmit}
                disabled={isDisabled || !userInput.trim()}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200"
            >
                {isLoading ? <Spinner /> : null}
                {buttonText}
            </button>
        </div>
      );
    `
  },
  {
    id: 'debug_log_view',
    name: 'Debug Log View',
    description: 'A floating panel that shows a running log of events, API call counts, and system reset functionality.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'logs', type: 'array', description: 'The array of log messages.', required: true },
      { name: 'onReset', type: 'string', description: 'Function to reset all tools and progress.', required: true },
      { name: 'apiCallCount', type: 'number', description: 'The number of API calls made.', required: true },
      { name: 'apiCallLimit', type: 'number', description: 'The daily limit of API calls.', required: true },
    ],
    implementationCode: `// This component is implemented natively in DebugLogView.tsx`,
  },
    {
    id: 'learned_heuristics_display',
    name: 'Learned Heuristics Display',
    description: 'Displays strategic heuristics the agent has learned from reviewing past performance.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'learnedHeuristics', type: 'array', description: 'Array of learned heuristic strings.', required: true },
    ],
    implementationCode: `
      if (!learnedHeuristics || learnedHeuristics.length === 0) {
        return null;
      }
      return (
        <div className="w-full max-w-4xl mx-auto mt-6">
          <div className="bg-sky-900/50 border border-sky-700 rounded-lg p-4">
            <h3 className="text-lg font-bold text-sky-300 mb-2">Learned Heuristics</h3>
            <ul className="list-disc list-inside space-y-2 text-sky-200 text-sm">
              {learnedHeuristics.map((heuristic, index) => (
                <li key={index}>{heuristic}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    `,
  },
  {
    id: 'game_tapes_viewer',
    name: 'Game Tapes Viewer',
    description: 'Displays a history of all completed tasks (episodes). You can review the step-by-step log for each and ask the AI to learn from them.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'episodes', type: 'array', description: 'Array of all past episodes.', required: true },
      { name: 'runtime', type: 'object', description: 'The runtime API to call tools.', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
    ],
    implementationCode: `
      const [expandedId, setExpandedId] = React.useState(null);

      const handleLearn = async () => {
          try {
              await runtime.tools.run('Strategic Reviewer', {});
          } catch(e) {
              console.error("Failed to run Strategic Reviewer", e);
              // Error is logged by the main loop, so no need for a UI alert here.
          }
      };

      const getStatusClass = (status) => {
          if (status === 'Completed') return 'text-green-400';
          if (status === 'Failed') return 'text-red-400';
          return 'text-yellow-400';
      };

      if (!episodes || episodes.length === 0) {
          return (
            <div className="w-full max-w-4xl mx-auto mt-6 text-center text-gray-500">
                <p>No episodes recorded yet. Complete a task to see it here.</p>
            </div>
          );
      }

      return (
          <div className="w-full max-w-4xl mx-auto mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-300">Game Tapes ({episodes.length})</h2>
                <button 
                  onClick={handleLearn}
                  disabled={isLoading}
                  className="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors disabled:bg-purple-900 disabled:cursor-not-allowed"
                >
                  Learn from History
                </button>
              </div>
              <div className="space-y-2">
                  {[...episodes].reverse().map(episode => (
                      <div key={episode.id} className="bg-gray-800/80 border border-gray-700 rounded-lg">
                          <button onClick={() => setExpandedId(expandedId === episode.id ? null : episode.id)} className="w-full p-3 text-left flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-white">Episode #{episode.id.slice(-4)}: <span className={getStatusClass(episode.status)}>{episode.status}</span></p>
                                <p className="text-xs text-gray-400">Goal: {episode.goal} ({episode.actions.length} actions)</p>
                              </div>
                              <span className={\`transform transition-transform \${expandedId === episode.id ? 'rotate-180' : ''}\`}>▼</span>
                          </button>
                          {expandedId === episode.id && (
                              <div className="p-3 border-t border-gray-700">
                                  <ul className="space-y-1 text-xs font-mono">
                                      {episode.actions.map((action, index) => (
                                          <li key={index} className="p-1 rounded bg-gray-900/50">
                                              <span className="text-cyan-400">Step {index + 1}: {action.toolCall?.name || 'No Tool'}</span>
                                              {action.executionError ? (
                                                  <p className="text-red-400">Error: {action.executionError}</p>
                                              ) : (
                                                  <p className="text-gray-300 truncate">Result: {JSON.stringify(action.executionResult)}</p>
                                              )}
                                          </li>
                                      ))}
                                  </ul>
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      );
    `
  },
  {
    id: 'tool_list_display',
    name: 'Tool List Display',
    description: 'Renders the grid of all available tools.',
    category: 'UI Component',
    version: 5,
    parameters: [
      { name: 'tools', type: 'string', description: 'Array of all available tools', required: true },
      { name: 'UIToolRunner', type: 'string', description: 'The UI tool runner component itself, for recursion', required: true },
    ],
    implementationCode: `
      const sanitizeForFunctionName = (name) => {
        return name.replace(/[^a-zA-Z0-9_]/g, '_');
      };
      
      return (
        <div className="w-full max-w-7xl mx-auto mt-8">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-300">Available Tools ({tools.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tools.map(tool => (
              <UIToolRunner key={tool.id + '-' + tool.version} tool={{
                  id: 'tool_card',
                  name: 'Tool Card',
                  category: 'UI Component',
                  version: 3,
                  parameters: [],
                  implementationCode: \`
                    const [showDetails, setShowDetails] = React.useState(false);
                    const sanitizedName = sanitizeForFunctionName(tool.name);

                    const generateExampleParams = (tool) => {
                      if (!tool.parameters || tool.parameters.length === 0) return '{}';
                      const example = {};
                      tool.parameters.forEach(p => {
                          if (p.type === 'string') example[p.name] = 'some ' + p.name;
                          if (p.type === 'number') example[p.name] = 123;
                          if (p.type === 'boolean') example[p.name] = true;
                          if (p.type === 'array') example[p.name] = [];
                          if (p.type === 'object') example[p.name] = {};
                      });
                      return JSON.stringify(example, null, 2);
                    };

                    const Tooltip = ({ text, children }) => {
                        const [visible, setVisible] = React.useState(false);
                        return (
                            <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
                                {children}
                                {visible && (
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max bg-gray-900 text-white text-xs rounded py-1 px-2 z-10 shadow-lg border border-gray-600">
                                        {text}
                                    </div>
                                )}
                            </div>
                        )
                    };
                    
                    return (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-2 text-sm h-full">
                        <div className="flex justify-between items-start">
                            <h3 className="font-bold text-white truncate pr-2">{tool.name}</h3>
                            <span className="flex-shrink-0 bg-gray-700 text-gray-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                                v{tool.version}
                            </span>
                        </div>
                        <div>
                          <p className="text-xs text-indigo-400">{tool.category}</p>
                        </div>
                        <p className="text-gray-300 text-xs flex-grow min-h-[30px]">{tool.description}</p>
                        
                        <div className="mt-auto pt-2 border-t border-gray-700/50">
                          <div className="flex justify-between items-center">
                            <button
                              onClick={() => setShowDetails(!showDetails)}
                              className="text-left text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                            >
                              {showDetails ? '[-] Hide Details' : '[+] Show Details'}
                            </button>
                            {tool.updatedAt && (
                                <Tooltip text={'Last Updated: ' + new Date(tool.updatedAt).toLocaleString()}>
                                    <p className="text-xs text-gray-500">
                                        {new Date(tool.updatedAt).toLocaleDateString()}
                                    </p>
                                </Tooltip>
                            )}
                          </div>

                          {showDetails && (
                            <div className="mt-2 space-y-2">
                               <div>
                                <p className="text-xs text-gray-400 mb-1">ID:</p>
                                <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded-md font-mono whitespace-pre-wrap">
                                    {sanitizedName}
                                </pre>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1">Code:</p>
                                <pre className="text-xs text-cyan-200 bg-gray-900 p-2 rounded-md font-mono whitespace-pre-wrap">
                                  {tool.implementationCode}
                                </pre>
                              </div>
                              {tool.createdAt && <p className="text-xs text-gray-500">Created: {new Date(tool.createdAt).toLocaleString()}</p>}
                              {tool.category !== 'UI Component' && (
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">Direct Usage:</p>
                                  <pre className="text-xs text-teal-200 bg-gray-900 p-2 rounded-md font-mono whitespace-pre-wrap">
                                    {'run "' + tool.name + '" with ' + generateExampleParams(tool)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  \`
              }} props={{ tool, sanitizeForFunctionName }} />
            ))}
          </div>
        </div>
      );
    `
  },
  {
    id: 'action_proposal_panel',
    name: 'Action Proposal Panel',
    description: 'Displays a proposed action from the AI for the user to approve or reject.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'proposedAction', type: 'object', description: 'The proposed tool call from the AI.', required: true },
      { name: 'handleApproveAction', type: 'string', description: 'Function to execute the proposed action.', required: true },
      { name: 'handleRejectAction', type: 'string', description: 'Function to reject the proposed action.', required: true },
      { name: 'isLoading', type: 'boolean', description: 'Whether the app is currently processing.', required: true },
    ],
    implementationCode: `
        const { name, arguments: args } = proposedAction;

        return (
          <div className="w-full max-w-2xl mx-auto mt-6 p-4 bg-blue-900/50 border-2 border-dashed border-blue-500 rounded-lg shadow-lg">
            <h3 className="text-lg font-bold text-blue-200 mb-2">Agent Suggestion</h3>
            <div className="bg-gray-900/70 p-3 rounded-md">
                <p className="text-sm text-gray-300">The agent wants to call the following tool:</p>
                <p className="font-mono text-md text-cyan-300 mt-1">{name}</p>
                <p className="text-sm text-gray-300 mt-2">With these arguments:</p>
                <pre className="text-xs text-gray-200 bg-black/50 p-2 rounded mt-1 whitespace-pre-wrap">
                    {JSON.stringify(args, null, 2)}
                </pre>
            </div>
            <div className="flex justify-end gap-3 mt-4">
                <button
                    onClick={handleRejectAction}
                    disabled={isLoading}
                    className="bg-red-600/80 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 disabled:bg-red-900/50"
                >
                    Reject
                </button>
                <button
                    onClick={handleApproveAction}
                    disabled={isLoading}
                    className="bg-green-600/80 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-900/50"
                >
                    Approve
                </button>
            </div>
          </div>
        );
    `
  },
];
