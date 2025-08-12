import { useState, useCallback, useEffect, useRef } from 'react';
import type { KnowledgeGraph, ExecuteActionFunction } from '../types';

type UseKnowledgeGraphManagerProps = {
    executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>;
    logEvent: (message: string) => void;
    isServerConnected: boolean;
};

export const useKnowledgeGraphManager = (props: UseKnowledgeGraphManagerProps) => {
    const { executeActionRef, logEvent, isServerConnected } = props;
    
    const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasFetchedInitially = useRef(false);

    const fetchGraph = useCallback(async () => {
        if (!isServerConnected) {
            setGraph({ nodes: [{id: 'offline', label: 'Server is offline'}], edges: [] });
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            if (!executeActionRef.current) throw new Error("Runtime not ready.");
            
            const result = await executeActionRef.current({ name: 'Read Strategic Memory', arguments: {} }, 'system-kg-fetch');
            
            if (result.executionError) {
                // Check if the error is because the tool isn't installed yet
                if (result.executionError.includes("not found")) {
                     logEvent('[WARN] Strategic Memory tool not yet installed. Graph will be empty.');
                     setGraph({ nodes: [], edges: [] });
                } else {
                    throw new Error(result.executionError);
                }
            } else {
                const graphData = JSON.parse(result.executionResult.stdout);
                setGraph(graphData);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] Failed to fetch strategic memory: ${errorMessage}`);
            setGraph({ nodes: [{id: 'error', label: 'Error loading graph'}], edges: [] });
        } finally {
            setIsLoading(false);
        }
    }, [executeActionRef, logEvent, isServerConnected]);

    useEffect(() => {
        // Fetch only if server is connected and we haven't done the initial fetch
        if (isServerConnected && !hasFetchedInitially.current) {
            // Delay slightly to allow installer tools to run on first connection
            const timer = setTimeout(() => {
                fetchGraph();
                hasFetchedInitially.current = true;
            }, 1000);
            return () => clearTimeout(timer);
        } else if (!isServerConnected) {
            // Reset if server disconnects
            hasFetchedInitially.current = false;
            setGraph(null);
            setIsLoading(true);
        }
    }, [isServerConnected, fetchGraph]);

    return {
        state: { graph, isLoading },
        handlers: { fetchGraph },
    };
};
