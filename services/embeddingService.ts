import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

// List of models to try, from smallest to largest quantized version.
// This allows for a graceful fallback if a smaller model fails to load on the user's device.
const EMBEDDING_MODELS: {name: string, size: string}[] = [
//    { name: 'Xenova/paraphrase-MiniLM-L3-v2', size: '17.5MB' }, // Smallest, fastest option
    { name: 'Xenova/all-MiniLM-L6-v2', size: '23MB' },       // The original model, a reliable fallback
];

class EmbeddingSingleton {
    static instance: FeatureExtractionPipeline | null = null;
    static async getInstance(onProgress: (msg: string) => void): Promise<FeatureExtractionPipeline> {
        if (this.instance !== null) {
            return this.instance;
        }

        if (EMBEDDING_MODELS.length === 0) {
            onProgress(`[ERROR] ❌ No embedding models are configured. Tool relevance filtering will be disabled.`);
            throw new Error("No embedding models configured. This feature is disabled.");
        }

        (window as any).env = { ...(window as any).env, allowLocalModels: false, useFbgemm: false };

        const reportedDownloads = new Set();
        const progressCallback = (progress: any) => {
            const { status, file } = progress;
            if (status === 'download' && !reportedDownloads.has(file)) {
                onProgress(`Downloading model file: ${file}...`);
                reportedDownloads.add(file);
            }
        };
        
        for (const modelInfo of EMBEDDING_MODELS) {
            try {
                onProgress(`🚀 Attempting to load embedding model: ${modelInfo.name} (${modelInfo.size})...`);
                reportedDownloads.clear(); // Reset reported files for each new attempt
                
                const extractor = await pipeline('feature-extraction', modelInfo.name, {
                    device: 'webgpu',
                    progress_callback: progressCallback,
                    dtype: 'fp16' // Use fp16 for reduced memory usage and better performance.
                });

                onProgress(`✅ Successfully loaded embedding model: ${modelInfo.name}`);
                this.instance = extractor;
                return this.instance;

            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                onProgress(`[WARN] ⚠️ Failed to load ${modelInfo.name}. Reason: ${errorMessage}. Trying next model...`);
                console.warn(`Failed to load embedding model ${modelInfo.name}`, e);
            }
        }

        // This part is reached only if all models in the list fail to load.
        onProgress(`[ERROR] ❌ Could not load any embedding models. Tool relevance filtering will be disabled.`);
        throw new Error("All embedding models failed to load. Please check your network connection and browser compatibility (e.g., Chrome/Edge).");
    }
}

export const generateEmbeddings = async (texts: string[], onProgress: (msg: string) => void): Promise<number[][]> => {
    try {
        const extractor = await EmbeddingSingleton.getInstance(onProgress);
        // The library expects a single string or an array of strings.
        const output = await extractor(texts.length === 1 ? texts[0] : texts, { pooling: 'mean', normalize: true });
        // The output format differs for single vs. multiple inputs. Standardize it.
        if (texts.length === 1) {
            return [output.tolist()[0]]; // It returns a 2D array for a single item, we need the inner array
        }
        return output.tolist();

    } catch(e) {
        console.error("Embedding generation failed:", e);
        throw e;
    }
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }
    // Since vectors are normalized, dot product is equivalent to cosine similarity
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct;
};