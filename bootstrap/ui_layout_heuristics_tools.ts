// bootstrap/ui_layout_heuristics_tools.ts
import type { ToolCreatorPayload } from '../types';

export const LAYOUT_HEURISTICS_TUNER_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Layout Heuristics',
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
        const defaults = {
            componentSpacing: 200.0,
            netLengthWeight: 0.03,
            distributionStrength: 0.5,
            boardPadding: 5.0,
            viaClearance: 0.6,
            proximityKp: 5.0,
            proximityKi: 0.0,
            proximityKd: 1.5,
            symmetryStrength: 10.0,
            alignmentStrength: 10.0,
            absolutePositionStrength: 10.0,
            fixedRotationStrength: 5.0,
            symmetryRotationStrength: 1.0,
            circularRotationStrength: 1.0,
        };

        const currentParams = { ...defaults, ...(params || {}) };

        const handleParamChange = (e) => {
            const { name, value } = e.target;
            setParams(prevHeuristics => ({ ...prevHeuristics, [name]: parseFloat(value) }));
        };
        
        const ParameterSlider = ({ name, label, min, max, step, value, onChange, description }) => (
            <div>
                <div className="flex justify-between items-baseline">
                  <label htmlFor={name} className="block text-sm font-medium text-gray-300">{label}</label>
                  <span className="font-mono text-cyan-300 text-sm">{typeof value === 'number' ? value.toFixed(3) : 'N/A'}</span>
                </div>
                <input
                    id={name}
                    name={name}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={typeof value === 'number' ? value : 0}
                    onChange={onChange}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mt-1"
                />
                {description && <p className="text-xs text-gray-400 mt-1 pl-1">{description}</p>}
            </div>
        );

        return (
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-3 flex flex-col h-full text-white">
                <h3 className="text-lg font-bold text-cyan-300 mb-2 text-center">Global Forces</h3>
                <div className="flex-grow overflow-y-auto px-1 space-y-4">
                    <div className="space-y-3">
                        <ParameterSlider name="componentSpacing" label="Component Repulsion" min="0" max="500" step="1" value={currentParams.componentSpacing} onChange={handleParamChange} description="Force pushing components apart to prevent overlap." />
                        <ParameterSlider name="distributionStrength" label="Center Repulsion" min="0" max="2.0" step="0.05" value={currentParams.distributionStrength} onChange={handleParamChange} description="Force pushing all components away from the center." />
                        <ParameterSlider name="netLengthWeight" label="Net Attraction Strength" min="0" max="0.2" step="0.001" value={currentParams.netLengthWeight} onChange={handleParamChange} description="Force pulling connected components together to shorten net lengths." />
                        <ParameterSlider name="boardPadding" label="Board Padding" min="0" max="20" step="0.5" value={currentParams.boardPadding} onChange={handleParamChange} description="Margin (mm) for auto-sized board outlines."/>
                        <ParameterSlider name="viaClearance" label="Via Clearance" min="0" max="1.0" step="0.05" value={currentParams.viaClearance} onChange={handleParamChange} description="Extra space (mm diameter) around courtyards for vias."/>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-600 space-y-3">
                         <h4 className="font-semibold text-cyan-400 text-base">Rule Strengths</h4>
                         <ParameterSlider name="proximityKp" label="Proximity (Kp)" min="0" max="50" step="0.1" value={currentParams.proximityKp} onChange={handleParamChange} description="PID Proportional force for proximity (stiffness)." />
                         <ParameterSlider name="proximityKd" label="Proximity (Kd)" min="0" max="10" step="0.1" value={currentParams.proximityKd} onChange={handleParamChange} description="PID Derivative force for proximity (damping)." />
                         <ParameterSlider name="absolutePositionStrength" label="Absolute Position" min="0" max="50" step="0.5" value={currentParams.absolutePositionStrength} onChange={handleParamChange} description="Force locking a component to a fixed coordinate." />
                         <ParameterSlider name="alignmentStrength" label="Alignment" min="0" max="50" step="0.5" value={currentParams.alignmentStrength} onChange={handleParamChange} description="Force aligning components along an axis." />
                         <ParameterSlider name="symmetryStrength" label="Symmetry" min="0" max="50" step="0.5" value={currentParams.symmetryStrength} onChange={handleParamChange} description="Force mirroring component pairs." />
                         <ParameterSlider name="fixedRotationStrength" label="Fixed Rotation Torque" min="0" max="20" step="0.5" value={currentParams.fixedRotationStrength} onChange={handleParamChange} description="Torque twisting a component to a fixed rotation." />
                         <ParameterSlider name="symmetryRotationStrength" label="Symmetry Rotation Torque" min="0" max="20" step="0.5" value={currentParams.symmetryRotationStrength} onChange={handleParamChange} description="Torque for symmetrical rotation." />
                         <ParameterSlider name="circularRotationStrength" label="Circular Rotation Torque" min="0" max="20" step="0.5" value={currentParams.circularRotationStrength} onChange={handleParamChange} description="Torque for circular rotation pattern." />
                    </div>
                </div>
            </div>
        );
    `
};

export const UI_LAYOUT_HEURISTICS_TOOLS: ToolCreatorPayload[] = [
    LAYOUT_HEURISTICS_TUNER_TOOL_PAYLOAD,
];