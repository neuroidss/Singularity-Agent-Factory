// bootstrap/ui_inspector_tool.ts
import type { ToolCreatorPayload } from '../types';

export const INSPECTOR_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Inspector',
    description: 'A UI panel for inspecting and filtering components in the simulation view.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a detailed, interactive list of all components in the simulation, allowing users to select, inspect, and filter them easily.',
    parameters: [
        { name: 'graph', type: 'object', description: 'The graph object containing nodes, edges, etc.', required: false },
        { name: 'debugInfo', type: 'object', description: 'An object containing live debug info for each agent.', required: true },
        { name: 'selectedId', type: 'string', description: 'The ID of the currently selected agent.', required: false },
        { name: 'selectedNode', type: 'object', description: 'The full node object of the selected agent.', required: false },
        { name: 'onSelect', type: 'object', description: 'Callback function when an agent is selected.', required: true },
        { name: 'onHover', type: 'object', description: 'Callback function for mouse hover events.', required: true },
    ],
    implementationCode: `
        const [filter, setFilter] = React.useState('');
        const agents = graph?.nodes || [];

        const filteredAgents = React.useMemo(() => 
            (agents || []).filter(agent => agent.id.toLowerCase().includes(filter.toLowerCase())),
            [agents, filter]
        );
        
        const selectedAgentNets = React.useMemo(() => {
            if (!selectedId || !graph?.edges) return [];
            const nets = new Map();
            graph.edges.forEach(edge => {
                const [sourceComp] = edge.source.split('-');
                const [targetComp] = edge.target.split('-');
                if (sourceComp === selectedId || targetComp === selectedId) {
                    if (!nets.has(edge.label)) {
                        nets.set(edge.label, []);
                    }
                    nets.get(edge.label).push(sourceComp === selectedId ? edge.target : edge.source);
                }
            });
            return Array.from(nets.entries()).map(([name, connections]) => ({ name, connections }));
        }, [selectedId, graph?.edges]);

        return (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 flex flex-col h-full text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Inspector</h3>
                <input
                    id="agent-filter"
                    name="agent-filter"
                    type="text"
                    placeholder="Filter items..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-1.5 text-sm mb-2"
                />
                <div className="flex-grow overflow-y-auto pr-1">
                    {filteredAgents.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No items match filter.</p>}
                    {filteredAgents.map(agent => {
                        const isSelected = selectedId === agent.id;
                        return (
                             <div
                                key={agent.id}
                                onMouseEnter={() => onHover(agent.id, true)}
                                onMouseLeave={() => onHover(agent.id, false)}
                                className={\`mb-1 rounded-lg transition-all duration-200 \${isSelected ? 'bg-indigo-700' : 'bg-gray-700/50'}\`}
                            >
                                <button onClick={() => onSelect(agent.id)} className="w-full text-left p-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold">{agent.id}</span>
                                    </div>
                                </button>
                                {isSelected && (
                                     <div className="p-2 border-t border-indigo-500 text-xs space-y-2">
                                        {selectedNode && (
                                             <div className="space-y-1 pb-2 mb-2 border-b border-indigo-600/50">
                                                <h5 className="font-bold text-indigo-200">Properties</h5>
                                                {selectedNode.footprint && <div className="truncate"><span className="text-gray-400">Footprint:</span> {selectedNode.footprint}</div>}
                                                {selectedNode.side && <div><span className="text-gray-400">Side:</span> {selectedNode.side}</div>}
                                            </div>
                                        )}
                                        <div className="pt-1">
                                            <h5 className="font-bold text-indigo-200 mb-1">Connections (Nets)</h5>
                                            {selectedAgentNets.length > 0 ? (
                                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                                    {selectedAgentNets.map(net => (
                                                        <div key={net.name} className="text-xs">
                                                            <span className="text-green-400 font-semibold">{net.name}:</span>
                                                            <span className="text-gray-300 ml-2">{net.connections.map(c => c.split('-')[0]).join(', ')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-500">No connections defined.</p>
                                            )}
                                        </div>
                                     </div>
                                )}
                             </div>
                        )
                    })}
                </div>
            </div>
        );
    `
};