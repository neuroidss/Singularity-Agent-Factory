import { LLMTool } from './types';

const STORAGE_KEY = 'singularity-agent-factory-state';
const LEGACY_STORAGE_KEY = 'tools';
const CURRENT_STORAGE_VERSION = 2;

interface AppState {
    version: number;
    tools: LLMTool[];
}

// Migration from implicit v1 (just an array of tools) to v2 (versioned object with timestamps)
const migrateV1ToV2 = (legacyTools: LLMTool[]): LLMTool[] => {
    console.log("Running migration from v1 to v2 for", legacyTools.length, "tools.");
    const now = new Date().toISOString();
    return legacyTools.map(tool => ({
        ...tool,
        // Add createdAt if it doesn't exist, preserving any that might be there
        createdAt: tool.createdAt || now,
        // Always set updatedAt on migration
        updatedAt: now, 
    }));
};


export const loadStateFromStorage = (): AppState | null => {
    // 1. Try loading from the new, versioned key
    const newStateJson = localStorage.getItem(STORAGE_KEY);
    if (newStateJson) {
        try {
            const state = JSON.parse(newStateJson) as AppState;
            // Ensure the state has a version number and tools array before proceeding
            if (typeof state.version === 'number' && Array.isArray(state.tools)) {
                 if (state.version === CURRENT_STORAGE_VERSION) {
                    // Version matches, no migration needed
                    return state;
                } else if (state.version < CURRENT_STORAGE_VERSION) {
                    // Placeholder for future migrations (e.g., from v2 to v3)
                    console.warn(`Stored state is on an old version (${state.version}). Future migrations would be handled here.`);
                    return state;
                }
            }
            // If format is invalid, fall through to clear it
            throw new Error("Invalid state format found in storage.");
        } catch (e) {
            console.error("Failed to parse stored state, clearing it.", e);
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    }

    // 2. If new key not found, try loading from the legacy key
    const legacyStateJson = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyStateJson) {
        try {
            console.log("Found legacy (v1) state. Migrating to v2...");
            const legacyTools = JSON.parse(legacyStateJson) as LLMTool[];
            
            // Check if it's a valid array of tools before migrating
            if (!Array.isArray(legacyTools)) {
                throw new Error("Legacy state is not a valid array.");
            }

            const migratedTools = migrateV1ToV2(legacyTools);
            
            const newState: AppState = {
                version: CURRENT_STORAGE_VERSION,
                tools: migratedTools,
            };
            
            // Save the newly formatted state and remove the old one
            saveStateToStorage(newState);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            console.log("Migration successful. Legacy state removed.");

            return newState;
        } catch (e) {
            console.error("Failed to parse or migrate legacy state, clearing it.", e);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return null;
        }
    }

    // 3. No state found in storage
    return null;
};

export const saveStateToStorage = (state: Omit<AppState, 'version'>) => {
    try {
        const stateToSave: AppState = {
            ...state,
            version: CURRENT_STORAGE_VERSION,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
        console.error("Failed to save state to localStorage. Data might be too large.", e);
    }
};