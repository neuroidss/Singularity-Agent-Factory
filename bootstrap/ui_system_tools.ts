// bootstrap/ui_system_tools.ts
import type { ToolCreatorPayload } from '../types';

const SYSTEM_STATE_MANAGER_PAYLOAD: ToolCreatorPayload = {
    name: 'System State Manager',
    description: 'A UI panel for exporting and importing the entire application state, including all learned tools and player progress.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a robust mechanism for users to back up, restore, and share their agent\'s progress and created tools.',
    parameters: [
        { name: 'tools', type: 'array', description: 'The current array of all LLMTools.', required: true },
        { name: 'setTools', type: 'object', description: 'Function to overwrite the current toolset.', required: true },
        { name: 'playerState', type: 'object', description: 'The current state of the player.', required: false },
        { name: 'setPlayerState', type: 'object', description: 'Function to overwrite the player state.', required: true },
        { name: 'savePlayerState', type: 'object', description: 'Function to persist the player state after import.', required: true },
    ],
    implementationCode: `
            const handleExport = () => {
                const stateToSave = {
                    tools: tools,
                    playerState: playerState,
                };
                const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'singularity_agent_state_' + new Date().toISOString().slice(0,10) + '.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };

            const handleImport = (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const text = e.target.result;
                        const importedState = JSON.parse(text);
                        if (Array.isArray(importedState.tools) && (importedState.playerState === null || typeof importedState.playerState === 'object')) {
                            if (window.confirm('This will overwrite ALL current tools and player data. This cannot be undone. Are you sure?')) {
                                setTools(importedState.tools);
                                setPlayerState(importedState.playerState);
                                if (importedState.playerState) {
                                    savePlayerState(importedState.playerState);
                                }
                                alert('State imported successfully!');
                            }
                        } else {
                            throw new Error('Invalid state file format. Must contain "tools" (array) and "playerState" (object or null).');
                        }
                    } catch (err) {
                        alert('Error importing state: ' + err.message);
                    }
                    event.target.value = null;
                };
                reader.readAsText(file);
            };
            
            return (
                <div className="bg-gray-900/50 p-3 rounded-lg h-full flex flex-col justify-center">
                    <p className="text-xs text-gray-400 mb-2">Export your agent's learned tools and player progress, or import a saved state.</p>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExport}
                            className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                            Export State
                        </button>
                        <label 
                            className="flex-1 text-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                        >
                            Import State
                            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                        </label>
                    </div>
                </div>
            );
        `
};

const MCP_TERMINAL_PAYLOAD: ToolCreatorPayload = {
    name: 'MCP Terminal',
    description: 'A UI panel for monitoring and managing backend server processes controlled by the Master Control Program (MCP).',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a terminal-like interface for viewing the status, logs, and metadata of all managed server processes, enabling real-time debugging and monitoring of the backend.',
    parameters: [
      { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
      { name: 'isServerConnected', type: 'boolean', description: 'Flag for server connection status.', required: true },
    ],
    implementationCode: `
      const [processes, setProcesses] = React.useState([]);
      const [selectedProcessId, setSelectedProcessId] = React.useState(null);
      const [isLoading, setIsLoading] = React.useState(false);
      const logContainerRef = React.useRef(null);

      const fetchProcesses = React.useCallback(async () => {
        if (!isServerConnected) {
          setProcesses([]);
          return;
        }
        try {
          if (runtime && runtime.tools && runtime.tools.run) {
            const result = await runtime.tools.run('List Managed Processes');
            const sortedProcesses = (result.processes || []).sort((a, b) => a.processId.localeCompare(b.processId));
            setProcesses(sortedProcesses);
          }
        } catch (e) {
          console.error("Failed to fetch processes:", e);
          setProcesses([]);
        }
      }, [isServerConnected, runtime]);

      React.useEffect(() => {
        fetchProcesses();
        const interval = setInterval(fetchProcesses, 3000);
        return () => clearInterval(interval);
      }, [fetchProcesses]);

      React.useEffect(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, [processes, selectedProcessId]);

      const handleStopProcess = async (processId) => {
        if (!processId) return;
        if (!confirm(\`Are you sure you want to stop process '\${processId}'?\`)) return;
        try {
          await runtime.tools.run('Stop Process', { processId });
          // The poller will update the state, no need to manually fetch here.
        } catch (e) {
          alert('Failed to stop process: ' + e.message);
        }
      };
      
      const selectedProcess = processes.find(p => p.processId === selectedProcessId);

      React.useEffect(() => {
        if (!selectedProcessId && processes.length > 0) {
            setSelectedProcessId(processes[0].processId);
        } else if (selectedProcessId && !processes.some(p => p.processId === selectedProcessId)) {
            setSelectedProcessId(processes.length > 0 ? processes[0].processId : null);
        }
      }, [processes, selectedProcessId]);

      if (!isServerConnected) {
        return (
          <div className="bg-gray-900/50 p-3 rounded-lg h-full flex items-center justify-center">
            <p className="text-yellow-400 text-center">Server not connected. MCP Terminal is unavailable.</p>
          </div>
        );
      }
      
      return (
        <div className="flex flex-col h-full text-sm">
          <div className="flex-grow flex gap-2 min-h-0">
            <div className="w-2/5 flex flex-col gap-1 pr-1 overflow-y-auto">
              {isLoading && processes.length === 0 && <p className="text-xs text-gray-500 text-center italic py-4">Loading processes...</p>}
              {processes.map(p => (
                <div key={p.processId} onClick={() => setSelectedProcessId(p.processId)} className={"p-2 rounded-lg cursor-pointer transition-colors " + (selectedProcessId === p.processId ? 'bg-indigo-700' : 'bg-gray-900/50 hover:bg-indigo-900/30')}>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold truncate">{p.processId}</span>
                    <span className={"w-3 h-3 rounded-full " + (p.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500')}></span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">PID: {p.pid || 'N/A'} | Port: {p.port || 'N/A'}</div>
                </div>
              ))}
              {!isLoading && processes.length === 0 && (
                  <div className="text-xs text-gray-500 text-center italic py-4">
                    <p>No managed processes running.</p>
                  </div>
              )}
            </div>
            <div className="w-3/5 flex flex-col bg-black/30 rounded-lg p-2">
              {processes.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center text-gray-500 px-4">
                      <p>No managed processes are running. <br/> Start a service (e.g., from the 'World Model Manager') to view its logs here.</p>
                  </div>
              ) : selectedProcess ? (
                <>
                  <div className="flex justify-between items-center mb-1 flex-shrink-0">
                    <h4 className="font-bold text-cyan-300 truncate">{selectedProcess.processId}</h4>
                    <button onClick={() => handleStopProcess(selectedProcess.processId)} disabled={!selectedProcess.isRunning} className="bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 text-xs rounded disabled:bg-gray-600 disabled:cursor-not-allowed">Stop</button>
                  </div>
                  <div ref={logContainerRef} className="flex-grow font-mono text-xs text-gray-300 overflow-y-auto whitespace-pre-wrap break-all border-t border-gray-700 pt-1 mt-1">
                    {(selectedProcess.logs || []).join('\\n')}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">Select a process to view logs</div>
              )}
            </div>
          </div>
        </div>
      );`
};

const SYSTEM_MANAGEMENT_PANEL_PAYLOAD: ToolCreatorPayload = {
    name: 'System Management Panel',
    description: 'A UI panel that groups system-level tools like the State Manager and MCP Terminal.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To organize system management UIs into a single, convenient location.',
    parameters: [
        { name: 'tools', type: 'array', description: 'Current tools for state manager.', required: true },
        { name: 'setTools', type: 'object', description: 'Function to set tools.', required: true },
        { name: 'playerState', type: 'object', description: 'Current player state.', required: false },
        { name: 'setPlayerState', type: 'object', description: 'Function to set player state.', required: true },
        { name: 'savePlayerState', type: 'object', description: 'Function to persist player state.', required: true },
        { name: 'runtime', type: 'object', description: 'Agent runtime for MCP terminal.', required: true },
        { name: 'isServerConnected', type: 'boolean', description: 'Flag for server connection status.', required: true },
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
    ],
    implementationCode: `
        const [activeTab, setActiveTab] = React.useState('processes');

        const stateManagerProps = { tools, setTools, playerState, setPlayerState, savePlayerState };
        const mcpTerminalProps = { runtime, isServerConnected };

        return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl flex flex-col h-full">
                <div className="flex-shrink-0 border-b border-gray-700 p-2">
                    <h3 className="text-lg font-bold text-indigo-300">System Management</h3>
                </div>
                <div className="flex-shrink-0 border-b border-gray-700">
                    <nav className="flex space-x-2 p-2" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('processes')}
                            className={"px-3 py-1.5 text-sm font-medium rounded-md " + (activeTab === 'processes' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700')}
                        >
                            Processes
                        </button>
                        <button
                            onClick={() => setActiveTab('state')}
                            className={"px-3 py-1.5 text-sm font-medium rounded-md " + (activeTab === 'state' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700')}
                        >
                            State
                        </button>
                    </nav>
                </div>
                <div className="flex-grow p-2 min-h-0">
                    {activeTab === 'state' && <UIToolRunner tool={getTool('System State Manager')} props={stateManagerProps} />}
                    {activeTab === 'processes' && <UIToolRunner tool={getTool('MCP Terminal')} props={mcpTerminalProps} />}
                </div>
            </div>
        );
    `
};


export const UI_SYSTEM_TOOLS: ToolCreatorPayload[] = [
    // The individual tools must exist for getTool() to find them
    SYSTEM_STATE_MANAGER_PAYLOAD,
    MCP_TERMINAL_PAYLOAD,
    // This is the main tool that should be rendered in the UI
    SYSTEM_MANAGEMENT_PANEL_PAYLOAD,
];
