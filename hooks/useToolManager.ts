

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CORE_TOOLS, BOOTSTRAP_TOOL_PAYLOADS } from '../constants';
import { loadStateFromStorage } from '../versioning';
import type { LLMTool, ToolCreatorPayload } from '../types';

export const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 50);
  if (!baseId) baseId = 'unnamed_tool';
  let finalId = baseId;
  let counter = 1;
  const existingIds = new Set(existingTools.map(t => t.id));
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

export const bootstrapTool = (payload: ToolCreatorPayload, existingTools: LLMTool[]): LLMTool => {
    const { executionEnvironment, ...toolData } = payload;
    
    // In client-only mode, the execution environment is always 'Client',
    // but we keep the category ('Server') for display and logical separation.
    const finalCategory = payload.category;

    const newId = generateMachineReadableId(toolData.name, existingTools);
    const now = new Date().toISOString();
    return {
        ...toolData,
        category: finalCategory,
        id: newId,
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
};

export const initializeTools = (): LLMTool[] => {
    console.log("Bootstrapping initial toolset...");
    const allCreatedTools: LLMTool[] = [...CORE_TOOLS];
    
    BOOTSTRAP_TOOL_PAYLOADS.forEach(payload => {
        const newTool = bootstrapTool(payload, allCreatedTools);
        allCreatedTools.push(newTool);
    });
    console.log(`Bootstrap complete. ${allCreatedTools.length} client tools loaded.`);
    return allCreatedTools;
};


export const useToolManager = ({ logEvent }: { logEvent: (message: string) => void }) => {
    const [tools, setTools] = useState<LLMTool[]>(() => {
        const loadedState = loadStateFromStorage();
        return loadedState ? loadedState.tools : initializeTools();
    });
    
    // State for server tools and connection status
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    const isServerConnectedRef = useRef(isServerConnected);
    isServerConnectedRef.current = isServerConnected;

    const forceRefreshServerTools = useCallback(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch('http://localhost:3001/api/tools', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const fetchedTools: LLMTool[] = await response.json();
                setServerTools(fetchedTools);
                if (!isServerConnectedRef.current) {
                    setIsServerConnected(true);
                    logEvent('[INFO] ✅ Server connection re-established.');
                }
                return { success: true, count: fetchedTools.length };
            } else {
                 throw new Error(`Server responded with status: ${response.status}`);
            }
        } catch (error) {
            setServerTools([]);
            if (isServerConnectedRef.current) {
                setIsServerConnected(false);
                logEvent('[WARN] ⚠️ Server connection lost during refresh.');
            }
            throw error;
        }
    }, [logEvent]);

    const allTools = useMemo(() => {
        const clientToolNames = new Set(tools.map(t => t.name));
        // Filter server tools to remove any that have the same name as a client tool,
        // giving client-side definitions precedence.
        const filteredServerTools = serverTools.filter(st => !clientToolNames.has(st.name));
        return [...tools, ...filteredServerTools];
    }, [tools, serverTools]);
    
    const allToolsRef = useRef(allTools);
    allToolsRef.current = allTools;

    useEffect(() => {
        const fetchServerStatusAndTools = async () => {
            try {
                // Use AbortController for fetch timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout
                
                const response = await fetch('http://localhost:3001/api/tools', { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const fetchedTools: LLMTool[] = await response.json();
                    setServerTools(fetchedTools);
                    if (!isServerConnectedRef.current) {
                        setIsServerConnected(true);
                        logEvent('[INFO] ✅ Server connection established.');
                    }
                } else {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
            } catch (error) {
                setServerTools([]);
                if (isServerConnectedRef.current) {
                    setIsServerConnected(false);
                    logEvent('[WARN] ⚠️ Server connection lost.');
                }
            }
        };

        fetchServerStatusAndTools(); // Initial check
        const intervalId = setInterval(fetchServerStatusAndTools, 5000); // Poll every 5 seconds

        return () => clearInterval(intervalId);
    }, [logEvent]);

    return {
        tools,
        setTools,
        allTools,
        allToolsRef,
        isServerConnected,
        generateMachineReadableId,
        forceRefreshServerTools, // Expose the manual refresh function
    };
};