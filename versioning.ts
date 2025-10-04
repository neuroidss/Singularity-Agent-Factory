import { LLMTool } from './types';

const STORAGE_KEY = 'singularity-agent-factory-state';
const CURRENT_STORAGE_VERSION = 6; // Incremented for simplified state

export interface AppState {
    version: number;
    tools: LLMTool[];
}

export const loadStateFromStorage = (): AppState | null => {
    const stateJson = localStorage.getItem(STORAGE_KEY);
    if (stateJson) {
        try {
            const state = JSON.parse(stateJson);
            // If the loaded state has a version and it matches the current version, and it has a tools array, it's considered valid.
            if (state.version === CURRENT_STORAGE_VERSION && Array.isArray(state.tools)) {
                return state;
            }
            // If the version doesn't match, we will fall through and return null, effectively discarding the old state.
        } catch (e) {
            console.error("Failed to parse stored state, clearing it.", e);
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    }
    // No valid state found, or an older version was found.
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
