
import type { LLMTool } from '../../types';

export const agentViewTools: LLMTool[] = [
    {
    id: 'audio_testbed',
    name: 'Audio Testbed',
    description: 'A UI component for recording audio and sending it to the server for processing with an AI-created tool.',
    category: 'UI Component',
    version: 6,
    parameters: [
      { name: 'isRecording', type: 'boolean', description: 'Whether audio is currently being recorded.', required: true },
      { name: 'isProcessingAudio', type: 'boolean', description: 'Whether the server is currently processing audio.', required: true },
      { name: 'audioResult', type: 'string', description: 'The transcription or result from the audio processing.', required: false },
      { name: 'recordedAudioUrl', type: 'string', description: 'The local URL of the recorded audio for playback.', required: false },
      { name: 'handleStartRecording', type: 'object', description: 'Function to call to start recording.', required: true },
      { name: 'handleStopRecording', type: 'object', description: 'Function to call to stop recording.', required: true },
      { name: 'handleAudioUpload', type: 'object', description: 'Function to call to upload audio to the server.', required: true },
      { name: 'isServerConnected', type: 'boolean', description: 'Whether the backend server is connected.', required: true },
      { name: 'allTools', type: 'array', description: 'A list of all available tools to check for existence.', required: true },
      { name: 'handleCreateGemmaTool', type: 'object', description: 'Function to create the Gemma audio processor tool.', required: true },
      { name: 'recordingMimeType', type: 'string', description: 'The currently selected audio MIME type for recording.', required: true },
      { name: 'setRecordingMimeType', type: 'object', description: 'Function to update the selected MIME type.', required: true },
      { name: 'recordingBitrate', type: 'number', description: 'The current recording bitrate.', required: true },
      { name: 'setRecordingBitrate', type: 'object', description: 'Function to update the recording bitrate.', required: true },
      { name: 'supportedMimeTypes', type: 'array', description: 'List of MIME types supported by the browser.', required: true },
      { name: 'recordingTime', type: 'number', description: 'The current duration of the recording in seconds.', required: true },
      { name: 'analyserNode', type: 'object', description: 'The Web Audio API AnalyserNode for visualization.', required: false },
    ],
    implementationCode: `
      const [isCreatingTool, setIsCreatingTool] = React.useState(false);
      const canvasRef = React.useRef(null);

      const gemmaToolExists = allTools.some(t => t.name === "Gemma Audio Processor");
      const canRecord = isServerConnected && gemmaToolExists && supportedMimeTypes.length > 0;
      
      let statusText = "Ready to record";
      if (!isServerConnected) statusText = "Server is offline";
      else if (!gemmaToolExists) statusText = "Audio processor tool not found";
      else if (isRecording) statusText = "Recording in progress...";
      else if (isProcessingAudio) statusText = "Processing on server...";
      else if (audioResult) statusText = "Processing complete!";
      else if (recordedAudioUrl) statusText = "Ready for playback or upload";

      const timer = React.useMemo(() => {
        const minutes = Math.floor(recordingTime / 60).toString().padStart(2, '0');
        const seconds = (recordingTime % 60).toString().padStart(2, '0');
        return \`\${minutes}:\${seconds}\`;
      }, [recordingTime]);

      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resizeObserver = new ResizeObserver(() => {
            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        });
        resizeObserver.observe(canvas);
        return () => resizeObserver.disconnect();
      }, []);

      React.useEffect(() => {
        if (!analyserNode || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        
        analyserNode.fftSize = 256;
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let animationFrameId;

        const draw = () => {
            animationFrameId = requestAnimationFrame(draw);
            analyserNode.getByteFrequencyData(dataArray);
            
            canvasCtx.fillStyle = 'rgba(30, 41, 59, 1)'; // bg-gray-800
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 1.5;
            let x = 0;
            
            for(let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                const hue = i * 2.5;
                canvasCtx.fillStyle = 'hsl(' + hue + ', 80%, 60%)';
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 2;
            }
        };
        draw();
        
        return () => {
            cancelAnimationFrame(animationFrameId);
             if (canvasCtx) {
                canvasCtx.fillStyle = 'rgba(30, 41, 59, 1)';
                canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            }
        };
      }, [analyserNode]);

      const handleCreateClick = async () => {
        setIsCreatingTool(true);
        try {
          await handleCreateGemmaTool();
        } finally {
          setIsCreatingTool(false);
        }
      };
      
      const renderContent = () => {
        if (isServerConnected && !gemmaToolExists) {
            return (
                <div className="text-center p-4">
                    <p className="text-sm text-yellow-300 mb-4">The 'Gemma Audio Processor' tool is missing on the server.</p>
                    <button
                        onClick={handleCreateClick}
                        disabled={isCreatingTool}
                        className="w-full bg-purple-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-700 disabled:bg-purple-900/50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                         {isCreatingTool && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
                        {isCreatingTool ? 'Creating Tool...' : 'Auto-Create Audio Tool'}
                    </button>
                </div>
            )
        }
        
        return (
          <>
            <div className="text-center text-4xl font-bold text-gray-200 my-3 tracking-widest">{timer}</div>
            <div className="text-center text-indigo-300 font-semibold h-6 mb-4">{statusText}</div>

            <div className="flex items-center justify-center gap-3 flex-wrap my-4">
                 <button onClick={isRecording ? handleStopRecording : handleStartRecording} disabled={!canRecord || isProcessingAudio} className={\`px-6 py-3 font-bold text-white rounded-full flex items-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed \${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}\`}>
                    <div className={\`w-3 h-3 rounded-full \${isRecording ? 'bg-white' : 'bg-red-300'}\`}></div>
                    {isRecording ? 'Stop' : 'Record'}
                 </button>
                 <button onClick={handleAudioUpload} disabled={!recordedAudioUrl || isProcessingAudio || isRecording} className="px-6 py-3 font-bold text-white rounded-full flex items-center gap-2 transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isProcessingAudio ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : '🚀'}
                    {isProcessingAudio ? 'Processing...' : 'Send to Server'}
                 </button>
            </div>
            
            {recordedAudioUrl && !isProcessingAudio && !isRecording && (
              <div className="mt-4 p-3 bg-black/20 rounded-lg border border-gray-600">
                <audio controls src={recordedAudioUrl} className="w-full h-10">
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {audioResult && (
              <div className="mt-4">
                <h4 className="font-semibold text-gray-300">Server Response:</h4>
                <pre className="mt-1 text-sm text-cyan-200 bg-black/30 p-3 rounded-md whitespace-pre-wrap">{audioResult}</pre>
              </div>
            )}

            <div className="mt-6 p-3 bg-black/20 rounded-lg border border-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="mime-type-select" className="block text-xs font-medium text-gray-300 mb-1">Recording Format</label>
                    <select id="mime-type-select" value={recordingMimeType} onChange={(e) => setRecordingMimeType(e.target.value)} disabled={isRecording || isProcessingAudio} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
                        {supportedMimeTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                    </select>
                </div>
                <div>
                    <label htmlFor="bitrate-input" className="block text-xs font-medium text-gray-300 mb-1">Bitrate (bits/sec)</label>
                    <input type="number" id="bitrate-input" step="8000" value={recordingBitrate} onChange={(e) => setRecordingBitrate(Number(e.target.value))} disabled={isRecording || isProcessingAudio || recordingMimeType.includes('wav')} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-xs focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" title={recordingMimeType.includes('wav') ? 'Bitrate does not apply to uncompressed WAV format' : ''} />
                </div>
            </div>
          </>
        )
      }

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <div className="text-center mb-3">
              <h3 className="text-lg font-bold text-indigo-300">Audio Testbed</h3>
              <p className="text-xs text-gray-400">Record audio, see it visualized, and send it for transcription.</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 my-2 h-24 w-full">
            <canvas ref={canvasRef} className="w-full h-full"></canvas>
          </div>
          {renderContent()}
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
