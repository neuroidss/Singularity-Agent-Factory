

import type { ToolCreatorPayload } from '../types';

export const UI_WORKFLOW_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Interactive Workflow Controller',
        description: 'An interactive panel for controlling a scripted workflow, similar to a Jupyter notebook, with play, pause, step, and run-from-here functionality.',
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose: 'To provide detailed, interactive control and visibility over a scripted agent workflow for debugging and analysis.',
        parameters: [
            { name: 'workflow', type: 'array', description: 'The array of AIToolCall steps in the workflow.', required: true },
            { name: 'executionState', type: 'string', description: 'The current state of the execution engine (running, paused, idle, etc.).', required: true },
            { name: 'currentStepIndex', type: 'number', description: 'The index of the step that will be executed next.', required: true },
            { name: 'stepStatuses', type: 'array', description: 'An array tracking the status and result of each step.', required: true },
            { name: 'onPlayPause', type: 'object', description: 'Callback to play or pause the execution.', required: true },
            { name: 'onStop', type: 'object', description: 'Callback to stop and reset the execution.', required: true },
            { name: 'onStepForward', type: 'object', description: 'Callback to execute the next step.', required: true },
            { name: 'onStepBackward', type: 'object', description: 'Callback to move the execution pointer back one step.', required: true },
            { name: 'onRunFromStep', type: 'object', description: 'Callback to start execution from a specific step.', required: true },
        ],
        implementationCode: `
            const scrollRef = React.useRef(null);

            React.useEffect(() => {
                const currentStepElement = scrollRef.current?.children[currentStepIndex];
                if (currentStepElement) {
                    currentStepElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, [currentStepIndex]);

            const isRunning = executionState === 'running';
            const canControl = executionState === 'running' || executionState === 'paused';

            return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-0 flex flex-col h-full text-sm">
                   <div className="flex-shrink-0 flex items-center justify-between bg-gray-900/50 p-2 rounded-t-xl border-b border-gray-700">
                        <span className="font-semibold text-purple-300 px-2">Workflow Controller</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onPlayPause}
                                disabled={!canControl}
                                title={isRunning ? 'Pause' : 'Play'}
                                className="p-1.5 rounded-full bg-gray-700 text-white hover:bg-indigo-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            >
                                {isRunning ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                            </button>
                             <button
                                onClick={onStepForward}
                                disabled={isRunning}
                                title="Step Forward"
                                className="p-1.5 rounded-full bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            >
                                <StepForwardIcon className="w-5 h-5" />
                            </button>
                            <button
                                onClick={onStop}
                                title="Stop"
                                className="p-1.5 rounded-full bg-red-800/80 text-white hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            >
                                <StopIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div ref={scrollRef} className="flex-grow bg-black/20 rounded-b-xl p-2 min-h-[50px] overflow-y-auto space-y-2">
                        {workflow.map((step, index) => {
                             const statusInfo = stepStatuses[index] || { status: 'pending' };
                             const isCurrent = index === currentStepIndex && canControl;
                             
                             let statusIcon = '⚪'; let borderColor = 'border-gray-700'; let statusTextColor = 'text-gray-400';
                             if (statusInfo.status === 'completed') { statusIcon = '✅'; borderColor = 'border-green-600/70'; statusTextColor = 'text-green-400'; }
                             if (statusInfo.status === 'error') { statusIcon = '❌'; borderColor = 'border-red-600/70'; statusTextColor = 'text-red-400'; }
                             if (isCurrent) { statusIcon = isRunning ? '▶️' : '⏸️'; borderColor = 'border-indigo-500'; statusTextColor = 'text-indigo-400'; }

                             return (
                                <div
                                    key={index}
                                    className={"p-2 rounded-lg bg-gray-900/50 border-l-4 " + borderColor + (isCurrent ? ' ring-1 ring-indigo-500/80' : '') + " flex items-start gap-3 group transition-all duration-200"}
                                >
                                     <div className="flex flex-col items-center">
                                         <span className="font-mono text-xs text-gray-500">{index + 1}</span>
                                         <button
                                            onClick={() => onRunFromStep(index)}
                                            title="Run from this step"
                                            className="mt-1 p-1 rounded-full text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-600 hover:text-white"
                                         >
                                             <PlayIcon className="w-4 h-4"/>
                                         </button>
                                     </div>
                                     <div className="flex-grow">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className={"font-semibold flex items-center gap-2 " + statusTextColor}>
                                                <span>{statusIcon}</span>
                                                <span>{step.name}</span>
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1 pl-1 font-mono break-all opacity-80">
                                            {JSON.stringify(step.arguments)}
                                        </p>
                                        {statusInfo.error && <p className="text-xs text-red-400 mt-1 pl-1">Error: {statusInfo.error}</p>}
                                    </div>
                                 </div>
                             )
                        })}
                    </div>
                </div>
            );
        `
    }
];
