export const AgentDebugPanelString = `
const AgentDebugPanel = ({ agents, debugInfo, selectedId, selectedNode, onSelect, onHover, filter, onFilterChange }) => {
    // The filter state is now managed by the parent component.
    // This component simply receives the current filter value and the function to change it.

    const filteredAgents = React.useMemo(() => 
        (agents || []).filter(agent => agent.id.toLowerCase().includes((filter || '').toLowerCase())),
        [agents, filter]
    );

    const ForceBar = ({ value, max }) => {
        const percentage = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
        return (
            <div className="w-full bg-gray-600 rounded-full h-1.5">
                <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: \`\${percentage}%\` }}></div>
            </div>
        );
    };

    return (
        <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 flex flex-col h-full text-white">
            <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Inspector</h3>
            <input
                id="agent-filter"
                name="agent-filter"
                type="text"
                placeholder="Filter items..."
                value={filter}
                onChange={e => onFilterChange(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-md p-1.5 text-sm mb-2"
            />
            <div className="flex-grow overflow-y-auto pr-1">
                {filteredAgents.map(agent => {
                    const info = debugInfo[agent.id] || { totalForce: { x: 0, z: 0 }, forces: {}, drcStatus: 'ok' };
                    const drcStatus = info.drcStatus || 'ok';
                    const totalForceMag = Math.hypot(info.totalForce.x, info.totalForce.z);
                    const isSelected = selectedId === agent.id;
                    const maxForce = Math.max(1, ...Object.values(info.forces || {}).map(v => Number(v) || 0));

                    let drcIcon = '✅';
                    let drcColor = 'text-green-400';
                    if (drcStatus === 'out_of_bounds') {
                        drcIcon = '⚠️';
                        drcColor = 'text-yellow-400';
                    } else if (drcStatus === 'overlap') {
                        drcIcon = '❌';
                        drcColor = 'text-red-400';
                    }

                    return (
                        <div
                            key={agent.id}
                            onMouseEnter={() => onHover(agent.id, true)}
                            onMouseLeave={() => onHover(agent.id, false)}
                            className={\`mb-1 rounded-lg transition-all duration-200 \${isSelected ? 'bg-indigo-700' : 'bg-gray-700/50'}\`}
                        >
                            <button onClick={() => onSelect(agent.id)} className="w-full text-left p-2">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className={drcColor} title={\`DRC Status: \${drcStatus}\`}>{drcIcon}</span>
                                        <span className="font-bold">{agent.id}</span>
                                    </div>
                                    <span className="text-xs font-mono text-cyan-300">{totalForceMag.toFixed(0)}</span>
                                </div>
                            </button>
                            {isSelected && (
                                <div className="p-2 border-t border-indigo-500 text-xs space-y-2">
                                    {selectedNode && (
                                        <div className="space-y-1 pb-2 mb-2 border-b border-indigo-600/50">
                                            <h5 className="font-bold text-indigo-200">Properties</h5>
                                            <div><span className="text-gray-400">Type:</span> {selectedNode.type || 'N/A'}</div>
                                            {selectedNode.footprint && <div className="truncate"><span className="text-gray-400">Footprint:</span> {selectedNode.footprint}</div>}
                                            {selectedNode.side && <div><span className="text-gray-400">Side:</span> {selectedNode.side}</div>}
                                            {selectedNode.asset_glb && <div className="truncate"><span className="text-gray-400">Asset:</span> {selectedNode.asset_glb}</div>}
                                        </div>
                                    )}
                                    <h5 className="font-bold text-indigo-200">Live Forces</h5>
                                    {Object.entries(info.forces || {}).sort(([, a], [, b]) => Number(b) - Number(a)).map(([name, value]) => (
                                        <div key={name}>
                                            <div className="flex justify-between">
                                                <span>{name}</span>
                                                <span className="font-mono">{Number(value).toFixed(0)}</span>
                                            </div>
                                            <ForceBar value={Number(value)} max={maxForce} />
                                        </div>
                                    ))}
                                    {Object.keys(info.forces || {}).length === 0 && <p className="text-gray-500">No forces acting.</p>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
`