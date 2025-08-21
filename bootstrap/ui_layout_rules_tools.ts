// bootstrap/ui_layout_rules_tools.ts

import type { ToolCreatorPayload } from '../types';

export const LAYOUT_RULES_EDITOR_TOOL_PAYLOAD: ToolCreatorPayload = {
    name: 'Layout Rules Editor',
    description: 'A UI panel for interactively viewing, enabling/disabling, and managing PCB layout constraints during a simulation.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide real-time control and feedback over the layout rules, allowing for interactive debugging and fine-tuning of the component arrangement.',
    parameters: [
        { name: 'rules', type: 'array', description: 'The array of current layout rules.', required: true },
        { name: 'onUpdateRules', type: 'object', description: 'Callback function to update the rules array with the new, complete list of rules.', required: true },
    ],
    implementationCode: `
console.log('[DEBUG] Layout Rules Editor rendered. Received rules count:', (props.rules || []).length);

const RULE_DEFINITIONS = {
    'ProximityConstraint': [{ name: 'groupsJSON', type: 'textarea', placeholder: '[["U1", "C1"]]' }],
    'AlignmentConstraint': [{ name: 'axis', type: 'select', options: ['vertical', 'horizontal'] }, { name: 'componentsJSON', type: 'textarea', placeholder: '["J1", "J2"]' }],
    'SymmetryConstraint': [{ name: 'axis', type: 'select', options: ['vertical', 'horizontal'] }, { name: 'pairsJSON', type: 'textarea', placeholder: '[["C1", "C2"]]' }],
    'CircularConstraint': [{ name: 'componentsJSON', type: 'textarea', placeholder: '["J1", "J2"]' }, { name: 'radius', type: 'number', placeholder: '12.5' }, { name: 'centerX', type: 'number', placeholder: '0' }, { name: 'centerY', type: 'number', placeholder: '0' }],
    'LayerConstraint': [{ name: 'layer', type: 'select', options: ['top', 'bottom'] }, { name: 'componentsJSON', type: 'textarea', placeholder: '["J1", "J2"]' }],
    'AbsolutePositionConstraint': [{ name: 'componentReference', type: 'text', placeholder: 'U1' }, { name: 'x', type: 'number', placeholder: '10.0' }, { name: 'y', type: 'number', placeholder: '15.5' }],
    'FixedPropertyConstraint': [{ name: 'componentReference', type: 'text', placeholder: 'J1' }, { name: 'propertiesJSON', type: 'textarea', placeholder: '{"rotation": 90}' }],
    'SymmetricalPairConstraint': [{ name: 'pairJSON', type: 'textarea', placeholder: '["J_A", "J_B"]' }, { name: 'axis', type: 'select', options: ['vertical', 'horizontal'] }, { name: 'separation', type: 'number', placeholder: '17.78' }],
};

// By memoizing the form, we prevent it from re-rendering unless its props change.
// The key is to ensure the \`onAdd\` and \`onCancel\` props are stable function references.
const AddRuleForm = React.memo(({ onAdd, onCancel }) => {
    const [ruleType, setRuleType] = React.useState('ProximityConstraint');
    const [args, setArgs] = React.useState({});

    const handleArgChange = (name, value) => {
        setArgs(prev => ({ ...prev, [name]: value }));
    };

    const handleTypeChange = (e) => {
        setRuleType(e.target.value);
        setArgs({});
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const newRule = { type: ruleType, enabled: true, ...args };
        if (newRule.type === 'AbsolutePositionConstraint' && newRule.componentReference) {
            newRule.component = newRule.componentReference;
            delete newRule.componentReference;
        }
        if (newRule.type === 'FixedPropertyConstraint' && newRule.componentReference) {
            newRule.component = newRule.componentReference;
            delete newRule.componentReference;
        }
        onAdd(newRule);
        setArgs({}); // Clear form for next entry
    };

    return (
        <form onSubmit={handleSubmit} className="p-2 bg-gray-900/70 border border-indigo-700 rounded-lg space-y-3 mb-2">
            <select value={ruleType} onChange={handleTypeChange} className="w-full bg-gray-800 border-gray-600 rounded p-1.5 text-sm">
                {Object.keys(RULE_DEFINITIONS).map(key => <option key={key} value={key}>{key.replace(/([A-Z])/g, ' $1').trim()}</option>)}
            </select>
            {RULE_DEFINITIONS[ruleType].map(param => {
                const value = args[param.name] || (param.type === 'select' ? param.options[0] : '');
                const placeholder = param.placeholder || param.name;
                if (param.type === 'textarea') return <textarea key={param.name} value={value} onChange={e => handleArgChange(param.name, e.target.value)} placeholder={placeholder} className="w-full h-20 bg-gray-800 border-gray-600 rounded p-1.5 text-sm font-mono" required />;
                if (param.type === 'select') return <select key={param.name} value={value} onChange={e => handleArgChange(param.name, e.target.value)} className="w-full bg-gray-800 border-gray-600 rounded p-1.5 text-sm">{param.options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}</select>;
                return <input key={param.name} type={param.type} value={value} onChange={e => handleArgChange(param.name, param.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} placeholder={placeholder} className="w-full bg-gray-800 border-gray-600 rounded p-1.5 text-sm" required />;
            })}
            <div className="flex gap-2">
                <button type="button" onClick={onCancel} className="flex-1 text-center bg-gray-600 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-gray-500">Cancel</button>
                <button type="submit" className="flex-1 text-center bg-indigo-600 text-white font-semibold py-1.5 px-3 rounded-lg hover:bg-indigo-500">Add Rule</button>
            </div>
        </form>
    );
});

const [showForm, setShowForm] = React.useState(false);

// *** THE FIX: STABILIZE ALL CALLBACKS ***
// We use refs to hold the latest version of props that change on every render.
// This allows our useCallback hooks to have stable identities because they don't
// need to list the changing props in their dependency arrays.
const onUpdateRulesRef = React.useRef(props.onUpdateRules);
onUpdateRulesRef.current = props.onUpdateRules; // Update ref on each render

const rulesRef = React.useRef(props.rules);
rulesRef.current = props.rules; // Update ref on each render

// These callbacks are now stable (created only once) because their dependency array is empty.
// They use the refs to access the *current* props when they are called.
const handleToggle = React.useCallback((index) => {
    const newRules = [...(rulesRef.current || [])];
    newRules[index].enabled = !newRules[index].enabled;
    onUpdateRulesRef.current(newRules);
}, []); // Empty dependency array means this function reference is stable

const handleDelete = React.useCallback((index) => {
    const newRules = (rulesRef.current || []).filter((_, i) => i !== index);
    onUpdateRulesRef.current(newRules);
}, []); // Empty dependency array means this function reference is stable

const handleAddRule = React.useCallback((newRule) => {
    onUpdateRulesRef.current([...(rulesRef.current || []), newRule]);
    setShowForm(false); // Hide form after adding
}, []); // Empty dependency array means this function reference is stable

const handleCancelForm = React.useCallback(() => {
    setShowForm(false);
}, []); // Empty dependency array means this function reference is stable

const formatRuleValue = (value) => {
    if (Array.isArray(value)) return \`[\${value.join(', ')}]\`;
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return String(value);
};

return (
    <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-700 rounded-xl p-2 flex flex-col h-full text-white">
        <div className="flex justify-between items-center px-2 mb-2">
            <h3 className="text-lg font-bold text-cyan-300">Layout Rules</h3>
            <button onClick={() => setShowForm(prev => !prev)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1 px-2 rounded">{showForm ? '−' : '+'}</button>
        </div>
        
        {showForm && <AddRuleForm onAdd={handleAddRule} onCancel={handleCancelForm} />}
        
        <div className="flex-grow overflow-y-auto pr-1 space-y-2">
            {(props.rules || []).map((rule, index) => (
                <div key={index} className={\`p-2 rounded-lg bg-gray-900/50 border \${rule.enabled ? 'border-cyan-700/80' : 'border-gray-700'} transition-colors\`}>
                   <div className="flex justify-between items-center">
                        <span className="font-semibold text-sm truncate pr-2">{rule.type.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(index)} title="Delete Rule" className="text-red-400 hover:text-red-300 text-lg font-bold">&times;</button>
                            <div className="flex items-center">
                                <input type="checkbox" checked={!!rule.enabled} onChange={() => handleToggle(index)} className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"/>
                            </div>
                        </div>
                   </div>
                   <div className="mt-1 pl-4 text-xs text-gray-400 font-mono space-y-0.5">
                        {Object.entries(rule).filter(([k]) => !['type', 'enabled'].includes(k)).map(([key, value]) => (
                            <div key={key} className="truncate"><span className="text-cyan-400">{key}:</span> {formatRuleValue(value)}</div>
                        ))}
                   </div>
                </div>
            ))}
            {(!props.rules || props.rules.length === 0) && <p className="text-sm text-gray-500 text-center py-4">No layout rules defined.</p>}
        </div>
    </div>
);
`
};

export const LAYOUT_RULES_TOOLS: ToolCreatorPayload[] = [
    LAYOUT_RULES_EDITOR_TOOL_PAYLOAD,
];