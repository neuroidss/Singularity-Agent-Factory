
import type { LLMTool } from '../../types';

export const displayTools: LLMTool[] = [
  {
    id: 'user_input_form',
    name: 'User Input Form',
    description: 'Renders the main textarea for user input and the submit button.',
    category: 'UI Component',
    version: 8,
    parameters: [
        {name: 'userInput', type: 'string', description: 'Current value of the input', required: true},
        {name: 'setUserInput', type: 'object', description: 'Function to update the input value', required: true},
        {name: 'handleSubmit', type: 'object', description: 'Function to call on submit', required: true},
        {name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
    ],
    implementationCode: `
      const Spinner = () => (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
      
      const isDisabled = isSwarmRunning;
      const buttonText = isSwarmRunning ? 'Swarm is Active...' : 'Start Swarm Task';
      let placeholderText = "Describe a high-level goal for the agent swarm...";
      if(isSwarmRunning) placeholderText = "Swarm task is running...";

      return (
        <div className="w-full bg-gray-800/60 border border-gray-700 rounded-xl p-4">
            <h3 className="text-lg font-bold text-indigo-300 mb-2">Mission Control</h3>
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
                {isSwarmRunning ? <Spinner /> : null}
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
    version: 3,
    parameters: [
      { name: 'logs', type: 'array', description: 'The array of log messages.', required: true },
      { name: 'onReset', type: 'object', description: 'Function to reset all tools and progress.', required: true },
      { name: 'apiCallCount', type: 'number', description: 'The number of API calls made.', required: true },
    ],
    implementationCode: `// This component is implemented natively in DebugLogView.tsx`,
  },
  {
    id: 'tool_list_display',
    name: 'Tool List Display',
    description: 'Renders the grid of all available tools and shows server connection status.',
    category: 'UI Component',
    version: 8,
    parameters: [
      { name: 'tools', type: 'array', description: 'Array of all available tools (client and server)', required: true },
      { name: 'isServerConnected', type: 'boolean', description: 'Whether the backend server is connected', required: true },
    ],
    implementationCode: `
      const [showDetailsId, setShowDetailsId] = React.useState(null);

      const sortedTools = React.useMemo(() => {
        return [...tools].sort((a, b) => {
          const aIsServer = a.category === 'Server';
          const bIsServer = b.category === 'Server';
          if (aIsServer && !bIsServer) return -1;
          if (!aIsServer && bIsServer) return 1;
          return a.name.localeCompare(b.name);
        });
      }, [tools]);

      const ServerStatus = () => {
          const statusStyle = isServerConnected
            ? "bg-green-900/50 text-green-300"
            : "bg-yellow-900/50 text-yellow-300";
          const dotStyle = isServerConnected ? "bg-green-500" : "bg-yellow-500";
          const text = isServerConnected ? "Server Connected" : "Server Offline";
          return (
             <div className={\`flex-shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold \${statusStyle}\`}>
                <div className={\`w-2 h-2 rounded-full \${dotStyle} \${isServerConnected ? 'animate-pulse' : ''}\`}></div>
                {text}
            </div>
          );
      }

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 h-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-indigo-300">Tool Library ({tools.length})</h3>
              <ServerStatus />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
                {sortedTools.map(tool => {
                    const isServerTool = tool.category === 'Server';
                    return (
                      <div key={tool.id + '-' + tool.version} className="bg-gray-900/70 border border-gray-700 rounded-lg p-3 flex flex-col text-sm h-full">
                          <div className="flex justify-between items-start">
                              <h4 className="font-bold text-white truncate pr-2">{tool.name}</h4>
                              <span className={\`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full \${isServerTool ? 'bg-sky-800 text-sky-300' : 'bg-gray-700 text-gray-300'}\`}>
                                  {isServerTool ? 'Server' : 'Client'}
                              </span>
                          </div>
                          <p className="text-xs text-indigo-400 mt-1">{tool.category}</p>
                          <p className="text-gray-300 text-xs flex-grow my-2">{tool.description}</p>
                          {tool.purpose && <p className="text-xs text-yellow-300 bg-yellow-900/30 p-1 rounded italic">Purpose: {tool.purpose}</p>}
                          
                          <div className="mt-2 pt-2 border-t border-gray-700/50">
                              <button
                                  onClick={() => setShowDetailsId(showDetailsId === tool.id ? null : tool.id)}
                                  className="text-left text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                              >
                                  {showDetailsId === tool.id ? '[-] Hide Details' : '[+] Show Details'}
                              </button>
                              {showDetailsId === tool.id && (
                                  <pre className="mt-2 text-xs text-cyan-200 bg-black p-2 rounded-md font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                                      {isServerTool ? '# Server-side command:\\n' + tool.implementationCode : tool.implementationCode}
                                  </pre>
                              )}
                          </div>
                      </div>
                    )
                })}
            </div>
        </div>
      );
    `
  },
];
