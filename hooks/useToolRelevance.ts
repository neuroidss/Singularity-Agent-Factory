import { useState, useCallback, useEffect, useRef } from 'react';
import { generateEmbeddings, cosineSimilarity } from '../services/embeddingService';
import { CORE_TOOLS } from '../constants';
import type { LLMTool, ScoredTool } from '../types';

export const useToolRelevance = ({ allTools, logEvent }: { allTools: LLMTool[], logEvent: (msg: string) => void }) => {
    const [toolEmbeddings, setToolEmbeddings] = useState<Map<string, number[]>>(new Map());
    const isEmbeddingTools = useRef(false);
    
    // Using a ref to track initialization status to avoid re-runs and state dependency issues.
    const embeddingsInitialized = useRef(false);

    // This function ensures all tools are embedded before use. It's now called lazily.
    const ensureToolEmbeddings = useCallback(async () => {
        // Exit if already initialized, or if another process is already running.
        if (embeddingsInitialized.current || isEmbeddingTools.current) {
            return;
        }
        
        // Prevent concurrent runs.
        isEmbeddingTools.current = true;
        
        // Inform the user about the one-time setup cost.
        logEvent(`[Embeddings] First-time setup: processing ${allTools.length} tools. This may take a moment...`);
        
        try {
            const textsToEmbed = allTools.map(tool => {
                const parametersJson = JSON.stringify(tool.parameters.map(p => ({ name: p.name, type: p.type, description: p.description })));
                return `Tool: ${tool.name}. Purpose: ${tool.purpose || 'Not specified'}. Description: ${tool.description}. Parameters: ${parametersJson}`;
            });
            
            // This will trigger the model load and show progress via onProgress.
            const embeddings = await generateEmbeddings(textsToEmbed, (msg) => logEvent(`[Embeddings] ${msg}`));
            
            const newEmbeddings = new Map<string, number[]>();
            allTools.forEach((tool, index) => {
                newEmbeddings.set(tool.id, embeddings[index]);
            });

            setToolEmbeddings(newEmbeddings);
            embeddingsInitialized.current = true; // Mark as initialized
            logEvent(`[Embeddings] Cache created successfully. Total embedded: ${allTools.length} tools.`);

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] Failed to generate tool embeddings: ${errorMsg}`);
            embeddingsInitialized.current = false; // Allow retry on next call
            throw e; // Re-throw to fail the parent function
        } finally {
            isEmbeddingTools.current = false; // Release the lock
        }
    }, [allTools, logEvent]);


    const findRelevantTools = useCallback(async (
        userRequestText: string, 
        availableTools: LLMTool[],
        topK: number,
        relevanceThreshold: number,
        systemPromptForContext: string | null = null
    ): Promise<ScoredTool[]> => {
        try {
            // Lazily compute tool embeddings on the first call.
            await ensureToolEmbeddings();

            let contextForEmbedding = "";
            if (systemPromptForContext) {
                contextForEmbedding += `System Goal: ${systemPromptForContext}\n\n`;
            }
            contextForEmbedding += `User's Current Task: ${userRequestText}`;

            if (!contextForEmbedding.trim()) {
                logEvent('[WARN] No context available for tool relevance search. Providing all tools.');
                return availableTools.map(tool => ({ tool, score: 0 }));
            }

            // The model is now loaded, so this call should be fast.
            const [contextEmbedding] = await generateEmbeddings([contextForEmbedding], (msg) => logEvent(`[Embeddings] ${msg}`));
            
            // Score all available tools against the context.
            const scoredTools = availableTools.map(tool => {
                const toolEmbedding = toolEmbeddings.get(tool.id);
                // If a tool somehow wasn't embedded (e.g., added dynamically after init), score it as 0.
                if (!toolEmbedding) return { tool, score: 0 };
                const score = cosineSimilarity(contextEmbedding, toolEmbedding);
                return { tool, score };
            }).sort((a, b) => b.score - a.score);

            const relevantScoredTools = scoredTools
                .filter(item => item.score >= relevanceThreshold)
                .slice(0, topK);

            const relevantToolIds = new Set(relevantScoredTools.map(item => item.tool.id));
            
            // Always ensure CORE_TOOLS are available, regardless of score.
            for (const coreTool of CORE_TOOLS) {
                if (!relevantToolIds.has(coreTool.id)) {
                    const coreToolScoreItem = scoredTools.find(st => st.tool.id === coreTool.id);
                    relevantScoredTools.push(coreToolScoreItem || { tool: coreTool, score: 0 });
                }
            }
            
            const finalTools = relevantScoredTools.sort((a, b) => b.score - a.score);
            logEvent(`[Relevance] Filtered to ${finalTools.length} tools (Top K: ${topK}, Threshold: ${relevanceThreshold}).`);
            return finalTools;

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logEvent(`[WARN] Tool relevance search failed: ${errorMsg}. Providing all available tools as a fallback.`);
            return availableTools.map(tool => ({ tool, score: 0 }));
        }
    }, [toolEmbeddings, logEvent, ensureToolEmbeddings]);

    return { findRelevantTools };
};