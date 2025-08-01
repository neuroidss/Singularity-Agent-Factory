
import React, { useState, useEffect, useRef } from 'react';
import { BeakerIcon } from '../icons';

interface DebugLogViewProps {
    logs: string[];
    onReset: () => void;
    apiCallCount: number;
    apiCallLimit: number;
}

const DebugLogView: React.FC<DebugLogViewProps> = ({ logs, onReset, apiCallCount, apiCallLimit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const isUnlimited = apiCallLimit === -1;
    const usagePercentage = !isUnlimited && apiCallLimit > 0 ? (apiCallCount / apiCallLimit) * 100 : 0;
    let usageColorClass = 'text-green-400';
    if (usagePercentage > 90) {
        usageColorClass = 'text-red-500';
    } else if (usagePercentage > 70) {
        usageColorClass = 'text-yellow-400';
    }
    
    const getLogColor = (log: string) => {
        const upperCaseLog = log.toUpperCase();
        if (upperCaseLog.includes('[API CALL')) return 'text-cyan-400';
        if (upperCaseLog.includes('[ERROR]')) return 'text-red-400';
        if (upperCaseLog.includes('[WARN]')) return 'text-yellow-400';
        if (upperCaseLog.includes('[SUCCESS]')) return 'text-green-400';
        if (upperCaseLog.includes('💡')) return 'text-yellow-300 bg-yellow-900/30 p-1 rounded';
        return 'text-slate-300';
    };

    const apiLimitDisplay = isUnlimited ? '∞' : apiCallLimit;

    return (
        <div className="fixed bottom-4 right-4 z-[100]">
            <div className={`absolute bottom-full right-0 mb-2 w-96 max-w-[calc(100vw-2rem)] h-96 bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded-lg p-2 flex-col ${isOpen ? 'flex' : 'hidden'}`}>
                <div className="flex justify-between items-center mb-2 gap-2">
                    <h3 className="text-lg font-bold text-slate-200">Event Log</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onReset}
                            className="text-xs px-2 py-1 bg-red-800/50 text-red-300 border border-red-700 rounded-md hover:bg-red-700/50"
                            title="Reset all progress and saved data"
                        >
                            Reset Progress
                        </button>
                         <button
                            onClick={() => setIsOpen(false)}
                            className="text-slate-400 hover:text-white"
                            aria-label="Close log"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
                <div ref={logsContainerRef} className="flex-grow overflow-y-auto bg-black/30 p-2 rounded text-xs font-mono scroll-smooth">
                    {logs.map((log, index) => {
                        const isApiCall = log.toUpperCase().includes('[API CALL');
                        return (
                            <div key={index} className={`py-0.5 border-b border-slate-800 flex items-start gap-1.5 ${getLogColor(log)}`}>
                                {isApiCall && <BeakerIcon className="h-4 w-4 flex-shrink-0" />}
                                <p className="flex-grow break-words">{log}</p>
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className="flex items-center gap-2">
                 <div title="API Calls Used Today" className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg shadow-lg border border-slate-700">
                     <BeakerIcon className="h-5 w-5 text-cyan-400" />
                     <span className={`font-mono text-sm font-bold ${usageColorClass}`}>{apiCallCount} / {apiLimitDisplay}</span>
                 </div>
                 <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-slate-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg hover:bg-slate-700 flex items-center gap-2 border border-slate-700"
                    aria-label="Toggle debug log"
                    aria-expanded={isOpen}
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zM10 15a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
                    </svg>
                    Log ({logs.length})
                </button>
            </div>
        </div>
    );
};

export default DebugLogView;
