
import type { LLMTool } from '../../types';

export const agentViewTools: LLMTool[] = [
    {
    id: 'local_ai_server_panel',
    name: 'Local AI Server Panel',
    description: 'A control panel for managing a local, persistent, multimodal AI server (Gemma). Allows starting, stopping, and testing the server.',
    category: 'UI Component',
    version: 5,
    parameters: [
      { name: 'isServerConnected', type: 'boolean', description: 'Whether the main Node.js backend is connected.', required: true },
      { name: 'localAiStatus', type: 'object', description: 'An object containing the status of the local AI server ({ isRunning, logs }).', required: true },
      { name: 'handleInstallGemmaServerScript', type: 'object', description: 'Function to install the Python server script.', required: true },
      { name: 'logEvent', type: 'object', description: 'Function to log events to the main debug log.', required: true },
    ],
    implementationCode: `
      const [isRecording, setIsRecording] = React.useState(false);
      const [isProcessing, setIsProcessing] = React.useState(false);
      const [recordedAudioBlob, setRecordedAudioBlob] = React.useState(null);
      const [testResult, setTestResult] = React.useState('');
      const [isInstalling, setIsInstalling] = React.useState(false);
      const mediaRecorderRef = React.useRef(null);
      const audioChunksRef = React.useRef([]);
      const logsContainerRef = React.useRef(null);

      React.useEffect(() => {
        if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
      }, [localAiStatus.logs]);

      const handleServerAction = async (action) => {
        if (!isServerConnected) {
          logEvent('[ERROR] Node.js server is not connected.');
          return;
        }
        logEvent(\`[INFO] Attempting to \${action} local AI server...\`);
        try {
          const response = await fetch(\`http://localhost:3001/api/local-ai/\${action}\`, { method: 'POST' });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          logEvent(\`[SUCCESS] \${result.message}\`);
        } catch (e) {
          logEvent(\`[ERROR] Failed to \${action} server: \${e.message}\`);
        }
      };
      
      const handleInstallClick = async () => {
          setIsInstalling(true);
          await handleInstallGemmaServerScript();
          setIsInstalling(false);
      }

      const handleStartRecording = async () => {
        setTestResult('');
        setRecordedAudioBlob(null);
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            const mimeType = 'audio/webm'; // Use webm for broad browser support. The server can handle it.
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              logEvent(\`[ERROR] Audio recording failed: MimeType \${mimeType} is not supported.\`);
              return;
            }
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
            
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };
            
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                setRecordedAudioBlob(blob);
                
                // Correctly stop the stream tracks to release the microphone
                if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
                    mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                }
                
                setIsRecording(false); // Update UI state after blob is created
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            logEvent(\`[ERROR] Audio recording failed: \${err.message}\`);
        }
      };

      const handleStopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          // Do not set isRecording to false here. The 'onstop' event handler will do it.
        }
      };

      const handleAudioTest = async () => {
        if (!recordedAudioBlob) {
            logEvent('[ERROR] No audio recorded to test.');
            return;
        }
        setIsProcessing(true);
        setTestResult('');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(recordedAudioBlob);
            reader.onloadend = async () => {
                const base64Audio = reader.result;
                const body = {
                    model: 'local/gemma-multimodal',
                    messages: [
                        { role: 'user', content: [
                            { type: 'text', text: 'Transcribe this audio.' },
                            { type: 'audio_url', audio_url: { url: base64Audio } }
                        ]}
                    ]
                };
                const response = await fetch('http://localhost:8008/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || 'Test request failed');
                const transcription = result.choices[0]?.message?.content || 'No transcription found.';
                setTestResult(transcription);
                logEvent('[SUCCESS] Local AI server test completed.');
            };
        } catch (e) {
            const errorMsg = \`Local AI server test failed: \${e.message}. Is it running on port 8008?\`;
            logEvent(\`[ERROR] \${errorMsg}\`);
            setTestResult(errorMsg);
        } finally {
            setIsProcessing(false);
        }
      };

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-indigo-300">Local AI Server</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={\`w-3 h-3 rounded-full \${localAiStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}\`}></div>
              <p className="text-sm text-gray-300">
                Status: {localAiStatus.isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button onClick={handleInstallClick} disabled={!isServerConnected || isInstalling} className="flex-1 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                {isInstalling ? 'Installing...' : 'Install/Update Script'}
            </button>
            <button onClick={() => handleServerAction('start')} disabled={!isServerConnected || localAiStatus.isRunning} className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Start Server</button>
            <button onClick={() => handleServerAction('stop')} disabled={!isServerConnected || !localAiStatus.isRunning} className="flex-1 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed">Stop Server</button>
          </div>

          <div>
              <h4 className="font-semibold text-gray-300 text-sm mb-1">Server Logs</h4>
              <div ref={logsContainerRef} className="h-24 bg-black/30 p-2 rounded text-xs font-mono overflow-y-auto scroll-smooth">
                  {localAiStatus.logs && localAiStatus.logs.length > 0 ? localAiStatus.logs.map((log, index) => (
                      <div key={index} className="text-slate-400 break-words">{log}</div>
                  )) : <p className="text-slate-500">No logs yet. Start the server to see output.</p>}
              </div>
          </div>

          <div>
              <h4 className="font-semibold text-gray-300 text-sm mb-2">Multimodal Test</h4>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button onClick={isRecording ? handleStopRecording : handleStartRecording} disabled={!localAiStatus.isRunning || isProcessing} className={\`px-4 py-2 font-bold text-white rounded-lg flex items-center gap-2 transition-all duration-200 disabled:opacity-50 \${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-cyan-600 hover:bg-cyan-700'}\`}>
                    {isRecording ? 'Stop Recording' : 'Record Audio'}
                  </button>
                  <button onClick={handleAudioTest} disabled={!recordedAudioBlob || isProcessing || isRecording} className="px-4 py-2 font-bold text-white rounded-lg flex items-center gap-2 transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                    {isProcessing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : '🧪'}
                    {isProcessing ? 'Testing...' : 'Test Audio'}
                  </button>
              </div>
              {recordedAudioBlob && !isRecording && (
                <div className="mt-2 text-center">
                  <audio controls src={URL.createObjectURL(recordedAudioBlob)} className="w-full h-10" />
                </div>
              )}
              {testResult && (
                  <div className="mt-2">
                    <h5 className="font-semibold text-gray-400 text-xs">Test Result:</h5>
                    <pre className="mt-1 text-sm text-cyan-200 bg-black/30 p-2 rounded-md whitespace-pre-wrap">{testResult}</pre>
                  </div>
              )}
          </div>

        </div>
      );
    `
  },
  {
      id: 'manual_robot_control',
      name: 'Manual Robot Control',
      description: "Provides UI buttons for direct manual control of the lead robot ('agent-1'), and for creating new skills from observed actions.",
      category: 'UI Component',
      version: 3,
      parameters: [
        { name: 'handleManualControl', type: 'object', description: 'Function to call for a manual action.', required: true },
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
      version: 3,
      parameters: [
        { name: 'agentSwarm', type: 'array', description: 'The array of agent workers.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Whether the swarm is running.', required: true },
        { name: 'handleStopSwarm', type: 'object', description: 'Function to stop the swarm task.', required: true },
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
