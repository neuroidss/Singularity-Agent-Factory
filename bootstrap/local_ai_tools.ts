
import type { ToolCreatorPayload } from '../types';

// The Python server script is removed as it's not used in the client-only demo.
export const GEMMA_SERVER_SCRIPT = ``;

export const LOCAL_AI_PANEL_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Local AI Server Panel',
    description: 'A self-contained control panel for managing the local multimodal AI server. It handles its own state and uses provided functions to interact with server tools.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a user-friendly interface for managing the local AI server, which grants the agent advanced multimodal capabilities.',
    parameters: [
      { name: 'logEvent', type: 'object', description: 'Function to log events to the main debug log.', required: true },
    ],
    implementationCode: `
      return (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-4 text-center">
          <h3 className="text-lg font-bold text-indigo-300">Local AI Server</h3>
            <div className="flex items-center justify-center gap-2 mt-1">
              <div className={'w-3 h-3 rounded-full bg-yellow-500'}></div>
              <p className="text-sm text-gray-300">
                Feature Disabled
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              The local multimodal AI server requires a Node.js backend to run Python scripts. This feature is disabled in the client-only demo.
            </p>
             <div className="flex flex-wrap gap-2 mt-4">
                <button disabled className="flex-1 bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg disabled:cursor-not-allowed">Start</button>
                <button disabled className="flex-1 bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg disabled:cursor-not-allowed">Stop</button>
             </div>
        </div>
      );
    `
};