
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
        const handleParamChange = (e) => {
            const { name, value } = e.target;
            setParams(prev => ({ ...prev, [name]: parseFloat(value) }));
        };
        
        const handleAgentParamChange = (e) => {
            if (!selectedAgent) return;
            const { name, value } = e.target;
            updateAgent(selectedAgent.id, name, parseFloat(value));
        };
        
        const ParameterSlider = ({ name, label, min, max, step, value, onChange, unit, description }) => (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-300">{label}: <span className="font-bold text-white">{(typeof value === 'number') ? value.toFixed(name === 'netLengthWeight' ? 3 : 2) : 'N/A'}</span> {unit}</label>
                <input
                    id={name}
                    name={name}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value || 0}
                    onChange={onChange}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mt-1"
                />
                {description && <p className="text-xs text-gray-400 mt-1 pl-1">{description}</p>}
            </div>
        );

        return (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 flex flex-col h-full text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Layout Heuristics</h3>
                <div className="flex-grow overflow-y-auto p-2 space-y-4">
                    <h4 className="font-semibold text-cyan-400 -mb-2">Global Forces</h4>
                    <ParameterSlider name="componentSpacing" label="Component Repulsion" min="0" max="200" step="1" value={params.componentSpacing} onChange={handleParamChange} description="Force pushing components apart to prevent overlap." />
                    <ParameterSlider name="netLengthWeight" label="Net Attraction Strength" min="0" max="0.1" step="0.001" value={params.netLengthWeight} onChange={handleParamChange} description="Force pulling connected components together to shorten net lengths." />
                    <ParameterSlider name="boardEdgeConstraint" label="Board Edge Force" min="0" max="50" step="0.5" value={params.boardEdgeConstraint} onChange={handleParamChange} description="Force pushing components away from the board edges."/>
                    
                    <div className="pt-3 border-t border-gray-600 space-y-4">
                         <h4 className="font-semibold text-cyan-400 -mb-2">Rule Strengths</h4>
                         <ParameterSlider name="absolutePositionStrength" label="Absolute Position Strength" min="0" max="50" step="0.5" value={params.absolutePositionStrength} onChange={handleParamChange} description="Force pulling a component to its fixed X, Y coordinates." />
                         <ParameterSlider name="fixedRotationStrength" label="Fixed Rotation Strength" min="0" max="50" step="0.5" value={params.fixedRotationStrength} onChange={handleParamChange} description="Torque twisting a component to its fixed rotation." />
                         <ParameterSlider name="proximityStrength" label="Proximity Strength" min="0" max="5" step="0.1" value={params.proximityStrength} onChange={handleParamChange} description="Force pulling components in proximity groups together." />
                         <ParameterSlider name="alignmentStrength" label="Alignment Strength" min="0" max="10" step="0.1" value={params.alignmentStrength} onChange={handleParamChange} description="Force aligning components along an axis." />
                         <ParameterSlider name="symmetryStrength" label="Symmetry Strength" min="0" max="10" step="0.1" value={params.symmetryStrength} onChange={handleParamChange} description="Force mirroring component pairs across an axis." />
                         <ParameterSlider name="symmetryRotationStrength" label="Symmetry Rotation Strength" min="0" max="10" step="0.1" value={params.symmetryRotationStrength} onChange={handleParamChange} description="Torque twisting components into symmetrical alignment." />
                         <ParameterSlider name="circularStrength" label="Circular Strength" min="0" max="10" step="0.1" value={params.circularStrength} onChange={handleParamChange} description="Force arranging components in a circle." />
                         <ParameterSlider name="circularRotationStrength" label="Circular Rotation Strength" min="0" max="10" step="0.1" value={params.circularRotationStrength} onChange={handleParamChange} description="Torque orienting components in a circular pattern." />
                         <ParameterSlider name="symmetricalPairStrength" label="Symmetrical Pair Strength" min="0" max="20" step="0.5" value={params.symmetricalPairStrength} onChange={handleParamChange} description="Force maintaining separation for symmetrical pairs." />
                    </div>

                    <div className="pt-3 border-t border-gray-600 space-y-4">
                        <h4 className="font-semibold text-cyan-400 -mb-2">Simulation Physics</h4>
                        <ParameterSlider name="settlingSpeed" label="Settling Speed (Damping)" min="0.8" max="0.99" step="0.01" value={params.settlingSpeed} onChange={handleParamChange} description="How quickly the simulation stabilizes. Higher is slower." />
                        {selectedAgent && (
                             <div>
                                <h4 className="font-semibold text-indigo-300 mt-4 mb-2">Selected: {selectedAgent.id}</h4>
                                <ParameterSlider name="placementInertia" label="Placement Inertia (Mass)" min="0.1" max="20" step="0.1" value={selectedAgent.placementInertia} onChange={handleAgentParamChange} description="Resistance of this component to being moved by forces."/>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        );
    `
};

export const UI_LAYOUT_HEURISTICS_TOOLS: ToolCreatorPayload[] = [
    LAYOUT_HEURISTICS_TUNER_TOOL_PAYLOAD,
];
