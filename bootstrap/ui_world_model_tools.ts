// bootstrap/ui_world_model_tools.ts
import type { ToolCreatorPayload } from '../types';

const WORLD_MODEL_MANAGER_PAYLOAD: ToolCreatorPayload = {
    name: 'World Model Manager',
    description: 'A UI panel for defining, configuring, and activating different world models, such as a live game simulation or a real-world field agent.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a central hub for managing the source of reality the agent perceives and acts upon.',
    parameters: [
        { name: 'activeModelId', type: 'string', description: 'The ID of the currently active world model.', required: true },
        { name: 'onActivateModel', type: 'object', description: 'Callback to activate a specific world model.', required: true },
        { name: 'isActivating', type: 'boolean', description: 'Flag to indicate a model is currently being activated.', required: true },
    ],
    implementationCode: `
        const worldModels = [
            {
                id: 'live_game_sim',
                name: 'Live Game Simulation',
                description: 'Uses screen capture as a virtual camera and a virtual gamepad for control.',
            },
            {
                id: 'field_agent_physical',
                name: 'Field Agent (Physical)',
                description: 'Uses a smartphone camera and sensors to model the real world.',
            },
            {
                id: 'gazebo_px4_sim',
                name: 'Gazebo + PX4 Simulation',
                description: 'Connects to a Gazebo simulation for drone/rover control via PX4.',
            }
        ];

        return (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col h-full">
                <h3 className="text-lg font-bold text-indigo-300 mb-2">World Model Manager</h3>
                <div className="space-y-2">
                    {worldModels.map(model => {
                        const isActive = model.id === activeModelId;
                        const isThisOneActivating = isActivating && activeModelId === model.id;
                        return (
                            <button 
                                key={model.id} 
                                onClick={() => onActivateModel(model.id)}
                                disabled={isActive || isActivating}
                                className={"w-full text-left p-2 rounded-lg border transition-colors " + (
                                    isActive 
                                        ? "bg-indigo-900/50 border-indigo-600 cursor-default" 
                                        : "bg-gray-900/50 border-gray-700 hover:bg-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-white">{model.name}</span>
                                    {isActive && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-600 text-white">
                                            Active
                                        </span>
                                    )}
                                    {isThisOneActivating && (
                                        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{model.description}</p>
                            </button>
                        )
                    })}
                </div>
            </div>
        );
    `
};

const ATTENTIVE_MODELING_ENVIRONMENT_PAYLOAD: ToolCreatorPayload = {
    name: 'Attentive Modeling Environment',
    description: 'The main UI for the Attentive Modeling view, orchestrating the World Model Manager and the context-specific simulation tools.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a unified interface for mixed-reality simulation, agent training, and world model management.',
    parameters: [
      { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
      { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
      { name: 'isSwarmRunning', type: 'boolean', description: 'Flag indicating if the main agent swarm is busy.', required: true },
      { name: 'startSwarmTask', type: 'object', description: 'Function to start a new swarm task.', required: true },
    ],
    implementationCode: `
      const [activeModelId, setActiveModelId] = React.useState(null);
      const activeProcessIdRef = React.useRef(null);
      const [isActivating, setIsActivating] = React.useState(false);

      const modelToServiceMap = React.useMemo(() => ({
          'gazebo_px4_sim': { processId: 'gazebo_service', scriptPath: 'gazebo_service.py' },
      }), []);

      const handleActivateModel = React.useCallback(async (newModelId) => {
        if (isActivating || newModelId === activeModelId) return;

        setIsActivating(true);
        setActiveModelId(newModelId); // Optimistically set the new model ID for UI feedback
        
        const oldModelId = activeProcessIdRef.current ? Object.keys(modelToServiceMap).find(key => modelToServiceMap[key].processId === activeProcessIdRef.current) : null;
        const oldService = oldModelId ? modelToServiceMap[oldModelId] : null;
        const newService = newModelId ? modelToServiceMap[newModelId] : null;
        
        // Deactivate the old service if it's different from the new one
        if (oldService && oldService.processId !== newService?.processId && activeProcessIdRef.current) {
            try {
                runtime.logEvent(\`[MCP] Deactivating previous service: \${activeProcessIdRef.current}\`);
                await runtime.tools.run('Stop Process', { processId: activeProcessIdRef.current });
                activeProcessIdRef.current = null;
            } catch (e) {
                runtime.logEvent(\`[MCP] Warn: could not stop previous service '\${activeProcessIdRef.current}': \${e.message}\`);
            }
        }
        
        // Activate the new service if there is one
        if (newService && newService.processId !== activeProcessIdRef.current) {
            try {
                runtime.logEvent(\`[MCP] Activating service '\${newService.processId}' for model '\${newModelId}'...\`);
                await runtime.tools.run('Start Python Process', { processId: newService.processId, scriptPath: newService.scriptPath });
                activeProcessIdRef.current = newService.processId;
            } catch (e) {
                runtime.logEvent(\`[MCP] FATAL ERROR: Failed to activate service '\${newService.processId}': \${e.message}\`);
                activeProcessIdRef.current = null;
                setActiveModelId(null); // Set UI back to neutral state on failure
                setIsActivating(false);
                return;
            }
        } else if (!newService) {
            activeProcessIdRef.current = null;
        }

        setIsActivating(false);
      }, [activeModelId, isActivating, runtime, modelToServiceMap]);

      const droneCockpitProps = { getTool, runtime, isSwarmRunning, startSwarmTask };
      const worldModelManagerProps = { activeModelId, onActivateModel: handleActivateModel, isActivating };

      const renderActiveModelUI = () => {
        switch(activeModelId) {
          case 'gazebo_px4_sim':
            return <UIToolRunner tool={getTool('Drone Command Cockpit')} props={droneCockpitProps} />;
          case 'live_game_sim':
          case 'field_agent_physical':
             return <div className="text-center text-gray-500 p-8">This World Model UI has not been implemented yet.</div>;
          default:
            return (
                 <div className="flex items-center justify-center h-full text-center text-gray-500 p-8">
                    <p>Select a World Model to begin simulation.</p>
                </div>
            );
        }
      };

      return (
        <div className="h-full w-full grid grid-cols-12 gap-4">
          <div className="col-span-3 h-full min-h-0">
             <UIToolRunner tool={getTool('World Model Manager')} props={worldModelManagerProps} />
          </div>
          <div className="col-span-9 h-full min-h-0">
            {renderActiveModelUI()}
          </div>
        </div>
      );
    `
};

const WORLD_MODEL_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    {
        name: 'Define World Model',
        description: 'Defines a new world model for the agent to perceive and interact with, specifying its type and configuration.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To allow the agent to programmatically configure its own sensory and actuation context.',
        parameters: [
            { name: 'model_name', type: 'string', description: 'A unique name for this world model instance.', required: true },
            { name: 'model_type', type: 'string', description: 'The type of world model (e.g., "game_capture", "gazebo", "physical_drone").', required: true },
            { name: 'configuration', type: 'object', description: 'A JSON string containing the specific configuration for this model type.', required: true },
        ],
        implementationCode: `
            console.log(\`[SIM] World model '\${args.model_name}' of type '\${args.model_type}' has been defined.\`);
            return { success: true, message: \`World model '\${args.model_name}' defined.\` };
        `
    },
];

const ATTENTIVE_MODELING_INSTALLER: ToolCreatorPayload = {
    name: 'Install Attentive Modeling Suite',
    description: 'Installs the complete suite for managing and interacting with World Models.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's core capability to manage different realities.",
    parameters: [],
    implementationCode: `
        const toolPayloads = [
            ...${JSON.stringify(WORLD_MODEL_TOOL_DEFINITIONS)},
            ${JSON.stringify(WORLD_MODEL_MANAGER_PAYLOAD)},
            ${JSON.stringify(ATTENTIVE_MODELING_ENVIRONMENT_PAYLOAD)},
        ];
        const existing = new Set(runtime.tools.list().map(t => t.name));
        for (const payload of toolPayloads) {
            if (existing.has(payload.name)) continue;
            try { await runtime.tools.run('Tool Creator', payload); }
            catch (e) { runtime.logEvent(\`[WARN] Failed to create '\${payload.name}': \${e.message}\`); }
        }
        return { success: true, message: 'Attentive Modeling Suite installed.' };
    `
};

export const UI_WORLD_MODEL_TOOLS: ToolCreatorPayload[] = [
    ATTENTIVE_MODELING_INSTALLER
];