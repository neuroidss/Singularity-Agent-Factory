// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CORE_TOOLS } from '../constants';
import { BOOTSTRAP_TOOL_PAYLOADS } from '../bootstrap';
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
    const { ...toolData } = payload;
    
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
    const [tools, setTools] = useState<LLMTool[]>([]);
    
    // State for server tools and connection status
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    const isServerConnectedRef = useRef(isServerConnected);
    isServerConnectedRef.current = isServerConnected;

    useEffect(() => {
        const freshBootstrapTools = initializeTools();
        const freshBootstrapToolsMap = new Map(freshBootstrapTools.map(t => [t.name, t]));
        
        const storedState = loadStateFromStorage();
        const storedTools = storedState ? storedState.tools : [];

        if (!storedState) {
            setTools(freshBootstrapTools);
            logEvent('[SYSTEM] Initial toolset loaded. No previous state found.');
            return;
        }

        const updatedTools: LLMTool[] = [];
        const processedStoredToolNames = new Set<string>();
        let versionUpdateCount = 0;
        let codeUpdateCount = 0;
        let preservedUserToolsCount = 0;

        for (const storedTool of storedTools) {
            processedStoredToolNames.add(storedTool.name);
            const freshTool = freshBootstrapToolsMap.get(storedTool.name);

            if (freshTool) {
                if (freshTool.version > storedTool.version) {
                    updatedTools.push(freshTool);
                    versionUpdateCount++;
                } else if (
                    freshTool.version === storedTool.version &&
                    freshTool.implementationCode !== storedTool.implementationCode
                ) {
                    updatedTools.push(freshTool);
                    codeUpdateCount++;
                } else {
                    updatedTools.push(storedTool);
                }
            } else {
                updatedTools.push(storedTool);
                preservedUserToolsCount++;
            }
        }

        let newToolsCount = 0;
        for (const freshTool of freshBootstrapTools) {
            if (!processedStoredToolNames.has(freshTool.name)) {
                updatedTools.push(freshTool);
                newToolsCount++;
            }
        }
        
        if (versionUpdateCount > 0 || codeUpdateCount > 0 || newToolsCount > 0) {
            logEvent(`[SYSTEM] Tools auto-updated: ${versionUpdateCount} by version, ${codeUpdateCount} by code change. ${newToolsCount} new tools added. Preserved ${preservedUserToolsCount} user-generated tools.`);
        } else {
            logEvent(`[SYSTEM] Tools are up to date. Loaded ${storedTools.length} tools from storage.`);
        }
        
        setTools(updatedTools);

    }, []); // Run only once on mount

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
                    logEvent(`[INFO] ✅ Server connection re-established.`);
                }
                logEvent(`[SYSTEM] Server tool cache synchronized. Loaded ${fetchedTools.length} server tools.`);
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
                    setServerTools(currentServerTools => {
                        // Avoid unnecessary state updates and log spam if the tools haven't changed.
                        if (JSON.stringify(currentServerTools) !== JSON.stringify(fetchedTools)) {
                            if (isServerConnectedRef.current) { // Only log updates if already connected
                                logEvent(`[SYSTEM] Server tools updated via polling. Found ${fetchedTools.length} tools.`);
                            }
                            return fetchedTools;
                        }
                        return currentServerTools;
                    });
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
