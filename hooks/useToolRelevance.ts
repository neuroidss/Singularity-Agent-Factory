import { useState, useCallback, useEffect, useRef } from 'react';
import { generateEmbeddings, cosineSimilarity } from '../services/embeddingService';
import { CORE_TOOLS } from '../constants';
import type { LLMTool, ScoredTool } from '../types';

export const useToolRelevance = ({ allTools, logEvent }: { allTools: LLMTool[], logEvent: (msg: string) => void }) => {
    const [toolEmbeddings, setToolEmbeddings] = useState<Map<string, number[]>>(new Map());
    const isEmbeddingTools = useRef(false);

    // This effect is responsible for embedding any tools that haven't been processed yet.
    // It runs when the list of available tools changes.
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
            logEvent(`[Embeddings] Found ${toolsToEmbed.length} new tools to process. Starting embedding...`);
            
            try {
                // Construct the text for each tool to be sent for embedding.
                const textsToEmbed = toolsToEmbed.map(tool => {
                    const parametersJson = JSON.stringify(tool.parameters.map(p => ({ name: p.name, type: p.type, description: p.description })));
                    return `Tool: ${tool.name}. Purpose: ${tool.purpose || 'Not specified'}. Description: ${tool.description}. Parameters: ${parametersJson}`;
                });
                
                const embeddings = await generateEmbeddings(textsToEmbed, (msg) => logEvent(`[Embeddings] ${msg}`));
                
                const newEmbeddings = new Map<string, number[]>();
                toolsToEmbed.forEach((tool, index) => {
                    newEmbeddings.set(tool.id, embeddings[index]);
                });

                setToolEmbeddings(prevMap => {
                    return new Map([...prevMap, ...newEmbeddings]);
                });

                const newTotal = toolEmbeddings.size + toolsToEmbed.length;
                logEvent(`[Embeddings] Cache updated. Total embedded: ${newTotal} of ${allTools.length} available tools.`);

            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                logEvent(`[ERROR] Failed to generate tool embeddings: ${errorMsg}`);
            } finally {
                isEmbeddingTools.current = false;
            }
        };

        updateEmbeddings();
    }, [allTools, logEvent, toolEmbeddings.size]);


    const findRelevantTools = useCallback(async (
        userRequestText: string, 
        availableTools: LLMTool[],
        topK: number,
        relevanceThreshold: number,
        systemPromptForContext: string | null = null
    ): Promise<ScoredTool[]> => {
        try {
            let contextForEmbedding = "";
            if (systemPromptForContext) {
                contextForEmbedding += `System Goal: ${systemPromptForContext}\n\n`;
            }
            contextForEmbedding += `User's Current Task: ${userRequestText}`;

            if (!contextForEmbedding.trim()) {
                logEvent('[WARN] No context available for tool relevance search. Providing all tools.');
                return availableTools.map(tool => ({ tool, score: 0 }));
            }

            const [contextEmbedding] = await generateEmbeddings([contextForEmbedding], (msg) => logEvent(`[Embeddings] ${msg}`));
            
            const scoredTools = availableTools.map(tool => {
                const toolEmbedding = toolEmbeddings.get(tool.id);
                if (!toolEmbedding) return { tool, score: 0 };
                const score = cosineSimilarity(contextEmbedding, toolEmbedding);
                return { tool, score };
            }).sort((a, b) => b.score - a.score);

            const relevantScoredTools = scoredTools
                .filter(item => item.score >= relevanceThreshold)
                .slice(0, topK);

            const relevantToolIds = new Set(relevantScoredTools.map(item => item.tool.id));
            
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
    }, [toolEmbeddings, logEvent]);

    return { findRelevantTools };
};
