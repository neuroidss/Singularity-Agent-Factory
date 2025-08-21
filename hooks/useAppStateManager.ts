

import { useState, useCallback } from 'react';
import { AI_MODELS } from '../constants';
import type { AIModel, APIConfig, MainView } from '../types';

export const useAppStateManager = () => {
    const [userInput, setUserInput] = useState<string>('');
    const [eventLog, setEventLog] = useState<string[]>([]);
    const [mainView, setMainView] = useState<MainView>('KICAD');
    const [apiCallCount, setApiCallCount] = useState<Record<string, number>>({});

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
            selectedModel,
            apiConfig,
        },
        setters: {
            setUserInput,
            setEventLog,
            setMainView,
            setApiCallCount,
            setSelectedModel,
            setApiConfig,
        },
        logEvent,
    };
};