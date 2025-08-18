// bootstrap/ui_layout_heuristics_tools.ts
import type { ToolCreatorPayload } from '../types';

export const LAYOUT_HEURISTICS_TUNER_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Layout Heuristics Tuner',
    description: 'A UI panel for interactively tuning the parameters that guide the autonomous PCB layout simulation.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide fine-grained control over the behavior of the layout engine, allowing for real-time adjustments to achieve optimal component placement.',
    parameters: [
        { name: 'params', type: 'object', description: 'The current simulation parameter values.', required: true },
        { name: 'setParams', type: 'object', description: 'Callback to update the global simulation parameters.', required: true },
        { name: 'selectedAgent', type: 'object', description: 'The currently selected agent, if any.', required: false },
        { name: 'updateAgent', type: 'object', description: 'Callback to update a specific parameter for an agent.', required: true },
    ],
    implementationCode: `
        const { params, setParams, selectedAgent, updateAgent } = props;

        const handleParamChange = (e) => {
            const { name, value } = e.target;
            setParams(prev => ({ ...prev, [name]: parseFloat(value) }));
        };
        
        const handleAgentParamChange = (e) => {
            if (!selectedAgent) return;
            const { name, value } = e.target;
            updateAgent(selectedAgent.id, name, parseFloat(value));
        };
        
        const ParameterSlider = ({ name, label, min, max, step, value, onChange, unit }) => (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-300 mb-1">{label}: <span className="font-bold text-white">{value.toFixed(2)}</span> {unit}</label>
                <input
                    id={name}
                    name={name}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={onChange}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>
        );

        return (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 flex flex-col h-full text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Layout Heuristics</h3>
                <div className="flex-grow overflow-y-auto p-2 space-y-3">
                    <ParameterSlider name="componentSpacing" label="Component Spacing" min="0" max="200" step="1" value={params.componentSpacing} onChange={handleParamChange} />
                    <ParameterSlider name="netLengthWeight" label="Net Length Weight" min="0" max="0.1" step="0.001" value={params.netLengthWeight} onChange={handleParamChange} />
                    <ParameterSlider name="boardEdgeConstraint" label="Board Edge Constraint" min="0" max="50" step="0.5" value={params.boardEdgeConstraint} onChange={handleParamChange} />
                    <ParameterSlider name="settlingSpeed" label="Settling Speed (Damping)" min="0.8" max="0.99" step="0.01" value={params.settlingSpeed} onChange={handleParamChange} />

                    {selectedAgent && (
                         <div className="pt-3 border-t border-gray-600">
                            <h4 className="font-semibold text-indigo-300 mb-2">Selected: {selectedAgent.id}</h4>
                             <ParameterSlider name="placementInertia" label="Placement Inertia" min="0.1" max="20" step="0.1" value={selectedAgent.placementInertia} onChange={handleAgentParamChange} />
                         </div>
                    )}
                </div>
            </div>
        );
    `
};

export const UI_LAYOUT_HEURISTICS_TOOLS: ToolCreatorPayload[] = [
    LAYOUT_HEURISTICS_TUNER_TOOL_PAYLOAD,
];