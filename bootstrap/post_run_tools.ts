import type { ToolCreatorPayload } from '../types';

export const WORKFLOW_CAPTURE_PANEL_TOOL: ToolCreatorPayload = {
    name: 'Workflow Capture Panel',
    description: 'Displays the captured workflow from the last agent run, allowing it to be copied for debugging and deterministic replay.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a crucial debugging tool by allowing developers to capture and replay agent behavior.',
    parameters: [
        { name: 'history', type: 'array', description: 'The history of EnrichedAIResponse from the last run.', required: true },
        { name: 'onClose', type: 'object', description: 'Function to close the panel.', required: true },
    ],
    implementationCode: `
        const [copyStatus, setCopyStatus] = React.useState('Copy Script');

        const workflowScript = React.useMemo(() => {
            const toolCalls = history
                .map(item => item.toolCall)
                .filter(Boolean);

            const formattedCalls = toolCalls.map(call => {
                const argsString = JSON.stringify(call.arguments, null, 4)
                    .split('\\n')
                    .map((line, index) => index > 0 ? '        ' + line : line)
                    .join('\\n');

                return \`    {
        name: '\${call.name}',
        arguments: \${argsString}
    }\`;
            }).join(',\\n');
            
            return \`import type { AIToolCall } from '../types';\\n\\nexport const CAPTURED_WORKFLOW: AIToolCall[] = [\\n\${formattedCalls}\\n];\`;
        }, [history]);

        const handleCopy = () => {
            navigator.clipboard.writeText(workflowScript).then(() => {
                setCopyStatus('Copied!');
                setTimeout(() => setCopyStatus('Copy Script'), 2000);
            }, () => {
                setCopyStatus('Failed!');
                setTimeout(() => setCopyStatus('Copy Script'), 2000);
            });
        };

        return (
            <div className="bg-gray-800/80 border-2 border-green-500/60 rounded-xl p-4 shadow-lg flex flex-col h-full">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-bold text-green-300">Workflow Run Captured</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-bold">&times;</button>
                </div>
                <p className="text-sm text-gray-300 mb-2">
                    The agent's workflow has been captured. You can copy the script below and paste it into <code>demo_workflow.ts</code> to replay it for debugging.
                </p>
                <div className="flex-grow bg-black/30 rounded-lg overflow-hidden relative font-mono text-sm border border-gray-700">
                    <pre className="p-4 h-full overflow-auto text-cyan-200"><code>{workflowScript}</code></pre>
                    <button onClick={handleCopy} className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-colors">
                        {copyStatus}
                    </button>
                </div>
                <button onClick={onClose} className="mt-4 w-full text-center bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-indigo-700">
                    Dismiss
                </button>
            </div>
        );
    `
};