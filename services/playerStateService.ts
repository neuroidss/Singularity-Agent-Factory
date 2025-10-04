import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { PlayerState } from '../types';

const DB_NAME = 'aetherium-player-data';
const DB_VERSION = 1;
const PLAYER_STORE = 'players';

interface PlayerDBSchema extends DBSchema {
  [PLAYER_STORE]: {
    key: string; // Player name/ID
    value: PlayerState;
  };
}

let dbPromise: Promise<IDBPDatabase<PlayerDBSchema>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<PlayerDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PLAYER_STORE)) {
          db.createObjectStore(PLAYER_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const getPlayerState = async (playerName: string): Promise<PlayerState | null> => {
  try {
    const db = await initDB();
    const state = await db.get(PLAYER_STORE, playerName);
    return state || null;
  } catch (error) {
    console.error("Failed to get player state:", error);
    return null;
  }
};

export const savePlayerState = async (playerState: PlayerState): Promise<void> => {
  try {
    const db = await initDB();
    // Ensure we only save the client-authoritative parts of the state.
    const stateToSave: PlayerState = {
      id: playerState.id,
      name: playerState.name,
      x: playerState.x,
      y: playerState.y,
      rotation: playerState.rotation,
      vault: playerState.vault,
    };
    await db.put(PLAYER_STORE, stateToSave);
  } catch (error) {
    console.error("Failed to save player state:", error);
  }
};

export const getOrCreatePlayer = async (playerName: string): Promise<PlayerState> => {
    const existingPlayer = await getPlayerState(playerName);
    if (existingPlayer) {
        return existingPlayer;
    }
    const newPlayer: PlayerState = {
        id: playerName,
        name: playerName,
        x: 0,
        y: 0,
        rotation: 0,
        vault: [], // The Vault for valuable blueprints starts empty.
    };
    await savePlayerState(newPlayer);
    return newPlayer;
};