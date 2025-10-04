
import { useState, useCallback, useRef, useEffect } from 'react';
import type { KnowledgeGraph } from '../types';
import { INNOVATION_KNOWLEDGE_GRAPH } from '../bootstrap/initial_knowledge_graph';
import { generateEmbeddings } from '../services/embeddingService';

type UseKnowledgeGraphManagerProps = {
    logEvent: (message: string) => void;
    executeTool: (toolName: string, args: any) => Promise<any>;
};

export const useKnowledgeGraphManager = (props: UseKnowledgeGraphManagerProps) => {
    const { logEvent, executeTool } = props;
    
    const [graph, setGraph] = useState<KnowledgeGraph | null>(INNOVATION_KNOWLEDGE_GRAPH);
    const [isLoading, setIsLoading] = useState(false);
    const [isEmbedding, setIsEmbedding] = useState(false);
    const [nodeEmbeddings, setNodeEmbeddings] = useState<Map<string, number[]>>(new Map());
    
    const graphStateRef = useRef(graph);
    graphStateRef.current = graph;

    const fetchGraph = useCallback(async () => {
        setIsLoading(true);
        logEvent('[INFO] Re-initializing knowledge graph with default project data.');
        setGraph(INNOVATION_KNOWLEDGE_GRAPH);
        // Reset embeddings when graph is reloaded
        setNodeEmbeddings(new Map());
        setIsLoading(false);
    }, [logEvent]);
    
    // Effect to generate embeddings when the graph is loaded
    useEffect(() => {
        const embedNodes = async () => {
            if (!graph || graph.nodes.length === 0 || nodeEmbeddings.size > 0 || isEmbedding) {
                return;
            }

            setIsEmbedding(true);
            try {
                const nodeTexts = graph.nodes.map(n => n.label);
                const embeddings = await generateEmbeddings(nodeTexts, (msg) => logEvent(msg));
                
                const newEmbeddingMap = new Map<string, number[]>();
                graph.nodes.forEach((node, index) => {
                    newEmbeddingMap.set(node.id, embeddings[index]);
                });
                setNodeEmbeddings(newEmbeddingMap);

            } catch (e) {
                logEvent(`[ERROR] Failed to generate embeddings for knowledge graph: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsEmbedding(false);
            }
        };
        // embedNodes(); // Prevent auto-loading on startup
    }, [graph, nodeEmbeddings.size, isEmbedding, logEvent]);

    const innovationGraphViewerProps = {
        graph,
        isLoading,
        isEmbedding,
        nodeEmbeddings,
        onRefresh: fetchGraph,
        executeTool,
    };

    return {
        state: { graph, isLoading, isEmbedding, nodeEmbeddings },
        handlers: { fetchGraph, setGraph },
        graphStateRef,
        innovationGraphViewerProps, // Pass down a convenient props object
    };
};
