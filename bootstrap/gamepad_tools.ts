// bootstrap/gamepad_tools.ts
import type { ToolCreatorPayload } from '../types';
import { GAMEPAD_SERVICE_SCRIPT } from './gamepad_service';
import { GAMEPAD_SERVICE_COMMANDS_SCRIPT } from './gamepad_service_commands';

const GAMEPAD_CONTROLLER_UI_PAYLOAD: ToolCreatorPayload = {
    name: 'Gamepad Controller',
    description: 'A UI panel for manually controlling a virtual gamepad for mixed reality simulations.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a manual interface for controlling agents or applications in a simulated environment using a standard gamepad layout.',
    parameters: [
      { name: 'runtime', type: 'object', description: 'The agent runtime for executing tool calls.', required: true },
    ],
    implementationCode: `
      const [stickPositions, setStickPositions] = React.useState({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
      const stickStateRef = React.useRef({ 
          left: { active: false, element: null, moveHandler: null, endHandler: null }, 
          right: { active: false, element: null, moveHandler: null, endHandler: null } 
      });
      
      const runCommand = React.useCallback((name, args) => {
        if(runtime?.tools?.run) {
          runtime.tools.run(name, args).catch(e => console.error(\`Gamepad command '\${name}' failed:\`, e));
        } else {
            console.warn("Gamepad command skipped: runtime not available.");
        }
      }, [runtime]);

      const handleButtonDown = (buttonName) => runCommand('Set Gamepad Button State', { button_name: buttonName, state: 1 });
      const handleButtonUp = (buttonName) => runCommand('Set Gamepad Button State', { button_name: buttonName, state: 0 });
      
      const handleStickMove = React.useCallback((e, stickName) => {
        const stick = stickStateRef.current[stickName];
        if (!stick.active || !stick.element) return;
        
        const rect = stick.element.getBoundingClientRect();
        const size = rect.width;
        const halfSize = size / 2;
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let x = clientX - rect.left - halfSize;
        let y = clientY - rect.top - halfSize;
        const dist = Math.min(halfSize, Math.hypot(x, y));
        const angle = Math.atan2(y, x);
        const finalX = Math.cos(angle) * dist / halfSize;
        const finalY = Math.sin(angle) * dist / halfSize;
        
        setStickPositions(prev => ({ ...prev, [stickName]: { x: finalX, y: finalY } }));
        runCommand('Move Gamepad Stick', { stick_name: stickName, x: finalX, y: -finalY }); // Invert Y for standard gamepad coords
      }, [runCommand]);

      const handleStickEnd = React.useCallback((stickName) => {
        const stick = stickStateRef.current[stickName];
        if (!stick.active) return;
        
        stick.active = false;
        setStickPositions(prev => ({ ...prev, [stickName]: { x: 0, y: 0 } }));
        runCommand('Move Gamepad Stick', { stick_name: stickName, x: 0, y: 0 });
        
        window.removeEventListener('mousemove', stick.moveHandler);
        window.removeEventListener('mouseup', stick.endHandler);
        window.removeEventListener('touchmove', stick.moveHandler);
        window.removeEventListener('touchend', stick.endHandler);
        
        stick.moveHandler = null;
        stick.endHandler = null;

      }, [runCommand]);

      const handleStickStart = (e, stickName) => {
        e.preventDefault();
        const stick = stickStateRef.current[stickName];
        stick.active = true;
        stick.element = e.currentTarget;
        stick.moveHandler = (ev) => handleStickMove(ev, stickName);
        stick.endHandler = () => handleStickEnd(stickName);
        
        window.addEventListener('mousemove', stick.moveHandler);
        window.addEventListener('mouseup', stick.endHandler, { once: true });
        window.addEventListener('touchmove', stick.moveHandler, { passive: false });
        window.addEventListener('touchend', stick.endHandler, { once: true });
      };
      
      const GamepadButton = ({ name, label, eventName, className = '' }) => (
        <button
          onMouseDown={() => handleButtonDown(eventName)}
          onMouseUp={() => handleButtonUp(eventName)}
          onTouchStart={(e) => { e.preventDefault(); handleButtonDown(eventName); }}
          onTouchEnd={(e) => { e.preventDefault(); handleButtonUp(eventName); }}
          className={"w-10 h-10 rounded-full bg-gray-600 active:bg-indigo-500 text-white font-bold flex items-center justify-center select-none " + className}
        >{label}</button>
      );
      
      const Stick = ({ name, position }) => (
        <div 
          onMouseDown={(e) => handleStickStart(e, name)}
          onTouchStart={(e) => handleStickStart(e, name)}
          className="w-24 h-24 bg-gray-900/50 rounded-full flex items-center justify-center relative touch-none cursor-pointer"
        >
          <div 
            className="w-12 h-12 bg-gray-600 rounded-full border-2 border-gray-500 absolute pointer-events-none"
            style={{ transform: \`translate(\${position.x * 50}%, \${position.y * 50}%)\` }}
          ></div>
        </div>
      );

      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 flex flex-col items-center justify-around h-full">
            <h3 className="text-lg font-bold text-indigo-300">Virtual Gamepad</h3>
            <div className="flex w-full items-center justify-between">
                <Stick name="left" position={stickPositions.left} />
                <div className="flex flex-col gap-2 items-center">
                    <GamepadButton label="Y" eventName="BTN_NORTH" />
                    <div className="flex gap-10">
                        <GamepadButton label="X" eventName="BTN_WEST" />
                        <GamepadButton label="B" eventName="BTN_EAST" />
                    </div>
                    <GamepadButton label="A" eventName="BTN_SOUTH" />
                </div>
            </div>
        </div>
      );
    `
};

const GAMEPAD_TOOL_DEFINITIONS: ToolCreatorPayload[] = [
    { name: 'Set Gamepad Button State', description: 'Presses or releases a button on the virtual gamepad.', category: 'Server', executionEnvironment: 'Server', purpose: "To simulate discrete button actions.", parameters: [ { name: 'button_name', type: 'string', description: "The uinput event name for the button (e.g., 'BTN_SOUTH').", required: true }, { name: 'state', type: 'number', description: 'The state of the button: 1 for press, 0 for release.', required: true } ], implementationCode: 'gamepad_service_proxy::set_button_state' },
    { name: 'Move Gamepad Stick', description: 'Moves an analog stick on the virtual gamepad.', category: 'Server', executionEnvironment: 'Server', purpose: "To simulate analog stick movements.", parameters: [ { name: 'stick_name', type: 'string', description: "The stick to move: 'left' or 'right'.", required: true }, { name: 'x', type: 'number', description: 'X-axis value from -1.0 to 1.0.', required: true }, { name: 'y', type: 'number', description: 'Y-axis value from -1.0 to 1.0.', required: true } ], implementationCode: 'gamepad_service_proxy::move_stick' },
];

const GAMEPAD_INSTALLER_TOOL: ToolCreatorPayload = {
    name: 'Install Gamepad Simulation Suite',
    description: 'Installs all necessary tools and server scripts for virtual gamepad simulation.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To bootstrap the agent's ability to control applications via a simulated gamepad.",
    parameters: [],
    implementationCode: `
        runtime.logEvent('[INFO] Installing Gamepad Simulation Suite...');
        const scriptsToWrite = [
            { name: 'gamepad_service.py', content: ${JSON.stringify(GAMEPAD_SERVICE_SCRIPT)} },
            { name: 'gamepad_service_commands.py', content: ${JSON.stringify(GAMEPAD_SERVICE_COMMANDS_SCRIPT)} },
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
        const toolPayloads = [ ...${JSON.stringify(GAMEPAD_TOOL_DEFINITIONS)}, ${JSON.stringify(GAMEPAD_CONTROLLER_UI_PAYLOAD)} ];
        const existingToolNames = new Set(runtime.tools.list().map(t => t.name));
        for (const payload of toolPayloads) {
            if (existingToolNames.has(payload.name)) continue;
            try { await runtime.tools.run('Tool Creator', payload); } catch (e) { runtime.logEvent(\`[WARN] Failed to create tool '\${payload.name}': \${e.message}\`); }
        }
        if (runtime.isServerConnected()) { await runtime.forceRefreshServerTools(); }
        return { success: true, message: 'Gamepad Simulation Suite installed.' };
    `
};

export const GAMEPAD_TOOLS: ToolCreatorPayload[] = [
    GAMEPAD_INSTALLER_TOOL,
];