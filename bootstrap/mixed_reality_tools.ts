// bootstrap/mixed_reality_tools.ts
import type { ToolCreatorPayload } from '../types';

const MIXED_REALITY_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Capture Screen Region',
        description: 'Captures a specified region of the primary screen and returns it as a base64 encoded JPEG image.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To provide a "virtual camera" for an agent to perceive the state of a GUI, game, or any other visual application running on the server.',
        parameters: [
            { name: 'x', type: 'number', description: 'The x-coordinate of the top-left corner of the capture region.', required: true },
            { name: 'y', type: 'number', description: 'The y-coordinate of the top-left corner of the capture region.', required: true },
            { name: 'width', type: 'number', description: 'The width of the capture region.', required: true },
            { name: 'height', type: 'number', description: 'The height of the capture region.', required: true },
        ],
        implementationCode: 'kicad_service_proxy::capture_screen_region',
    }
];

const VIRTUAL_CAMERA_CONFIGURATOR_PAYLOAD: ToolCreatorPayload = {
    name: 'Virtual Camera Configurator',
    description: 'A UI panel to configure and test the screen capture region for mixed reality simulation.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly interface for defining the "virtual camera" viewport that the agent uses to perceive the game world.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
        { name: 'region', type: 'object', description: 'The current capture region {x, y, width, height}.', required: true },
        { name: 'setRegion', type: 'object', description: 'Function to update the capture region.', required: true },
        { name: 'isStreaming', type: 'boolean', description: 'Whether the feed is currently streaming.', required: true },
        { name: 'setIsStreaming', type: 'object', description: 'Function to toggle streaming.', required: true },
    ],
    implementationCode: `
      const [previewImage, setPreviewImage] = React.useState(null);
      const [isTesting, setIsTesting] = React.useState(false);

      const handleRegionChange = (e) => {
        const { name, value } = e.target;
        setRegion(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
      };

      const handleTestCapture = async () => {
        setIsTesting(true);
        setPreviewImage(null);
        try {
          const result = await runtime.tools.run('Capture Screen Region', region);
          if (result && result.image_base64) {
            setPreviewImage('data:image/jpeg;base64,' + result.image_base64);
          }
        } catch (e) {
          console.error("Test capture failed:", e);
          alert("Test capture failed. Is the server running and are the coordinates valid?");
        } finally {
          setIsTesting(false);
        }
      };

      const InputField = ({ name, value }) => (
        <div className="flex items-center">
          <label htmlFor={name} className="w-12 font-mono text-sm text-gray-400">{name.toUpperCase()}:</label>
          <input
            type="number"
            id={name}
            name={name}
            value={value}
            onChange={handleRegionChange}
            className="w-full bg-gray-900 border border-gray-600 rounded-md p-1.5 text-sm"
          />
        </div>
      );

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col h-full">
            <h3 className="text-lg font-bold text-indigo-300 mb-2">Virtual Camera</h3>
            <div className="grid grid-cols-2 gap-2">
              <InputField name="x" value={region.x} />
              <InputField name="y" value={region.y} />
              <InputField name="width" value={region.width} />
              <InputField name="height" value={region.height} />
            </div>
            <div className="flex gap-2 my-2">
                <button onClick={handleTestCapture} disabled={isTesting} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-3 rounded-lg text-sm disabled:bg-gray-600">
                    {isTesting ? 'Testing...' : 'Test Capture'}
                </button>
                <button onClick={() => setIsStreaming(!isStreaming)} className={"flex-1 font-semibold py-2 px-3 rounded-lg text-sm " + (isStreaming ? "bg-red-600 hover:bg-red-500 text-white" : "bg-green-600 hover:bg-green-500 text-white")}>
                    {isStreaming ? 'Stop Stream' : 'Start Stream'}
                </button>
            </div>
            <div className="flex-grow bg-black/30 rounded-lg flex items-center justify-center p-1">
                {previewImage ? (
                    <img src={previewImage} alt="Capture Preview" className="max-w-full max-h-full object-contain rounded" />
                ) : (
                    <p className="text-gray-500 text-xs italic">Preview Area</p>
                )}
            </div>
        </div>
      );
    `
};

const MIXED_REALITY_FEED_PAYLOAD: ToolCreatorPayload = {
    name: 'Mixed Reality Feed',
    description: 'Displays the video feed from the virtual camera by repeatedly capturing the screen.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the agent with a real-time visual perception of the game or application it is controlling.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
        { name: 'region', type: 'object', description: 'The screen region to capture.', required: true },
        { name: 'isStreaming', type: 'boolean', description: 'Flag to control the streaming loop.', required: true },
    ],
    implementationCode: `
        const [frame, setFrame] = React.useState(null);
        const [error, setError] = React.useState(null);
        const animationFrameId = React.useRef(null);
        const isMounted = React.useRef(true);

        React.useEffect(() => {
          isMounted.current = true;
          return () => { isMounted.current = false; };
        }, []);

        React.useEffect(() => {
            const fetchFrame = async () => {
                if (!isStreaming || !isMounted.current) {
                    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                    return;
                }
                
                try {
                    const result = await runtime.tools.run('Capture Screen Region', region);
                    if (isMounted.current && result && result.image_base64) {
                        setFrame('data:image/jpeg;base64,' + result.image_base64);
                        setError(null);
                    }
                } catch (e) {
                     if (isMounted.current) {
                        setError('Failed to capture frame. Check server connection and coordinates.');
                     }
                     console.error("Frame capture failed:", e);
                }
                
                if (isMounted.current) {
                    animationFrameId.current = requestAnimationFrame(fetchFrame);
                }
            };
            
            if (isStreaming) {
                fetchFrame();
            } else {
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                setFrame(null);
                setError(null);
            }

            return () => {
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            };
        }, [isStreaming, region, runtime]);

        return (
            <div className="w-full h-full bg-black/50 border border-indigo-700/60 rounded-xl flex items-center justify-center relative">
                {frame ? (
                    <img src={frame} alt="Mixed Reality Feed" className="max-w-full max-h-full object-contain" />
                ) : (
                    <div className="text-center">
                        <p className="text-indigo-300 font-semibold">{isStreaming ? 'Connecting...' : 'Stream Paused'}</p>
                        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                    </div>
                )}
            </div>
        );
    `
};

const MIXED_REALITY_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Mixed Reality Suite',
    description: 'A one-time setup action that installs all necessary tools for screen capture and mixed reality simulation.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's ability to perceive and interact with external applications via screen capture and virtual input.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Mixed Reality Suite...');
        const toolPayloads = [
             ...${JSON.stringify(MIXED_REALITY_TOOL_DEFINITIONS)},
             ${JSON.stringify(VIRTUAL_CAMERA_CONFIGURATOR_PAYLOAD)},
             ${JSON.stringify(MIXED_REALITY_FEED_PAYLOAD)},
        ];
        
        const allTools = runtime.tools.list();
        const existingToolNames = new Set(allTools.map(t => t.name));

        for (const payload of toolPayloads) {
            if (existingToolNames.has(payload.name)) {
                runtime.logEvent(\`[INFO] Tool '\${payload.name}' already exists. Skipping.\`);
                continue;
            }
            try {
                await runtime.tools.run('Tool Creator', payload);
            } catch (e) {
                runtime.logEvent(\`[WARN] Failed to create new tool '\${payload.name}'. Error: \${e.message}\`);
            }
        }
        
        return { success: true, message: 'Mixed Reality Suite and all associated tools installed successfully.' };
    `
};

export const MIXED_REALITY_TOOLS: ToolCreatorPayload[] = [
    MIXED_REALITY_INSTALLER_TOOL,
];