

import React, { useState, useEffect, useRef } from 'react';

interface DebugLogViewProps {
    logs: string[];
    onReset: () => void;
    apiCallCounts: Record<string, number>;
    apiCallLimit: number;
    agentCount: number;
}

const DebugLogView: React.FC<DebugLogViewProps> = ({ logs, onReset, apiCallCounts, apiCallLimit, agentCount }) => {
    const [isOpen, setIsOpen] = useState(false);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
    }, [logs, isOpen]);

    const totalCalls = React.useMemo(() => 
        Object.values(apiCallCounts || {}).reduce((sum, count) => sum + count, 0), 
    [apiCallCounts]);

    const getLogColor = (log: string) => {
        const upperCaseLog = log.toUpperCase();
        if (upperCaseLog.includes('[API CALL')) return 'text-cyan-400';
        if (upperCaseLog.includes('[ERROR]')) return 'text-red-400';
        if (upperCaseLog.includes('[WARN]')) return 'text-yellow-400';
        if (upperCaseLog.includes('[SUCCESS]')) return 'text-green-400';
        if (upperCaseLog.includes('💡')) return 'text-yellow-300 bg-yellow-900/30 p-1 rounded';
        return 'text-slate-300';
    };

    return (
        <div className="fixed bottom-4 right-4 z-[100] text-sm flex flex-col items-end gap-2">
            <div className={`w-[40rem] max-w-[calc(100vw-2rem)] h-96 bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded-lg p-2 flex-col shadow-2xl ${isOpen ? 'flex' : 'hidden'}`}>
                <div className="flex justify-between items-center mb-2 gap-2">
                    <h3 className="text-lg font-bold text-slate-200">Event Log</h3>
                    <button
                        onClick={onReset}
                        className="text-xs px-2 py-1 bg-red-800/50 text-red-300 border border-red-700 rounded-md hover:bg-red-700/50"
                        title="Reset all progress and saved data"
                    >
                        Factory Reset
                    </button>
                </div>
                <div ref={logsContainerRef} className="flex-grow overflow-y-auto bg-black/30 p-2 rounded text-xs font-mono scroll-smooth">
                    {logs.map((log, index) => (
                        <div key={index} className={`py-0.5 border-b border-slate-800/50 flex items-start gap-1.5 ${getLogColor(log)}`}>
                            <p className="flex-grow break-words whitespace-pre-wrap">{log}</p>
                        </div>
                    ))}
                </div>
            </div>
            
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 px-3 py-2 rounded-lg shadow-lg flex items-center gap-4 hover:bg-gray-700/80 transition-colors"
                aria-label="Toggle debug log"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-2 text-gray-400" title="Active Agents / API Calls">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                    <span>{agentCount}</span>
                    <span className="text-gray-600">/</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6zM10 15a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" /></svg>
                    <span>{totalCalls}</span>
                </div>
                <div className="w-px h-4 bg-gray-600"></div>
                <div className="flex items-center gap-2 text-gray-300" title="Toggle Log">
                     <span>Log ({logs.length})</span>
                     <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </button>
        </div>
    );
};

export default DebugLogView;