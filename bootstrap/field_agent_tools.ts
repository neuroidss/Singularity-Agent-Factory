// bootstrap/field_agent_tools.ts
import type { ToolCreatorPayload } from '../types';

const FIELD_AGENT_TERMINAL_PAYLOAD: ToolCreatorPayload = {
    name: 'Field Agent Terminal',
    description: 'A comprehensive UI for the "Field Agent" mode, displaying camera feeds, sensor data, and AI-generated directives for the human operator.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the human operator with a clear interface for receiving instructions and relaying sensory data back to the controlling agent.',
    parameters: [
      { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
    ],
    implementationCode: `
      const [stream, setStream] = React.useState(null);
      const [sensorData, setSensorData] = React.useState({ accel: {x:0,y:0,z:0}, gyro: {alpha:0,beta:0,gamma:0} });
      const [lastInstruction, setLastInstruction] = React.useState('Awaiting mission start...');
      const [isProcessing, setIsProcessing] = React.useState(false);
      const [isSessionActive, setSessionActive] = React.useState(false);
      const [cameras, setCameras] = React.useState([]);
      const [selectedCameraId, setSelectedCameraId] = React.useState('');
      
      const videoRef = React.useRef(null);
      const canvasRef = React.useRef(null);
      const loopRef = React.useRef(null);

      const handleDeviceMotion = (event) => {
        setSensorData(prev => ({ ...prev, accel: event.accelerationIncludingGravity }));
      };

      const handleDeviceOrientation = (event) => {
        setSensorData(prev => ({ ...prev, gyro: { alpha: event.alpha, beta: event.beta, gamma: event.gamma } }));
      };
      
      const startSession = async () => {
        try {
            // Request permissions for motion sensors
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                await DeviceOrientationEvent.requestPermission();
            }
            window.addEventListener('devicemotion', handleDeviceMotion);
            window.addEventListener('deviceorientation', handleDeviceOrientation);

            // Get camera stream
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setCameras(videoDevices);
            const initialCameraId = videoDevices.length > 0 ? videoDevices[0].deviceId : '';
            setSelectedCameraId(initialCameraId);
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { deviceId: initialCameraId ? { exact: initialCameraId } : undefined } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStream(stream);
            setSessionActive(true);
            setLastInstruction('Session started. Stand by for directives.');
        } catch (err) {
            console.error("Error starting session:", err);
            setLastInstruction('Error: Could not access camera or sensors. Check permissions.');
        }
      };

      const stopSession = () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        window.removeEventListener('devicemotion', handleDeviceMotion);
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
        if (loopRef.current) {
          clearInterval(loopRef.current);
          loopRef.current = null;
        }
        setStream(null);
        setSessionActive(false);
        setIsProcessing(false);
        setLastInstruction('Session ended.');
      };
      
      React.useEffect(() => {
        return () => stopSession(); // Cleanup on component unmount
      }, []);
      
      React.useEffect(() => {
        const switchCamera = async () => {
             if (stream) { stream.getTracks().forEach(track => track.stop()); }
             const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: selectedCameraId } } });
             if (videoRef.current) { videoRef.current.srcObject = newStream; }
             setStream(newStream);
        };
        if(selectedCameraId && isSessionActive) switchCamera();
      }, [selectedCameraId]);

      React.useEffect(() => {
        if (isSessionActive && !loopRef.current) {
          loopRef.current = setInterval(async () => {
            if (isProcessing || !videoRef.current) return;
            setIsProcessing(true);
            
            try {
              const canvas = canvasRef.current;
              const video = videoRef.current;
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvas.getContext('2d').drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
              const imageData = canvas.toDataURL('image/jpeg', 0.7);
              
              const result = await runtime.tools.run('Analyze Field Data', {
                imageData,
                sensorData: sensorData
              });
              
              setLastInstruction(result.instruction || 'No new instruction received.');

            } catch (e) {
              console.error("Analysis loop error:", e);
              setLastInstruction(\`Error: \${e.message}\`);
            } finally {
              setIsProcessing(false);
            }
          }, 5000); // Send data every 5 seconds
        } else if (!isSessionActive && loopRef.current) {
          clearInterval(loopRef.current);
          loopRef.current = null;
        }
      }, [isSessionActive, isProcessing, sensorData, runtime]);
      
      const SensorDisplay = ({ label, data }) => (
        <div className="bg-gray-900/50 p-2 rounded-lg">
          <h4 className="text-sm font-semibold text-cyan-300 mb-1">{label}</h4>
          <div className="font-mono text-xs text-gray-300 grid grid-cols-3 gap-1">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="truncate"><span className="text-gray-500">{key}:</span> {Number(value).toFixed(2)}</div>
            ))}
          </div>
        </div>
      );

      return (
        <div className="h-full w-full grid grid-cols-3 gap-4">
            <div className="col-span-2 h-full flex flex-col gap-2">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full bg-black rounded-lg object-cover"></video>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <div className="col-span-1 h-full flex flex-col gap-3">
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col">
                    <h3 className="text-lg font-bold text-indigo-300 mb-2">Field Agent Controls</h3>
                    {isSessionActive ? (
                        <button onClick={stopSession} className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-2 rounded-lg">End Session</button>
                    ) : (
                        <button onClick={startSession} className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2 rounded-lg">Start Session</button>
                    )}
                     <select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} disabled={!isSessionActive} className="w-full mt-2 bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm">
                        {cameras.map(cam => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || \`Camera \${cam.deviceId.substring(0,6)}\`}</option>)}
                     </select>
                </div>
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col flex-grow">
                    <h3 className="text-lg font-bold text-indigo-300 mb-2">Mission Directives</h3>
                    <div className="flex-grow bg-black/30 p-2 rounded-lg text-indigo-200">
                        {isProcessing && <div className="text-sm text-yellow-400 animate-pulse">Analyzing...</div>}
                        <p>{lastInstruction}</p>
                    </div>
                </div>
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col">
                     <h3 className="text-lg font-bold text-indigo-300 mb-2">Telemetry</h3>
                     <div className="space-y-2">
                        <SensorDisplay label="Accelerometer" data={sensorData.accel} />
                        <SensorDisplay label="Gyroscope" data={sensorData.gyro} />
                     </div>
                </div>
            </div>
        </div>
      );
    `
};

const FIELD_AGENT_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Analyze Field Data',
        description: 'Analyzes a sensory packet from a human field agent (image + sensor data) and returns the next instruction.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To act as the AI core for the Field Agent mode, allowing the agent to perceive the real world and direct its human avatar.',
        parameters: [
            { name: 'imageData', type: 'string', description: 'Base64 encoded JPEG image from the field agent\'s camera.', required: true },
            { name: 'sensorData', type: 'object', description: 'JSON object containing accelerometer and gyroscope data.', required: true },
        ],
        implementationCode: `
            const systemPrompt = "You are a mission controller for a human field agent. You receive an image and sensor data. Your task is to analyze the scene and provide a clear, concise, and actionable instruction for the human to continue their mission. Be direct and imperative. Example: 'Turn left 45 degrees.' or 'Proceed forward 5 meters towards the building.'";
            
            const { imageData, sensorData } = args;
            const userPrompt = \`Current sensor readings:\\n\${JSON.stringify(sensorData, null, 2)}\\n\\nAnalyze the attached image and provide the next directive.\`;
            
            const imagePart = {
              type: 'image/jpeg',
              data: imageData.split(',')[1],
            };
            
            // The runtime.ai.generateText method is assumed to handle multimodal input if the provider supports it.
            const instruction = await runtime.ai.generateText(userPrompt, systemPrompt, [imagePart]);
            
            return { success: true, instruction: instruction || "Hold position and continue scanning." };
        `
    },
];

const FIELD_AGENT_INSTALLER: ToolCreatorPayload = {
    name: 'Install Field Agent Suite',
    description: 'Installs all tools required for the "Field Agent" mode, where the user acts as a physical avatar for the AI.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's capability to perceive and interact with the physical world through a human operator.",
    parameters: [],
    implementationCode: `
        const toolPayloads = [
            ...${JSON.stringify(FIELD_AGENT_TOOL_DEFINITIONS)},
            ${JSON.stringify(FIELD_AGENT_TERMINAL_PAYLOAD)},
        ];
        const existing = new Set(runtime.tools.list().map(t => t.name));
        for (const payload of toolPayloads) {
            if (existing.has(payload.name)) continue;
            try { await runtime.tools.run('Tool Creator', payload); }
            catch (e) { runtime.logEvent(\`[WARN] Failed to create '\${payload.name}': \${e.message}\`); }
        }
        return { success: true, message: 'Field Agent Suite installed successfully.' };
    `
};

export const FIELD_AGENT_TOOLS: ToolCreatorPayload[] = [
    FIELD_AGENT_INSTALLER,
];
