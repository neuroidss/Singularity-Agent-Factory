// bootstrap/gazebo_tools.ts
import type { ToolCreatorPayload } from '../types';
import { GAZEBO_SERVICE_SCRIPT } from './gazebo_service';
import { GAZEBO_SERVICE_COMMANDS_SCRIPT } from './gazebo_service_commands';

const AUTONOMOUS_SWARM_MISSION_PAYLOAD: ToolCreatorPayload = {
    name: 'Execute Drone Swarm Mission',
    description: 'Executes a complete autonomous mission for a swarm of drones based on a high-level objective. The agent will continuously perceive the environment through the drones, decide on the next actions for each, and execute them in a loop.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To provide the primary high-level orchestration capability for managing a drone swarm to achieve a complex goal.',
    parameters: [
        { name: 'drone_ids', type: 'array', description: 'A JSON string of an array of drone IDs to use for the mission.', required: true },
        { name: 'mission_prompt', type: 'string', description: 'The high-level mission objective (e.g., "Survey the area and find the runway").', required: true },
    ],
    implementationCode: `
      const { drone_ids: droneIdsJson, mission_prompt } = args;
      const droneIds = JSON.parse(droneIdsJson);
      const log = (msg) => runtime.logEvent('[MISSION] ' + msg);

      log(\`Starting swarm mission for drones [\${droneIds.join(', ')}] with objective: "\${mission_prompt}"\`);

      try {
        // This loop represents the core Sense-Think-Act cycle for the swarm orchestrator.
        for (let i = 0; i < 50; i++) { // Loop cap to prevent infinite runs
            if (!runtime.isSwarmRunning()) {
                log('Mission cancelled by user.');
                return { success: false, message: 'Mission cancelled.' };
            }

            log(\`Cycle \${i + 1}: Perceiving world state...\`);
            // 1. SENSE: Get the current state of all drones and their camera feeds.
            const swarmStateResult = await runtime.tools.run('Get Swarm State');
            const swarmState = swarmStateResult.swarm_state;
            const imageFiles = [];
            for (const droneId of droneIds) {
                const droneFpvData = swarmState[droneId]?.['image_raw'];
                if (droneFpvData) {
                    imageFiles.push({ name: \`\${droneId}_frame.jpg\`, type: 'image/jpeg', data: droneFpvData });
                }
            }

            // 2. THINK: Ask the multimodal LLM for the next set of actions.
            log('LLM is planning next actions for the swarm...');
            const thinkingPrompt = \`
                Mission Objective: "\${mission_prompt}"
                Current Swarm State: \${JSON.stringify(swarmState, null, 2)}
                
                Based on the mission, the current state, and the attached camera feeds from each drone, determine the next set of tool calls to execute for each drone.
                Respond with ONLY a JSON array of tool call objects. Each object must have "drone_id", "tool_name", and "arguments".
                Example: [{"drone_id": "drone1", "tool_name": "Set Drone Velocity", "arguments": {"forward": 1.0}}]
            \`;
            const systemPrompt = "You are a drone swarm commander. Your task is to analyze the state of your drones and their visual feeds to achieve a high-level mission objective. You issue commands by generating a JSON array of tool calls.";
            
            const llmResponse = await runtime.ai.generateText(thinkingPrompt, systemPrompt, imageFiles);
            
            // 3. ACT: Parse the response and execute the commands.
            let actions = [];
            try {
                 const jsonMatch = llmResponse.match(/\\[[\\s\\S]*\\]/);
                 if (jsonMatch) {
                    actions = JSON.parse(jsonMatch[0]);
                 } else {
                    log('[WARN] LLM did not return a valid JSON array of actions. Holding position.');
                 }
            } catch (e) {
                log(\`[ERROR] Failed to parse LLM action plan: \${e.message}\`);
                actions = [];
            }

            if (actions.length > 0) {
                 log(\`Executing \${actions.length} actions from LLM plan...\`);
                 const actionPromises = actions.map(action => 
                    runtime.tools.run(action.tool_name, { ...action.arguments, drone_id: action.drone_id })
                 );
                 await Promise.all(actionPromises);
            } else {
                log('No actions planned by LLM this cycle. Holding positions.');
            }
            
            // A short delay to allow the simulation to update.
            await new Promise(res => setTimeout(res, 2000));
        }
        
        log('Mission loop finished (iteration limit reached).');
        return { success: true, message: 'Mission loop completed.' };

      } catch (e) {
        log(\`[ERROR] Mission failed catastrophically: \${e.message}\`);
        throw e;
      }
    `
};

const BASIC_DRONE_MISSION_PAYLOAD: ToolCreatorPayload = {
    name: 'Execute Basic Drone Mission',
    description: 'Executes a simple, pre-scripted mission for a single drone: arm, takeoff, fly forward briefly, and land.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To provide a simple, reliable way to test basic drone flight capabilities.',
    parameters: [
        { name: 'drone_id', type: 'string', description: 'The ID of the drone to command.', required: true },
    ],
    implementationCode: `
      const { drone_id } = args;
      const log = (msg) => runtime.logEvent('[MISSION] ' + msg);

      log(\`Starting basic flight mission for \${drone_id}...\`);
      
      const delay = (ms) => new Promise(res => setTimeout(res, ms));

      try {
        log('Waiting 10 seconds for drone systems to stabilize...');
        await delay(10000);

        log('Disabling pre-flight checks for SITL...');
        await runtime.tools.run('Set PX4 Parameter', { drone_id, param_name: 'CBRK_SUPPLY_CHK', param_value: 894281 });
        await delay(200);
        await runtime.tools.run('Set PX4 Parameter', { drone_id, param_name: 'CBRK_USB_CHK', param_value: 197848 });
        await delay(200);
        
        log('Extending communication loss timeouts...');
        await runtime.tools.run('Set PX4 Parameter', { drone_id, param_name: 'COM_OBC_LOSS_T', param_value: 3600.0 });
        await delay(200);
        await runtime.tools.run('Set PX4 Parameter', { drone_id, param_name: 'COM_RC_LOSS_T', param_value: 3600.0 });
        await delay(1000);

        log('Setting mode to OFFBOARD...');
        await runtime.tools.run('Set Drone Mode', { drone_id, mode: 'OFFBOARD' });
        await delay(1000);

        log('Arming drone...');
        await runtime.tools.run('Arm Drone', { drone_id });
        await delay(2000);

        log('Commanding takeoff to 5 meters...');
        await runtime.tools.run('Command Drone Takeoff', { drone_id, altitude: 5.0 });
        
        log('Waiting for drone to reach altitude...');
        let altitude = 0;
        for (let i=0; i<20; i++) { // Wait max 20 seconds
            const stateResult = await runtime.tools.run('Get Swarm State');
            altitude = stateResult?.swarm_state?.[drone_id]?.altitude ?? 0;
            if(altitude === null || altitude === undefined) altitude = 0;
            log(\`Current altitude: \${altitude.toFixed(2)}m\`);
            if (altitude > 4.5) {
                log('Takeoff altitude reached.');
                break;
            }
            await delay(1000);
        }
        if (altitude < 4.5) {
            throw new Error('Drone did not reach takeoff altitude in time.');
        }

        log('Flying forward for 5 seconds at 1.5 m/s...');
        await runtime.tools.run('Set Drone Velocity', { drone_id, forward: 1.5 });
        await delay(5000);

        log('Halting forward movement...');
        await runtime.tools.run('Set Drone Velocity', { drone_id, forward: 0.0 });
        await delay(2000);
        
        log('Initiating landing...');
        await runtime.tools.run('Set Drone Mode', { drone_id, mode: 'AUTO.LAND' });

        log('Mission complete.');
        return { success: true, message: 'Basic drone mission completed successfully.' };

      } catch (e) {
        log(\`[ERROR] Mission failed: \${e.message}\`);
        try {
            log('Attempting emergency land...');
            await runtime.tools.run('Set Drone Mode', { drone_id, mode: 'AUTO.LAND' });
        } catch (landError) {
            log(\`[ERROR] Emergency land command failed: \${landError.message}\`);
        }
        throw e;
      }
    `
};

const DRONE_FPV_FEED_PAYLOAD: ToolCreatorPayload = {
    name: 'Drone FPV Feed',
    description: 'Displays a simulated first-person view video feed from a selected drone.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide real-time visual feedback from a simulated drone\'s camera.',
    parameters: [
        { name: 'swarmState', type: 'object', description: 'The latest state object for the entire swarm.', required: true },
        { name: 'selectedDroneId', type: 'string', description: 'The ID of the drone to view the feed from.', required: false },
        { name: 'serviceHealth', type: 'object', description: 'Health status of the backend Gazebo service.', required: false },
    ],
    implementationCode: `
      const frameData = selectedDroneId && swarmState ? swarmState[selectedDroneId]?.['image_raw'] : null;
      const frameSrc = frameData ? 'data:image/jpeg;base64,' + frameData : null;
      
      const getStatusText = () => {
        if (frameSrc) return null;
        if (!serviceHealth) return 'Checking service...';
        if (serviceHealth.ros2_init_status === 'failed') return 'ROS2 Bridge Error';
        if (!selectedDroneId) return 'Select Drone';
        
        const isDroneConnected = serviceHealth.drones_connected?.includes(selectedDroneId);

        if (isDroneConnected) {
            // We have telemetry and a confirmed connection, but are waiting for video frames.
            return 'Awaiting Video Stream...';
        }
        
        // If we don't have a confirmed connection from the service yet.
        return 'Connecting...';
      };
      
      const statusText = getStatusText();

      return (
        <div className="w-full h-full bg-black/50 border border-gray-700 rounded-xl flex items-center justify-center relative">
          <h3 className="absolute top-2 left-3 text-sm font-bold text-green-300 bg-black/30 px-2 py-1 rounded">FPV Feed: {selectedDroneId || 'None'}</h3>
          {frameSrc ? (
            <img src={frameSrc} alt={\`FPV Feed for \${selectedDroneId}\`} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center">
              <p className="text-gray-400">{statusText}</p>
            </div>
          )}
        </div>
      );
    `
};

const DRONE_SWARM_TACTICAL_VIEW_PAYLOAD: ToolCreatorPayload = {
    name: 'Drone Swarm Tactical View',
    description: 'Displays a 2D tactical map of all drones and their positions.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a strategic overview of the entire drone swarm.',
    parameters: [
        { name: 'swarmState', type: 'object', description: 'The latest state object for the entire swarm.', required: true },
        { name: 'selectedDroneId', type: 'string', description: 'The ID of the currently selected drone.', required: false },
        { name: 'onSelectDrone', type: 'object', description: 'Callback function to select a drone.', required: true },
        { name: 'serviceHealth', type: 'object', description: 'Health status of the backend Gazebo service.', required: false },
    ],
    implementationCode: `
        const bounds = { minX: -20, maxX: 20, minY: -20, maxY: 20, width: 40, height: 40 };
        const drones = swarmState ? Object.entries(swarmState)
            .map(([id, state]) => ({ id, ...state.pose }))
            .filter(d => d.x !== undefined && d.y !== undefined && d.x !== null && d.y !== null) : [];
        
        const getStatusText = () => {
          if (drones.length > 0) return null;
          if (!serviceHealth) return 'Checking service...';
          if (serviceHealth.ros2_init_status === 'failed') return 'ROS2 Bridge Error';
          return 'Awaiting drone position...';
        };
        const statusText = getStatusText();

        return (
            <div className="w-full h-full bg-black/50 border border-gray-700 rounded-lg relative overflow-hidden">
                <h3 className="absolute top-2 left-3 text-sm font-bold text-green-300 bg-black/30 px-2 py-1 rounded">Swarm Tactical View</h3>
                {drones.map(drone => {
                    const isSelected = drone.id === selectedDroneId;
                    const left = ((drone.x - bounds.minX) / bounds.width) * 100;
                    const top = ((-drone.y - bounds.minY) / bounds.height) * 100; // Invert Y for screen coordinates
                    return (
                        <button 
                            key={drone.id} 
                            onClick={() => onSelectDrone(drone.id)}
                            className={"absolute transform -translate-x-1/2 -translate-y-1/2 p-1 rounded-full transition-all " + (isSelected ? 'bg-cyan-400 ring-2 ring-white' : 'bg-red-500')}
                            style={{ left: \`\${left}%\`, top: \`\${top}%\` }}
                            title={drone.id}
                        >
                           <span className="text-xs font-bold text-white absolute -top-4 left-1/2 -translate-x-1/2">{drone.id}</span>
                        </button>
                    );
                })}
                 {statusText && (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                        {statusText}
                    </div>
                )}
            </div>
        );
    `
};

const DRONE_TELEMETRY_PAYLOAD: ToolCreatorPayload = {
    name: 'Drone Telemetry Panel',
    description: 'Displays key telemetry data from the selected drone.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To monitor a specific drone\'s status during a mission.',
    parameters: [
        { name: 'swarmState', type: 'object', description: 'The latest state object for the entire swarm.', required: true },
        { name: 'selectedDroneId', type: 'string', description: 'The ID of the drone to display telemetry for.', required: false },
        { name: 'serviceHealth', type: 'object', description: 'Health status of the backend Gazebo service.', required: false },
    ],
    implementationCode: `
        const telemetry = (selectedDroneId && swarmState) ? swarmState[selectedDroneId] : null;

        const getDisplayValue = (key) => {
            if (!selectedDroneId) return 'N/A';
            const value = telemetry?.[key];
            if (value !== null && value !== undefined) return value;
            if (!serviceHealth) return '...';
            if (serviceHealth.ros2_init_status === 'failed') return 'ERR';
            if (!serviceHealth.drones_connected?.includes(selectedDroneId)) return 'Wait...';
            return 'N/A';
        }

        const displayData = {
            altitude: getDisplayValue('altitude'),
            speed: getDisplayValue('velocity'),
            battery: getDisplayValue('battery'),
            signal: '98', // Static for now
        };

        const TelemetryItem = ({ label, value, unit }) => (
          <div className="bg-gray-900/50 p-2 rounded-lg text-center">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-xl font-bold text-cyan-300">{value} <span className="text-sm text-cyan-400">{unit}</span></p>
          </div>
        );

        return (
            <div className="w-full h-full bg-gray-800/60 border border-gray-700 rounded-xl p-3">
                 <h3 className="text-lg font-bold text-indigo-300 mb-2 text-center">Telemetry: {selectedDroneId || 'None'}</h3>
                 <div className="grid grid-cols-2 gap-2">
                    <TelemetryItem label="Altitude" value={displayData.altitude} unit="m" />
                    <TelemetryItem label="Speed" value={displayData.speed} unit="m/s" />
                    <TelemetryItem label="Battery" value={displayData.battery} unit="%" />
                    <TelemetryItem label="Signal" value={displayData.signal} unit="%" />
                 </div>
            </div>
        );
    `
};

const DRONE_CONTROL_PANEL_PAYLOAD: ToolCreatorPayload = {
    name: 'Drone Command & Control',
    description: 'Provides controls to manage the simulation and swarm.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To give the user high-level control over the simulation environment and mission execution.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'Agent runtime for tool execution.', required: true },
        { name: 'isSimRunning', type: 'boolean', description: 'Flag indicating if the simulation is active.', required: true },
        { name: 'setIsSimRunning', type: 'object', description: 'Function to set the simulation running state.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Flag indicating if the main agent swarm is busy.', required: true },
        { name: 'startSwarmTask', type: 'object', description: 'Function to start a new swarm task.', required: true },
        { name: 'droneCount', type: 'number', description: 'The number of spawned drones.', required: true },
        { name: 'setDroneCount', type: 'object', description: 'Function to update the number of drones.', required: true },
        { name: 'selectedDroneId', type: 'string', description: 'The ID of the currently selected drone.', required: false },
        { name: 'setSelectedDroneId', type: 'object', description: 'Function to set the currently selected drone ID.', required: true },
    ],
    implementationCode: `
        const [isLoading, setIsLoading] = React.useState(false);
        const [missionPrompt, setMissionPrompt] = React.useState('Survey the area and find the runway.');
        const [selectedDroneModel, setSelectedDroneModel] = React.useState('gz_x500_mono_cam_down');

        const droneModels = [
            'gz_x500', 
            'gz_x500_mono_cam', 
            'gz_x500_mono_cam_down',
            'gz_x500_depth',
            'gz_x500_flow',
            'gz_x500_vision',
            'gz_x500_lidar_2d',
            'gz_standard_vtol',
            'gz_tiltrotor',
            'gz_quadtailsitter'
        ];

        const handleCommand = React.useCallback(async (command, args, logMessage) => {
            runtime.logEvent(\`[CONTROL] \${logMessage}...\`);
            try {
                const result = await runtime.tools.run(command, args);
                if (result.error) throw new Error(result.error);
                runtime.logEvent(\`[SUCCESS] \${result.message || command + ' successful.'}\`);
                return result;
            } catch (e) {
                runtime.logEvent(\`[ERROR] \${e.message}\`);
                throw e;
            }
        }, [runtime]);
        
        const handleStartSim = async () => {
            setIsLoading(true);
            try {
                const droneId = selectedDroneModel.replace('gz_', '') + '_0';
                await handleCommand('Start Gazebo Simulation', { drone_model: selectedDroneModel }, 'Starting simulation');
                runtime.logEvent('[CONTROL] Waiting 15s for Gazebo, MAVROS, and drone to initialize...');
                await new Promise(res => setTimeout(res, 15000));
                await handleCommand('Spawn Drone', { drone_id: droneId }, \`Registering drone '\${droneId}' with bridge\`);
                setIsSimRunning(true);
                setDroneCount(1);
                setSelectedDroneId(droneId);
                runtime.logEvent(\`[SUCCESS] Simulation is live. Drone \${droneId} is online.\`);
            } catch (e) {
                setIsSimRunning(false);
                setDroneCount(0);
                setSelectedDroneId(null);
            } finally {
                setIsLoading(false);
            }
        };

        const handleStopSim = async () => {
            setIsLoading(true);
            try {
                await handleCommand('Stop Gazebo Simulation', {}, 'Stopping simulation');
            } finally {
                setIsLoading(false);
                setIsSimRunning(false);
                setDroneCount(0);
                setSelectedDroneId(null);
            }
        };
        
        const handleSpawnDrone = async () => {
            runtime.logEvent('[INFO] Multi-drone spawning is not supported in this simulation configuration. The default drone is spawned automatically on simulation start.');
        };
        
        const handleLaunchMission = () => {
            if (!selectedDroneId) {
                runtime.logEvent('[ERROR] No drone selected for mission.');
                return;
            }
            runtime.tools.run('Execute Basic Drone Mission', { drone_id: selectedDroneId })
              .catch(e => runtime.logEvent(\`[ERROR] Mission execution failed: \${e.message}\`));
        };

        return (
            <div className="w-full h-full bg-gray-800/60 border border-gray-700 rounded-xl p-3 flex flex-col gap-2">
                 <h3 className="text-lg font-bold text-indigo-300 text-center">Command & Control</h3>
                 <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleStartSim} disabled={isLoading || isSimRunning} className="bg-gray-700 hover:bg-gray-600 font-semibold py-2 rounded-lg disabled:bg-gray-800 disabled:text-gray-500">{isLoading ? 'Starting...' : 'Start Sim'}</button>
                    <button onClick={handleStopSim} disabled={isLoading || !isSimRunning} className="bg-red-800 hover:bg-red-700 font-semibold py-2 rounded-lg disabled:bg-red-900 disabled:text-gray-500">Stop Sim</button>
                 </div>
                 <div>
                    <label htmlFor="drone-model-select" className="text-xs text-gray-400">Drone Model:</label>
                    <select 
                        id="drone-model-select"
                        value={selectedDroneModel} 
                        onChange={e => setSelectedDroneModel(e.target.value)} 
                        disabled={isLoading || isSimRunning}
                        className="w-full mt-1 bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm disabled:bg-gray-800 disabled:text-gray-500"
                    >
                        {droneModels.map(model => <option key={model} value={model}>{model.replace('gz_', '')}</option>)}
                    </select>
                 </div>
                 <div className="border-t border-gray-700 pt-2 space-y-2">
                     <h4 className="text-sm font-semibold text-center text-gray-400">Swarm Control</h4>
                     <button onClick={handleSpawnDrone} disabled={!isSimRunning} className="w-full bg-blue-600 hover:bg-blue-500 font-semibold py-2 rounded-lg disabled:bg-gray-600">Spawn Drone</button>
                 </div>
                 <div className="border-t border-gray-700 pt-2 space-y-2 flex-grow flex flex-col">
                     <h4 className="text-sm font-semibold text-center text-gray-400">Mission Control</h4>
                     <textarea value={missionPrompt} onChange={e => setMissionPrompt(e.target.value)} placeholder="Enter high-level mission..." className="w-full flex-grow bg-gray-900 border border-gray-600 rounded-lg p-2 text-sm" />
                     <button onClick={handleLaunchMission} disabled={!isSimRunning || isSwarmRunning || droneCount === 0} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 font-semibold py-2 rounded-lg disabled:bg-gray-600">Launch Mission</button>
                 </div>
            </div>
        );
    `
};

const DRONE_COMMAND_COCKPIT_PAYLOAD: ToolCreatorPayload = {
    name: 'Drone Command Cockpit',
    description: 'The main UI for the Gazebo drone simulation, orchestrating all sub-panels.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a comprehensive interface for drone simulation and control.',
    parameters: [
        { name: 'getTool', type: 'object', description: 'Function to retrieve a tool definition by name.', required: true },
        { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Flag indicating if the main agent swarm is busy.', required: true },
        { name: 'startSwarmTask', type: 'object', description: 'Function to start a new swarm task.', required: true },
    ],
    implementationCode: `
        const [isSimRunning, setIsSimRunning] = React.useState(false);
        const [swarmState, setSwarmState] = React.useState({});
        const [selectedDroneId, setSelectedDroneId] = React.useState(null);
        const [droneCount, setDroneCount] = React.useState(0);
        const [serviceHealth, setServiceHealth] = React.useState(null);
        const intervalRef = React.useRef(null);
        const isMountedRef = React.useRef(true);
        React.useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

        React.useEffect(() => {
            const pollData = async () => {
                if (!isSimRunning || !isMountedRef.current) return;
                try {
                    const [stateResult, healthResult] = await Promise.all([
                        runtime.tools.run('Get Swarm State'),
                        runtime.tools.run('Get Service Status', {service_id: 'gazebo_service'})
                    ]);
                    if (isMountedRef.current) {
                        setSwarmState(stateResult.swarm_state || {});
                        setServiceHealth(healthResult);
                    }
                } catch (e) {
                    console.error("Data poll failed:", e);
                    if (isMountedRef.current) {
                        setServiceHealth({ error_message: 'Failed to connect to Gazebo service.' });
                    }
                }
            };
            if (isSimRunning) {
                intervalRef.current = setInterval(pollData, 1000); // Poll every second
            } else {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setSwarmState({});
                setSelectedDroneId(null);
                setDroneCount(0);
                setServiceHealth(null);
            }
            return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
        }, [isSimRunning, runtime]);

        const controlProps = { runtime, isSimRunning, setIsSimRunning, isSwarmRunning, startSwarmTask, droneCount, setDroneCount, selectedDroneId, setSelectedDroneId };
        const fpvProps = { swarmState, selectedDroneId, serviceHealth };
        const telemetryProps = { swarmState, selectedDroneId, serviceHealth };
        const tacticalMapProps = { swarmState, selectedDroneId, onSelectDrone: setSelectedDroneId, serviceHealth };

        return (
            <div className="h-full w-full grid grid-cols-2 grid-rows-2 gap-4">
                <div className="col-span-1 row-span-1"><UIToolRunner tool={getTool('Drone FPV Feed')} props={fpvProps} /></div>
                <div className="col-span-1 row-span-1"><UIToolRunner tool={getTool('Drone Swarm Tactical View')} props={tacticalMapProps} /></div>
                <div className="col-span-1 row-span-1"><UIToolRunner tool={getTool('Drone Telemetry Panel')} props={telemetryProps} /></div>
                <div className="col-span-1 row-span-1"><UIToolRunner tool={getTool('Drone Command & Control')} props={controlProps} /></div>
            </div>
        );
    `
};

const GAZEBO_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    { name: 'Spawn Drone', description: 'Spawns a new drone in the simulation.', category: 'Server', executionEnvironment: 'Server', purpose: 'To dynamically add agents to the simulation environment.', parameters: [ { name: 'drone_id', type: 'string', description: 'A unique ID for the new drone.', required: true }, { name: 'x', type: 'number', description: 'Initial X coordinate.', required: false }, { name: 'y', type: 'number', description: 'Initial Y coordinate.', required: false } ], implementationCode: 'gazebo_service_proxy::spawn_drone' },
    { name: 'Get Swarm State', description: 'Retrieves telemetry and status for all active drones.', category: 'Server', executionEnvironment: 'Server', purpose: 'To provide the orchestrator AI with complete situational awareness of its swarm.', parameters: [], implementationCode: 'gazebo_service_proxy::get_swarm_state' },
    { name: 'Get Service Status', description: 'Retrieves the health and status of a backend service.', category: 'Server', executionEnvironment: 'Server', purpose: 'To monitor the health of critical backend services.', parameters: [{name: 'service_id', type: 'string', required: true, description: 'The ID of the service to check.'}], implementationCode: 'gazebo_service_proxy::get_service_status' },
    { 
        name: 'Start Gazebo Simulation', 
        description: 'Starts the ROS/Gazebo/PX4 simulation environment on the server with a specified drone model.', 
        category: 'Server', 
        executionEnvironment: 'Server', 
        purpose: 'To initialize the high-fidelity robotics simulation.', 
        parameters: [
            { name: 'drone_model', type: 'string', description: 'The Gazebo model to launch (e.g., "gz_x500", "gz_x500_mono_cam"). Defaults to "gz_x500".', required: false }
        ], 
        implementationCode: 'gazebo_service_proxy::start_gazebo_simulation' 
    },
    { name: 'Stop Gazebo Simulation', description: 'Stops the ROS/Gazebo/PX4 simulation environment on the server.', category: 'Server', executionEnvironment: 'Server', purpose: 'To terminate the robotics simulation.', parameters: [], implementationCode: 'gazebo_service_proxy::stop_gazebo_simulation' },
    { name: 'Arm Drone', description: 'Arms the drone, allowing motors to spin.', category: 'Server', executionEnvironment: 'Server', purpose: 'To prepare the drone for flight.', parameters: [{ name: 'drone_id', type: 'string', description: 'The ID of the drone to arm.', required: true }], implementationCode: 'gazebo_service_proxy::arm_drone' },
    { name: 'Set Drone Mode', description: 'Sets the flight mode of the drone (e.g., OFFBOARD, LAND).', category: 'Server', executionEnvironment: 'Server', purpose: 'To control the high-level state of the drone.', parameters: [ { name: 'drone_id', type: 'string', description: 'The ID of the drone to command.', required: true }, { name: 'mode', type: 'string', description: 'The desired MAVROS flight mode (e.g., "OFFBOARD").', required: true } ], implementationCode: 'gazebo_service_proxy::set_drone_mode' },
    { name: 'Command Drone Takeoff', description: 'Commands the drone to take off to a specific altitude.', category: 'Server', executionEnvironment: 'Server', purpose: 'To initiate flight.', parameters: [ { name: 'drone_id', type: 'string', description: 'The ID of the drone to command.', required: true }, { name: 'altitude', type: 'number', description: 'The target altitude in meters.', required: false } ], implementationCode: 'gazebo_service_proxy::command_drone_takeoff' },
    { name: 'Set Drone Velocity', description: 'Commands the drone to move at a specific velocity.', category: 'Server', executionEnvironment: 'Server', purpose: 'To control drone movement.', parameters: [ { name: 'drone_id', type: 'string', description: 'The ID of the drone to command.', required: true }, { name: 'forward', type: 'number', description: 'Velocity in the forward direction (m/s).', required: false }, { name: 'right', type: 'number', description: 'Velocity in the right direction (m/s).', required: false }, { name: 'up', type: 'number', description: 'Velocity in the upward direction (m/s).', required: false }, { name: 'yaw_rate', type: 'number', description: 'Rate of rotation around the Z-axis (rad/s).', required: false } ], implementationCode: 'gazebo_service_proxy::set_drone_velocity' },
    { name: 'Start GCS Heartbeat Emulation', description: 'Starts sending MAVLink GCS heartbeats to a drone to simulate a GCS connection, which is often required for arming in SITL.', category: 'Server', executionEnvironment: 'Server', purpose: 'To enable arming of PX4 vehicles in simulation without needing an external GCS application like QGroundControl.', parameters: [ { name: 'drone_id', type: 'string', description: 'The ID of the drone to send heartbeats to.', required: true }, ], implementationCode: 'gazebo_service_proxy::start_gcs_heartbeat' },
    { name: 'Stop GCS Heartbeat Emulation', description: 'Stops sending MAVLink GCS heartbeats to a drone.', category: 'Server', executionEnvironment: 'Server', purpose: 'To stop the GCS emulation for a specific drone.', parameters: [ { name: 'drone_id', type: 'string', description: 'The ID of the drone to stop sending heartbeats to.', required: true }, ], implementationCode: 'gazebo_service_proxy::stop_gcs_heartbeat' },
    { 
        name: 'Set PX4 Parameter',
        description: 'Sets a parameter on the PX4 autopilot using MAVROS services.',
        category: 'Server',
        executionEnvironment: 'Server',
        purpose: 'To configure the drone\'s flight controller parameters for specific mission requirements, like disabling pre-flight checks in SITL.',
        parameters: [
            { name: 'drone_id', type: 'string', description: 'The ID of the drone (e.g., "x500_0").', required: true },
            { name: 'param_name', type: 'string', description: 'The name of the PX4 parameter to set (e.g., "COM_RCL_EXCEPT").', required: true },
            { name: 'param_value', type: 'number', description: 'The integer or float value to set for the parameter.', required: true },
        ],
        implementationCode: 'gazebo_service_proxy::set_px4_parameter'
    },
];

const GAZEBO_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Gazebo Simulation Suite',
    description: 'Installs all tools required for the Gazebo/PX4 drone simulation.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's capability for high-fidelity robotics simulation.",
    parameters: [],
    implementationCode: `
        const scriptsToWrite = [
            { name: 'gazebo_service.py', content: ${JSON.stringify(GAZEBO_SERVICE_SCRIPT)} },
            { name: 'gazebo_service_commands.py', content: ${JSON.stringify(GAZEBO_SERVICE_COMMANDS_SCRIPT)} },
        ];
        if (runtime.isServerConnected()) {
            for (const script of scriptsToWrite) {
                try {
                    await runtime.tools.run('Server File Writer', { filePath: script.name, content: script.content, baseDir: 'scripts' });
                } catch (e) {
                    runtime.logEvent(\`[WARN] Failed to write script '\${script.name}': \${e.message}\`);
                }
            }
        }
        const toolPayloads = [
            ...${JSON.stringify(GAZEBO_TOOL_DEFINITIONS)},
            ${JSON.stringify(BASIC_DRONE_MISSION_PAYLOAD)},
            ${JSON.stringify(DRONE_FPV_FEED_PAYLOAD)},
            ${JSON.stringify(DRONE_SWARM_TACTICAL_VIEW_PAYLOAD)},
            ${JSON.stringify(DRONE_TELEMETRY_PAYLOAD)},
            ${JSON.stringify(DRONE_CONTROL_PANEL_PAYLOAD)},
            ${JSON.stringify(DRONE_COMMAND_COCKPIT_PAYLOAD)},
            ${JSON.stringify(AUTONOMOUS_SWARM_MISSION_PAYLOAD)},
        ];
        const existing = new Set(runtime.tools.list().map(t => t.name));
        for (const payload of toolPayloads) {
            if (existing.has(payload.name)) continue;
            try { await runtime.tools.run('Tool Creator', payload); }
            catch (e) { runtime.logEvent(\`[WARN] Failed to create '\${payload.name}': \${e.message}\`); }
        }
        if (runtime.isServerConnected()) { await runtime.forceRefreshServerTools(); }
        return { success: true, message: 'Gazebo Simulation Suite installed.' };
    `
};

export const GAZEBO_TOOLS: ToolCreatorPayload[] = [
    GAZEBO_INSTALLER_TOOL,
];