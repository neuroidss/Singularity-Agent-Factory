import type { LLMTool } from '../../types';

export const displayTools: LLMTool[] = [
  {
    id: 'user_input_form',
    name: 'User Input Form',
    description: 'Renders the main textarea for user input and the submit button.',
    category: 'UI Component',
    version: 5,
    parameters: [
        {name: 'userInput', type: 'string', description: 'Current value of the input', required: true},
        {name: 'setUserInput', type: 'string', description: 'Function to update the input value', required: true},
        {name: 'handleSubmit', type: 'string', description: 'Function to call on submit', required: true},
        {name: 'isLoading', type: 'boolean', description: 'Whether the app is processing', required: true},
        { name: 'proposedAction', type: 'object', description: 'Any pending action requires user approval.', required: false },
        { name: 'isAutonomousLoopRunning', type: 'boolean', description: 'Whether the autonomous loop is running.', required: true },
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
      const isDisabled = isLoading || !!proposedAction || isAutonomousLoopRunning || isSwarmRunning;
      
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
    id: 'status_messages_display',
    name: 'Status Messages Display',
    description: 'Renders error or info messages to the user.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'error', type: 'string', description: 'Error message text', required: false },
      { name: 'info', type: 'string', description: 'Info message text', required: false },
    ],
    implementationCode: `
      return (
        <>
          {error && <p className="mt-4 text-center text-red-400 bg-red-900/30 p-3 rounded-lg w-full max-w-3xl mx-auto">{error}</p>}
          {info && !error && <p className="mt-4 text-center text-cyan-300 bg-cyan-900/30 p-3 rounded-lg w-full max-w-3xl mx-auto">{info}</p>}
        </>
      );
    `
  },
  {
    id: 'debug_panel_toggle_switch',
    name: 'Debug Panel Toggle Switch',
    description: 'Renders the toggle switch for showing/hiding the debug panel.',
    category: 'UI Component',
    version: 1,
    parameters: [
      { name: 'showDebug', type: 'boolean', description: 'Current state of the debug panel visibility', required: true },
      { name: 'setShowDebug', type: 'string', description: 'Function to toggle the debug panel', required: true },
    ],
    implementationCode: `
      return (
        <div className="w-full max-w-3xl mx-auto mt-4 text-right">
            <label htmlFor="debugToggle" className="inline-flex items-center gap-3 cursor-pointer text-sm text-yellow-400">
                <span className="font-medium">Show Debug Panel</span>
                <div className="relative">
                    <input
                        type="checkbox"
                        id="debugToggle"
                        className="sr-only peer"
                        checked={showDebug}
                        onChange={() => setShowDebug(!showDebug)}
                    />
                    <div className="block bg-gray-600 w-10 h-6 rounded-full peer-checked:bg-yellow-400 transition"></div>
                    <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition peer-checked:translate-x-full"></div>
                </div>
            </label>
        </div>
      );
    `
  },
   {
    id: 'execution_result_panel',
    name: 'Execution Result Panel',
    description: 'Renders the result of a tool execution.',
    category: 'UI Component',
    version: 7,
    parameters: [
      { name: 'response', type: 'string', description: 'The enriched AI response object', required: true },
    ],
    implementationCode: `
      if (!response) return null;
      const { tool, toolCall, executionResult, executionError } = response;

      const title = toolCall ? \`Execution: \${tool?.name || toolCall.name}\` : 'Execution Result';

      if (!toolCall) {
        // Don't render anything if there was no tool call attempt.
        return null;
      }

      return (
          <div className="w-full max-w-3xl mx-auto mt-6">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-bold text-gray-200">{title}</h3>
                  {tool && <p className="text-xs text-gray-400 mb-2">Tool: <span className="font-semibold text-indigo-400">{tool.name} (v{tool.version})</span></p>}
                  
                  <div className="mt-3 pt-3 border-t border-gray-600">
                      {typeof executionError !== 'undefined' ? (
                          <>
                            <p className="text-red-400 text-sm mb-1 font-semibold">Execution Error:</p>
                            <div className="bg-red-900/50 p-2 rounded-lg text-red-300 whitespace-pre-wrap font-mono text-xs">{executionError}</div>
                          </>
                      ) : (
                          <>
                          <p className="text-gray-400 text-sm mb-1">Result:</p>
                          <div className="bg-gray-900 p-2 rounded-lg text-white whitespace-pre-wrap text-xs">{JSON.stringify(executionResult, null, 2)}</div>
                          </>
                      )}
                  </div>
                </div>
          </div>
      );
    `
  },
  {
    id: 'debug_information_panel',
    name: 'Debug Information Panel',
    description: 'Renders the debug panel with detailed AI interaction logs.',
    category: 'UI Component',
    version: 12,
    parameters: [
      { name: 'debugInfo', type: 'string', description: 'The debug info object', required: false },
    ],
    implementationCode: `
      const Spinner = () => (
        <svg className="animate-spin h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    
      const CollapsibleSection = ({ title, number, children, isPending, defaultOpen = false }) => {
        const [isOpen, setIsOpen] = React.useState(defaultOpen);
        const Icon = isOpen ? '▼' : '►';
        
        React.useEffect(() => {
            setIsOpen(defaultOpen);
        }, [defaultOpen]);
        
        return (
          <div className="border border-yellow-300/20 rounded-lg">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="w-full flex items-center gap-3 p-3 text-left bg-yellow-400/10 hover:bg-yellow-400/20"
            >
              <span className="text-yellow-400">{Icon}</span>
              <span className="bg-yellow-400/20 text-yellow-200 rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold">{number}</span>
              <h4 className="text-lg font-semibold text-yellow-300 flex-grow">{title}</h4>
              {isPending && <Spinner />}
            </button>
            {isOpen && (
              <div className="p-4 border-t border-yellow-300/20">
                {children}
              </div>
            )}
          </div>
        );
      };
      
      const ValueDisplay = ({ content, title }) => (
        <div>
          {title && <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>}
          <pre className="bg-gray-900/70 border border-gray-700 text-sm text-gray-300 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
              <code>{content}</code>
          </pre>
        </div>
      );

      const ErrorDisplay = ({ error, title }) => (
        <div>
            {title && <p className="text-red-300 text-sm font-medium mb-1">{title}</p>}
            <div className="bg-red-900/50 p-3 rounded-lg text-red-200 whitespace-pre-wrap font-mono text-sm">
                {error}
            </div>
        </div>
      );

      if (!debugInfo) {
          return (
             <div className="w-full max-w-7xl mx-auto mt-6 bg-gray-800/60 border-2 border-dashed border-yellow-600/50 rounded-xl p-6">
                <h3 className="text-2xl font-bold text-center mb-6 text-yellow-400">Agent Debug View</h3>
                <p className="text-yellow-300 text-center">No debug information available. Submit a request to see the details here.</p>
             </div>
          )
      }

      const { userInput, modelId, temperature, toolRetrievalStrategy, toolSelectionCall, agentExecutionCall } = debugInfo;
      const ToolRetrievalStrategy = { Direct: 'DIRECT', LLM: 'LLM', Embedding: 'EMBEDDING' };

      const renderToolSelectionContent = () => {
        if (!toolSelectionCall) return <p className="text-yellow-400/80">Pending...</p>;
        
        switch (toolSelectionCall.strategy) {
          case ToolRetrievalStrategy.Direct:
            return <ValueDisplay title="Strategy: Direct" content="All tools were provided directly to the agent. No filtering was performed." />;
          
          case ToolRetrievalStrategy.Embedding:
             return (
                <div className="space-y-4">
                  <ValueDisplay title="Strategy: Embedding (Keyword Search)" content="Tools were filtered by matching keywords from the user prompt against tool names and descriptions." />
                  <ValueDisplay title="Selected Tool Names:" content={JSON.stringify(toolSelectionCall.selectedToolNames, null, 2)} />
                  {toolSelectionCall.error && <ErrorDisplay title="Retrieval Error" error={toolSelectionCall.error} />}
                </div>
              );

          case ToolRetrievalStrategy.LLM:
          default:
            return (
              <div className="space-y-4">
                  <details className="bg-gray-900/40 rounded-lg" open>
                      <summary className="cursor-pointer p-2 font-semibold text-gray-300">Inputs to Retriever</summary>
                      <div className="p-4 border-t border-gray-700 space-y-4">
                          <ValueDisplay title="System Instruction:" content={toolSelectionCall.systemInstruction || 'N/A'} />
                          <ValueDisplay title="All Available Tools:" content={JSON.stringify(toolSelectionCall.availableTools, null, 2)} />
                      </div>
                  </details>
                  <details className="bg-gray-900/40 rounded-lg" open>
                      <summary className="cursor-pointer p-2 font-semibold text-gray-300">Outputs & Result</summary>
                      <div className="p-4 border-t border-gray-700 space-y-4">
                           <ValueDisplay title="Raw Response from AI:" content={toolSelectionCall.rawResponse || 'N/A'} />
                           <ValueDisplay title="Selected Tool Names:" content={JSON.stringify(toolSelectionCall.selectedToolNames, null, 2)} />
                      </div>
                  </details>
                  {toolSelectionCall.error && <ErrorDisplay title="Retrieval Error" error={toolSelectionCall.error} />}
              </div>
            );
        }
      };

      return (
        <div className="w-full max-w-7xl mx-auto mt-6 bg-gray-800/60 border-2 border-dashed border-yellow-600/50 rounded-xl p-6">
            <h3 className="text-2xl font-bold text-center mb-6 text-yellow-400">Agent Debug View</h3>
            <div className="space-y-4">
                <div className="space-y-2">
                    <ValueDisplay title="User Input:" content={userInput} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <ValueDisplay title="Model:" content={modelId} />
                        <ValueDisplay title="Temperature:" content={temperature} />
                        <ValueDisplay title="Retrieval Strategy:" content={toolRetrievalStrategy} />
                    </div>
                </div>

                <CollapsibleSection number="1" title="Tool Retrieval" isPending={!toolSelectionCall?.selectedToolNames && !toolSelectionCall?.error} defaultOpen={true}>
                    {renderToolSelectionContent()}
                </CollapsibleSection>
                
                <CollapsibleSection number="2" title="Agent Execution" isPending={toolSelectionCall && !agentExecutionCall} defaultOpen={!!toolSelectionCall}>
                    {agentExecutionCall ? (
                        <div className="space-y-4">
                            <details className="bg-gray-900/40 rounded-lg" open>
                                <summary className="cursor-pointer p-2 font-semibold text-gray-300">Inputs to Agent</summary>
                                <div className="p-4 border-t border-gray-700 space-y-4">
                                    <ValueDisplay title="System Instruction:" content={agentExecutionCall.systemInstruction} />
                                    <ValueDisplay title="Relevant Tools Provided:" content={JSON.stringify(agentExecutionCall.toolsProvided.map(t => ({ name: t.name, description: t.description })), null, 2)} />
                                </div>
                            </details>
                            <details className="bg-gray-900/40 rounded-lg" open>
                                <summary className="cursor-pointer p-2 font-semibold text-gray-300">Outputs & Result</summary>
                                <div className="p-4 border-t border-gray-700 space-y-4">
                                   <ValueDisplay title="Raw Response from AI:" content={agentExecutionCall.rawResponse} />
                                   <ValueDisplay title="Processed Result (Final App State):" content={JSON.stringify(agentExecutionCall.processedResponse, null, 2)} />
                                </div>
                            </details>
                            {agentExecutionCall.error && (
                                <ErrorDisplay title="Execution Error" error={agentExecutionCall.error} />
                            )}
                        </div>
                    ) : ( <p className="text-yellow-400/80">{toolSelectionCall ? 'Pending...' : 'Waiting for Tool Retrieval to complete.'}</p> )}
                </CollapsibleSection>
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
];