
import { useState, useCallback } from 'react';
import { AI_MODELS } from '../constants';
import type { AIModel, APIConfig, KnowledgeGraph, MainView } from '../types';

export const useAppStateManager = () => {
    const [userInput, setUserInput] = useState<string>('');
    const [eventLog, setEventLog] = useState<string[]>(['[INFO] System Initialized. Target: Achieve Singularity.']);
    const [mainView, setMainView] = useState<MainView>('KICAD');
    const [apiCallCount, setApiCallCount] = useState<number>(0);
    const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });

    const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[0]);
    const [apiConfig, setApiConfig] = useState<APIConfig>(() => {
        let initialConfig: APIConfig = { 
            openAIAPIKey: 'ollama',
            openAIBaseUrl: 'http://localhost:8008/v1',
            ollamaHost: 'http://localhost:11434',
        };
        try {
            const stored = localStorage.getItem('apiConfig');
            if (stored) initialConfig = { ...initialConfig, ...JSON.parse(stored) };
        } catch {}
        return initialConfig;
    });

    const logEvent = useCallback((message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setEventLog(prev => [...prev.slice(-199), `[${timestamp}] ${message}`]);
    }, []);

    return {
        state: {
            userInput,
            eventLog,
            mainView,
            apiCallCount,
            knowledgeGraph,
            selectedModel,
            apiConfig,
        },
        setters: {
            setUserInput,
            setEventLog,
            setMainView,
            setApiCallCount,
            setKnowledgeGraph,
            setSelectedModel,
            setApiConfig,
        },
        logEvent,
    };
};
