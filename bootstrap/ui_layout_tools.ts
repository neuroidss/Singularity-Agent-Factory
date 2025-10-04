import type { ToolCreatorPayload } from '../types';

export const UI_LAYOUT_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Main View Selector',
        description: 'Renders the main view selection buttons to switch between application modes.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide top-level navigation between the different agent workspaces like KiCad and Robotics.',
        parameters: [
            { name: 'mainView', type: 'string', description: 'The currently active main view.', required: true },
            { name: 'setMainView', type: 'object', description: 'Function to change the main view.', required: true },
        ],
        implementationCode: `
          const views = [
            { id: 'KICAD', label: 'KiCad Design' },
            { id: 'PRODUCER_STUDIO', label: 'Producer Studio' },
            { id: 'VIRTUAL_FILM_SET', label: 'Virtual Film Set' },
            { id: 'AETHERIUM_GAME', label: 'Aetherium' },
            { id: 'ATTENTIVE_MODELING', label: 'Attentive Modeling' },
            // { id: 'KNOWLEDGE_GRAPH', label: 'Strategic Memory' }, // Can be re-enabled later
          ];

          return (
            <div className="flex-shrink-0 bg-gray-800/60 border border-gray-700 rounded-xl p-1 flex items-center justify-center gap-2">
                {views.map(view => {
                    const isActive = mainView === view.id;
                    return (
                        <button
                            key={view.id}
                            onClick={() => setMainView(view.id)}
                            className={"px-4 py-2 rounded-lg font-semibold text-sm transition-colors duration-200 flex-1 text-center " + (
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-transparent text-gray-400 hover:bg-gray-700/50'
                            )}
                        >
                            {view.label}
                        </button>
                    )
                })}
            </div>
          );
        `,
    },
];