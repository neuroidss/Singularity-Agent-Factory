
import { useState, useCallback, useEffect, useRef } from 'react';
import type { KnowledgeGraph, ExecuteActionFunction } from '../types';

type UseKnowledgeGraphManagerProps = {
    logEvent: (message: string) => void;
};

export const useKnowledgeGraphManager = (props: UseKnowledgeGraphManagerProps) => {
    const { logEvent } = props;
    
    const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const graphStateRef = useRef(graph);
    graphStateRef.current = graph;

    const fetchGraph = useCallback(async () => {
        setIsLoading(true);
        // In client-only mode, "fetching" means initializing the state if it's null.
        if (graphStateRef.current === null) {
            setGraph({ nodes: [], edges: [] });
            logEvent('[INFO] Initialized empty strategic memory.');
        } else {
            // It's already loaded, just simulate a refresh.
            setGraph(currentGraph => ({...currentGraph}));
            logEvent('[INFO] Refreshed strategic memory view.');
        }
        setIsLoading(false);
    }, [logEvent]);

    useEffect(() => {
        // Fetch graph on initial load
        fetchGraph();
    }, [fetchGraph]);

    return {
        state: { graph, isLoading },
        handlers: { fetchGraph, setGraph },
        graphStateRef,
    };
};