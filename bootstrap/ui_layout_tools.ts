
import type { ToolCreatorPayload } from '../types';

export const UI_LAYOUT_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Application Header',
        description: 'Renders the main header and subtitle of the application.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide a consistent and visually appealing header for the application interface.',
        parameters: [],
        implementationCode: `
          return (
            <header className="text-center">
              <h1 className="text-4xl font-bold text-gray-200 animate-text bg-gradient-to-r from-purple-400 via-indigo-500 to-cyan-400 bg-clip-text text-transparent">
                  Singularity Agent Factory
              </h1>
              <p className="mt-1 text-md text-gray-400">
                  An experimental, self-improving AI swarm.
              </p>
            </header>
          );
        `,
    },
    {
        name: 'Main View Selector',
        description: 'Displays tabs to switch between the main application views like KiCad and Knowledge Graph.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To allow the user to navigate between the different major functionalities of the application.',
        parameters: [
            { name: 'mainView', type: 'string', description: 'The currently active view.', required: true },
            { name: 'setMainView', type: 'object', description: 'Function to change the active view.', required: true },
            { name: 'isPcbResultVisible', type: 'boolean', description: 'Hides the tabs when a PCB result is actively displayed.', required: true },
        ],
        implementationCode: `
            if (isPcbResultVisible) {
                return null; // Don't show tabs when a specific result like the PCB viewer is active
            }

            const tabs = [
                { id: 'KICAD', label: 'KiCad EDA' },
                { id: 'ROBOTICS', label: 'Robotics Sim' },
                { id: 'KNOWLEDGE_GRAPH', label: 'Knowledge Graph' },
            ];
            
            return (
                <div className="flex items-center justify-center space-x-2 bg-gray-800/60 border border-gray-700 rounded-xl p-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setMainView(tab.id)}
                            className={\`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 w-full \\
                                \${mainView === tab.id 
                                    ? 'bg-indigo-600 text-white shadow-md' 
                                    : 'bg-transparent text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                }\`
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            );
        `
    },
];