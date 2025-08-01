
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
];