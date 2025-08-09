import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CORE_TOOLS, BOOTSTRAP_TOOL_PAYLOADS } from '../constants';
import { loadStateFromStorage } from '../versioning';
import { SERVER_URL } from '../App';
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
    const newId = generateMachineReadableId(toolData.name, existingTools);
    const now = new Date().toISOString();
    return {
        ...toolData,
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
        if (payload.executionEnvironment === 'Client') {
             const newTool = bootstrapTool(payload, allCreatedTools);
             allCreatedTools.push(newTool);
        }
    });
    console.log(`Bootstrap complete. ${allCreatedTools.length} client tools loaded.`);
    return allCreatedTools;
};


export const useToolManager = ({ logEvent }: { logEvent: (message: string) => void }) => {
    const [tools, setTools] = useState<LLMTool[]>(() => {
        const loadedState = loadStateFromStorage();
        return loadedState ? loadedState.tools : initializeTools();
    });
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);

    const allTools = useMemo(() => [...tools, ...serverTools], [tools, serverTools]);
    const allToolsRef = useRef(allTools);
    allToolsRef.current = allTools;

    const fetchServerTools = useCallback(async (): Promise<LLMTool[]> => {
        try {
            const response = await fetch(`${SERVER_URL}/api/tools`);
            if (!response.ok) throw new Error('Failed to fetch server tools');
            const data: LLMTool[] = await response.json();
            
            setServerTools(currentServerTools => {
                if (JSON.stringify(data) !== JSON.stringify(currentServerTools)) {
                    return data;
                }
                return currentServerTools;
            });

            if (!isServerConnected) {
              setIsServerConnected(true);
              logEvent(`[INFO] ✅ Backend server connected. Found ${data.length} server-side tools.`);
            }
            return data;
        } catch (e) {
            if (isServerConnected) {
              setIsServerConnected(false);
              setServerTools([]);
              logEvent(`[WARN] ⚠️ Backend server disconnected. Running in client-only mode.`);
              console.warn(`Could not connect to backend at ${SERVER_URL}. Server tools unavailable.`, e);
            }
            return [];
        }
    }, [logEvent, isServerConnected]);

    useEffect(() => {
        fetchServerTools(); // Initial fetch
        const serverToolInterval = setInterval(fetchServerTools, 5000);
        return () => clearInterval(serverToolInterval);
    }, [fetchServerTools]);

    return {
        tools,
        setTools,
        serverTools,
        setServerTools,
        allTools,
        allToolsRef,
        isServerConnected,
        fetchServerTools,
        generateMachineReadableId,
    };
};
