import { LLMTool, Episode } from './types';

const STORAGE_KEY = 'singularity-agent-factory-state';
const LEGACY_STORAGE_KEY = 'tools';
const CURRENT_STORAGE_VERSION = 3;

interface AppStateV2 {
    version: 2;
    tools: LLMTool[];
}

export interface AppState {
    version: number;
    tools: LLMTool[];
    episodes: Episode[];
    learnedHeuristics: string[];
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

const migrateV2ToV3 = (v2State: AppStateV2): AppState => {
    console.log("Running migration from v2 to v3 for state.");
    return {
        ...v2State,
        version: 3,
        episodes: [],
        learnedHeuristics: [],
    };
}


export const loadStateFromStorage = (): AppState | null => {
    // 1. Try loading from the new, versioned key
    const newStateJson = localStorage.getItem(STORAGE_KEY);
    if (newStateJson) {
        try {
            let state = JSON.parse(newStateJson);
            // Ensure the state has a version number and tools array before proceeding
            if (typeof state.version === 'number' && Array.isArray(state.tools)) {
                 if (state.version === CURRENT_STORAGE_VERSION) {
                    // Version matches, no migration needed. Just ensure new fields exist.
                    return {
                        ...state,
                        episodes: state.episodes || [],
                        learnedHeuristics: state.learnedHeuristics || [],
                    };
                } else if (state.version < CURRENT_STORAGE_VERSION) {
                    console.warn(`Stored state is on an old version (${state.version}). Migrating...`);
                    if (state.version === 2) {
                        state = migrateV2ToV3(state as AppStateV2);
                        saveStateToStorage(state);
                        return state;
                    }
                    // Add other migration steps here if needed, e.g. from v3 to v4
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
            console.log("Found legacy (v1) state. Migrating to v3...");
            const legacyTools = JSON.parse(legacyStateJson) as LLMTool[];
            
            // Check if it's a valid array of tools before migrating
            if (!Array.isArray(legacyTools)) {
                throw new Error("Legacy state is not a valid array.");
            }

            const migratedTools = migrateV1ToV2(legacyTools);
            
            const newState: AppState = {
                version: CURRENT_STORAGE_VERSION,
                tools: migratedTools,
                episodes: [],
                learnedHeuristics: [],
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
