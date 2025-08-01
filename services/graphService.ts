
import type { KnowledgeGraph, LLMTool } from '../types';
import { pipeline, dot, type FeatureExtractionPipeline } from '@huggingface/transformers';

const serializeError = (e: unknown): string => {
    if (e instanceof Error) {
        return e.stack || e.message;
    }
    return String(e);
};

// --- Embedding Logic ---
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

class EmbeddingSingleton {
    static instance: FeatureExtractionPipeline | null = null;
    static async getInstance(onProgress: (msg: string) => void): Promise<FeatureExtractionPipeline> {
        if (this.instance === null) {
            onProgress(`🚀 Инициализация модели вложений...`);
            (window as any).env = { ...(window as any).env, allowLocalModels: false, useFbgemm: false };
            this.instance = await pipeline('feature-extraction', MODEL_NAME);
            onProgress('✅ Модель вложений готова.');
        }
        return this.instance;
    }
}

const generateEmbeddings = async (texts: string[], onProgress: (msg: string) => void): Promise<number[][]> => {
    const extractor = await EmbeddingSingleton.getInstance(onProgress);
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
};

const programmaticClusterNamer = (clusterTools: LLMTool[]): string => {
    // This is a simplified heuristic for naming clusters based on common words.
    const stopWords = new Set(['tool', 'component', 'display', 'panel', 'agent', 'system']);
    const wordCounts = new Map<string, number>();
    clusterTools.forEach(tool => {
        tool.name.split(/\s+/).forEach(word => {
            const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanWord.length > 2 && !stopWords.has(cleanWord)) {
                wordCounts.set(cleanWord, (wordCounts.get(cleanWord) || 0) + 1);
            }
        });
    });
    if (wordCounts.size === 0) return `Кластер: ${clusterTools[0]?.name || 'Безымянный'}`;
    const sortedWords = Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1]);
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `Инструменты: ${capitalize(sortedWords[0][0])}`;
};

export const generateGraph = async (toolsToGraph: LLMTool[], onProgress: (message: string) => void): Promise<KnowledgeGraph> => {
    try {
        onProgress('Генерация графа отключена в упрощенной версии.');
        return { nodes: [], edges: [] };
        
    } catch (e) {
        const errorMessage = serializeError(e);
        onProgress(`[ОШИБКА] Генерация графа не удалась: ${errorMessage}`);
        throw new Error(`Генерация графа не удалась: ${errorMessage}`);
    }
};