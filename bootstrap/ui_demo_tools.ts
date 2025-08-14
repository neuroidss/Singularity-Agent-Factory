

import type { ToolCreatorPayload } from '../types';

export const UI_DEMO_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Demo Workflow Viewer',
        description: 'Displays the steps of a demo workflow and tracks their execution status based on logs.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide clear, step-by-step feedback during a simulated workflow run.',
        parameters: [
            { name: 'workflow', type: 'array', description: 'The array of AIToolCall steps in the workflow.', required: true },
            { name: 'kicadLog', type: 'array', description: 'The log of events from the KiCad manager.', required: true },
            { name: 'elapsedTime', type: 'number', description: 'Time elapsed since the demo started.', required: true },
        ],
        implementationCode: `
            const timeFormatted = new Date(elapsedTime * 1000).toISOString().substr(14, 5);

            const wasCompleted = React.useCallback((step) => {
                const lowerCaseName = step.name.toLowerCase();
                return kicadLog.some(log => {
                    const lowerLog = log.toLowerCase();
                    // A log entry is considered a success if it starts with the checkmark emoji.
                    if (!log.startsWith('✔️')) return false;
                    
                    // Match specific keywords for each step to avoid ambiguity.
                    if (lowerCaseName.includes('define kicad component')) return lowerLog.includes('component') && lowerLog.includes('defined');
                    if (lowerCaseName.includes('define kicad net')) return lowerLog.includes('net') && lowerLog.includes('defined');
                    if (lowerCaseName.includes('define kicad layout rules')) return lowerLog.includes('layout rules for project');
                    if (lowerCaseName.includes('generate kicad netlist')) return lowerLog.includes('netlist generated');
                    if (lowerCaseName.includes('create initial pcb')) return lowerLog.includes('initial pcb created');
                    if (lowerCaseName.includes('create board outline')) return lowerLog.includes('board outline created');
                    if (lowerCaseName.includes('arrange components')) return lowerLog.includes('extracted layout data');
                    if (lowerCaseName.includes('update kicad component positions')) return lowerLog.includes('component positions updated');
                    if (lowerCaseName.includes('autoroute pcb')) return lowerLog.includes('autorouting complete');
                    if (lowerCaseName.includes('export fabrication files')) return lowerLog.includes('fabrication files exported');
                    if (lowerCaseName.includes('task complete')) return lowerLog.includes('task complete');

                    return false;
                });
            }, [kicadLog]);

            const firstPendingIndex = React.useMemo(() => {
                return workflow.findIndex(step => !wasCompleted(step));
            }, [workflow, wasCompleted]);
            
            const getStepStatus = (index) => {
                if (firstPendingIndex === -1 || index < firstPendingIndex) {
                    return { icon: '✅', color: 'text-green-400' };
                }
                if (index === firstPendingIndex) {
                    return { icon: '⏳', color: 'text-yellow-300 animate-pulse' };
                }
                return { icon: '⚪', color: 'text-gray-500' };
            };

            return (
                <div className="flex-grow flex flex-col min-h-0">
                   <div className="flex justify-between items-center text-sm mb-2">
                        <span className="font-semibold text-purple-300">Running Simulation...</span>
                        <span className="font-mono text-gray-300">{timeFormatted}</span>
                    </div>
                    <div className="flex-grow bg-black/20 rounded p-2 min-h-[50px] overflow-y-auto space-y-2">
                        {workflow.map((step, index) => {
                             const status = getStepStatus(index);
                             return (
                                <div key={index} className={\`p-2 rounded-lg bg-gray-900/50 border-l-4 \${status.color.includes('yellow') ? 'border-yellow-400' : status.color.includes('green') ? 'border-green-500' : 'border-gray-600'}\`}>
                                     <div className="flex items-center justify-between text-sm">
                                         <span className={\`font-semibold \${status.color}\`}>{status.icon} {step.name}</span>
                                     </div>
                                      <p className="text-xs text-gray-400 pl-6 truncate">
                                        {Object.entries(step.arguments).map(([k, v]) => \`\${k}='\${JSON.stringify(v)}'\`).join(', ')}
                                      </p>
                                 </div>
                             )
                        })}
                    </div>
                </div>
            );
        `
    }
];