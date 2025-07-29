import { pipeline, type FeatureExtractionPipeline, dot } from '@huggingface/transformers';
import type { LLMTool } from '../types';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

class EmbeddingSingleton {
    static task = 'feature-extraction';
    static model = MODEL_NAME;
    static instance: FeatureExtractionPipeline | null = null;

    static async getInstance(onProgress: (message: string) => void): Promise<FeatureExtractionPipeline> {
        if (this.instance === null) {
            onProgress(`🚀 Initializing embedding model: ${this.model}. This may take a few minutes...`);
            
            // Set environment variables for transformers.js
            (window as any).env = (window as any).env || {};
            (window as any).env.allowLocalModels = false;
            (window as any).env.useFbgemm = false;

            this.instance = await pipeline<'feature-extraction'>(this.task, this.model, {
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
            });
             onProgress('✅ Embedding model ready.');
        }
        return this.instance;
    }
}

// Helper function for cosine similarity. We use dot product on normalized vectors.
const cosineSimilarity = (v1: number[], v2: number[]): number => {
    return dot(v1, v2);
};

const getEmbeddingsForTexts = async (
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
): Promise<LLMTool[]> => {
    const SIMILARITY_THRESHOLD = 0.5;

    // --- 1. Generate Prompt Embedding ---
    onProgress('🧠 Analyzing your request...');
    const [promptEmbedding] = await getEmbeddingsForTexts([`query: ${prompt}`], onProgress);
    if (!promptEmbedding) {
        throw new Error("Failed to generate embedding for the prompt.");
    }

    // --- 2. Generate Tool Embeddings (if not cached) ---
    const toolsToEmbed: LLMTool[] = [];
    allTools.forEach(tool => {
        const cacheKey = `${tool.id}-${tool.version}`;
        if (!toolEmbeddingsCache.has(cacheKey)) {
            toolsToEmbed.push(tool);
        }
    });

    if (toolsToEmbed.length > 0) {
        onProgress(`✨ Generating embeddings for ${toolsToEmbed.length} new/updated tools...`);
        const toolTexts = toolsToEmbed.map(tool => `passage: Tool: ${tool.name}\nDescription: ${tool.description}\nImplementation:\n${tool.implementationCode}`);
        const newEmbeddings = await getEmbeddingsForTexts(toolTexts, onProgress);

        const newCache = new Map(toolEmbeddingsCache);
        toolsToEmbed.forEach((tool, index) => {
            const cacheKey = `${tool.id}-${tool.version}`;
            newCache.set(cacheKey, newEmbeddings[index]);
        });
        setToolEmbeddingsCache(newCache); // Update the state in App.tsx
    }
     onProgress('🔍 Searching for relevant tools...');

    // --- 3. Calculate Similarities and Filter ---
    const similarTools = new Set<LLMTool>();
    const currentCache = new Map(toolEmbeddingsCache); // Use the most up-to-date cache for searching
    allTools.forEach(tool => {
        const cacheKey = `${tool.id}-${tool.version}`;
        const toolEmbedding = currentCache.get(cacheKey) || toolEmbeddingsCache.get(cacheKey);
        if (toolEmbedding) {
            const similarity = cosineSimilarity(promptEmbedding, toolEmbedding);
            if (similarity > SIMILARITY_THRESHOLD) {
                similarTools.add(tool);
            }
        }
    });

    // --- 4. Always include mandatory tools ---
    const mandatoryToolNames = ['Tool Creator', 'Tool Improver'];
    mandatoryToolNames.forEach(name => {
        const tool = allTools.find(t => t.name === name);
        if (tool) similarTools.add(tool);
    });
    
    onProgress(`✅ Found ${similarTools.size} relevant tools.`);
    return Array.from(similarTools);
};