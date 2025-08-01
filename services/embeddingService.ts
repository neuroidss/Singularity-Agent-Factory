import { pipeline, type FeatureExtractionPipeline, dot } from '@huggingface/transformers';
import type { LLMTool } from '../types';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_CACHE_VERSION = 'v2_desc_only';

class EmbeddingSingleton {
    static task: 'feature-extraction' = 'feature-extraction';
    static model = MODEL_NAME;
    static instance: FeatureExtractionPipeline | null = null;

    static async getInstance(onProgress: (message: string) => void): Promise<FeatureExtractionPipeline> {
        if (this.instance === null) {
            onProgress(`🚀 Initializing embedding model: ${this.model}. This may take a few minutes...`);
            
            // Set environment variables for transformers.js
            (window as any).env = (window as any).env || {};
            (window as any).env.allowLocalModels = false;
            (window as any).env.useFbgemm = false;

            const pipelineOptions = {
                 progress_callback: (progress: any) => {
                     const { status, file, progress: p, loaded, total } = progress;
                     if (status === 'progress' && p > 0) {
                         const friendlyLoaded = (loaded / 1024 / 1024).toFixed(1);
                         const friendlyTotal = (total / 1024 / 1024).toFixed(1);
                         onProgress(`Downloading embedding model ${file}: ${Math.round(p)}% (${friendlyLoaded}MB / ${friendlyTotal}MB)`);
                     } else if (status !== 'progress') {
                         onProgress(`Embedding model status: ${status}...`);
                     }
                },
            };

            this.instance = await pipeline<'feature-extraction'>(this.task, this.model, pipelineOptions);
             onProgress('✅ Embedding model ready.');
        }
        return this.instance;
    }
}

export const generateEmbeddings = async (
    texts: string[],
    onProgress: (message: string) => void
): Promise<number[][]> => {
    const extractor = await EmbeddingSingleton.getInstance(onProgress);
    // Generate embeddings with pooling and normalization
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    // Convert to a standard JavaScript array
    return output.tolist();
};

export const retrieveToolsByEmbeddings = async (
    prompt: string,
    allTools: LLMTool[],
    toolEmbeddingsCache: Map<string, number[]>,
    setToolEmbeddingsCache: (cache: Map<string, number[]>) => void,
    onProgress: (message: string) => void,
    similarityThreshold: number,
    topK: number,
): Promise<LLMTool[]> => {
    const foundTools = new Set<LLMTool>();

    // --- Step 1: Direct Name Matching ---
    allTools.forEach(tool => {
        const toolNameRegex = new RegExp(`\\b${tool.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (toolNameRegex.test(prompt)) {
            foundTools.add(tool);
        }
    });

    if (foundTools.size > 0) {
        const names = Array.from(foundTools).map(t => t.name).join(', ');
        onProgress(`🎯 Found direct name match for: ${names}`);
    }

    // --- Step 2. Generate Prompt & Tool Embeddings ---
    onProgress('🧠 Analyzing request with semantic embeddings...');
    const [promptEmbedding] = await generateEmbeddings([`query: ${prompt}`], onProgress);
    if (!promptEmbedding) {
        throw new Error("Failed to generate embedding for the prompt.");
    }

    const toolsToEmbed: LLMTool[] = [];
    allTools.forEach(tool => {
        const cacheKey = `embedding-${EMBEDDING_CACHE_VERSION}-${tool.id}-${tool.version}`;
        if (!toolEmbeddingsCache.has(cacheKey)) {
            toolsToEmbed.push(tool);
        }
    });

    if (toolsToEmbed.length > 0) {
        onProgress(`✨ Generating embeddings for ${toolsToEmbed.length} new/updated tools...`);
        const toolTexts = toolsToEmbed.map(tool => `passage: Tool: ${tool.name}. Description: ${tool.description}`);
        const newEmbeddings = await generateEmbeddings(toolTexts, onProgress);

        const newCache = new Map(toolEmbeddingsCache);
        toolsToEmbed.forEach((tool, index) => {
            const cacheKey = `embedding-${EMBEDDING_CACHE_VERSION}-${tool.id}-${tool.version}`;
            newCache.set(cacheKey, newEmbeddings[index]);
        });
        setToolEmbeddingsCache(newCache);
    }
     onProgress('🔍 Searching for semantically related tools...');

    // --- Step 3. Calculate Similarities, Filter, and Rank ---
    const scoredTools: { tool: LLMTool; score: number }[] = [];
    const currentCache = new Map(toolEmbeddingsCache);

    allTools.forEach(tool => {
        if (foundTools.has(tool)) {
            return;
        }

        const cacheKey = `embedding-${EMBEDDING_CACHE_VERSION}-${tool.id}-${tool.version}`;
        const toolEmbedding = currentCache.get(cacheKey);

        if (toolEmbedding) {
            const similarity = dot(promptEmbedding, toolEmbedding);
            if (similarity >= similarityThreshold) {
                scoredTools.push({ tool, score: similarity });
            }
        }
    });

    scoredTools.sort((a, b) => b.score - a.score);
    const topKTools = scoredTools.slice(0, topK).map(item => item.tool);
    topKTools.forEach(tool => foundTools.add(tool));

    // --- Step 4. Always include mandatory tools ---
    const mandatoryToolNames = ['Tool Creator', 'Tool Improver'];
    mandatoryToolNames.forEach(name => {
        const tool = allTools.find(t => t.name === name);
        if (tool) foundTools.add(tool);
    });
    
    onProgress(`✅ Found ${foundTools.size} relevant tools in total.`);
    return Array.from(foundTools);
};