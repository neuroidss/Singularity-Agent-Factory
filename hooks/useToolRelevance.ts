

import { useState, useCallback, useEffect, useRef } from 'react';
import { generateEmbeddings, cosineSimilarity } from '../services/embeddingService';
import { CORE_TOOLS } from '../constants';
import type { LLMTool, ScoredTool } from '../types';

export const useToolRelevance = ({ allTools, logEvent }: { allTools: LLMTool[], logEvent: (msg: string) => void }) => {
    const [toolEmbeddings, setToolEmbeddings] = useState<Map<string, number[]>>(new Map());
    const isEmbeddingTools = useRef(false);

    // This effect is responsible for embedding any tools that haven't been processed yet.
    // It runs when the list of available tools changes, or after an embedding batch completes.
    useEffect(() => {
        const updateEmbeddings = async () => {
            // Prevent concurrent runs to avoid race conditions and unnecessary API calls.
            if (isEmbeddingTools.current) {
                return;
            }

            // Find tools that are present in the main list but not in our embedding cache.
            const toolsToEmbed = allTools.filter(tool => !toolEmbeddings.has(tool.id));
            
            if (toolsToEmbed.length === 0) {
                return; // All tools are already embedded.
            }

            isEmbeddingTools.current = true;
            logEvent(`[Embeddings] Creating embeddings for ${toolsToEmbed.length} new/updated tools...`);
            
            try {
                // Construct the text for each tool to be sent for embedding.
                const textsToEmbed = toolsToEmbed.map(tool => {
                    const parametersJson = JSON.stringify(tool.parameters.map(p => ({ name: p.name, type: p.type, description: p.description })));
                    return `Tool: ${tool.name}. Purpose: ${tool.purpose || 'Not specified'}. Description: ${tool.description}. Parameters: ${parametersJson}`;
                });
                
                const embeddings = await generateEmbeddings(textsToEmbed, (msg) => logEvent(`[Embeddings] ${msg}`));
                
                // Update state using the functional form to ensure we're not overwriting
                // other concurrent updates (though we've locked it, this is best practice).
                setToolEmbeddings(prevMap => {
                    const newMap = new Map(prevMap);
                    toolsToEmbed.forEach((tool, index) => {
                        newMap.set(tool.id, embeddings[index]);
                    });
                    return newMap;
                });

                logEvent(`[Embeddings] Cache updated with ${toolsToEmbed.length} new tools. Total: ${toolEmbeddings.size + toolsToEmbed.length}`);

            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                logEvent(`[ERROR] Failed to generate tool embeddings: ${errorMsg}`);
            } finally {
                // Ensure the lock is always released, even if an error occurs.
                isEmbeddingTools.current = false;
            }
        };

        updateEmbeddings();
    }, [allTools, toolEmbeddings, logEvent]); // Dependency on toolEmbeddings is key to processing batches.


    const findRelevantTools = useCallback(async (
        userRequestText: string, 
        availableTools: LLMTool[],
        topK: number,
        relevanceThreshold: number,
        systemPromptForContext: string | null = null
    ): Promise<ScoredTool[]> => {
        if (toolEmbeddings.size === 0 && availableTools.length > 0) {
            logEvent('[WARN] Tool embeddings not ready. Providing all tools to agent. This may happen on first run.');
            return availableTools.map(tool => ({ tool, score: 0 }));
        }

        try {
            // The context for relevance is now primarily the system prompt, augmented by the user's goal.
            // This focuses the relevance search on the overall workflow described in the system prompt,
            // rather than the specific, noisy history of the current step.
            let contextForEmbedding = "";
            if (systemPromptForContext) {
                // The system prompt defines the entire workflow and is the most important context.
                contextForEmbedding = systemPromptForContext;
            }
            if (userRequestText) {
                // The user's specific goal is added as secondary, clarifying context.
                contextForEmbedding += `\n\n--- User's Goal ---\n${userRequestText}`;
            }

            if (!contextForEmbedding.trim()) {
                logEvent('[WARN] No context available for tool relevance search. Providing all tools.');
                return availableTools.map(tool => ({ tool, score: 0 }));
            }

            const [contextEmbedding] = await generateEmbeddings([contextForEmbedding], (msg) => logEvent(`[Embeddings] ${msg}`));
            
            const scoredTools = availableTools.map(tool => {
                const toolEmbedding = toolEmbeddings.get(tool.id);
                if (!toolEmbedding) return { tool, score: 0 }; // This tool hasn't been embedded yet, score is 0.
                const score = cosineSimilarity(contextEmbedding, toolEmbedding);
                return { tool, score };
            }).sort((a, b) => b.score - a.score);

            // Filter by threshold first, then by top K
            const relevantScoredTools = scoredTools
                .filter(item => item.score >= relevanceThreshold)
                .slice(0, topK);

            // --- CRITICAL: Always include the core meta-tools ---
            const relevantToolIds = new Set(relevantScoredTools.map(item => item.tool.id));
            
            for (const coreTool of CORE_TOOLS) {
                if (!relevantToolIds.has(coreTool.id)) {
                    const coreToolScoreItem = scoredTools.find(st => st.tool.id === coreTool.id);
                    relevantScoredTools.push(coreToolScoreItem || { tool: coreTool, score: 0 }); // Use its actual score if available
                }
            }
            
            const finalTools = relevantScoredTools.sort((a, b) => b.score - a.score);

            logEvent(`[Relevance] Filtered to ${finalTools.length} tools (Top K: ${topK}, Threshold: ${relevanceThreshold}).`);
            
            return finalTools;

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logEvent(`[ERROR] Failed to find relevant tools: ${errorMsg}. Providing all tools as a fallback.`);
            return availableTools.map(tool => ({ tool, score: 0 }));
        }
    }, [toolEmbeddings, logEvent]);

    return { findRelevantTools };
};