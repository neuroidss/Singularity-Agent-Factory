// services/cacheService.ts
import { openDB, type IDBPDatabase, type DBSchema } from 'https://esm.sh/idb@8';

const DB_NAME = 'singularity-agent-cache';
const DB_VERSION = 1;
const MCP_CACHE_STORE = 'mcp_cache';
const ASSET_CACHE_STORE = 'asset_cache';

interface CacheDBSchema extends DBSchema {
  [MCP_CACHE_STORE]: {
    key: string;
    value: { result: any; timestamp: number };
  };
  [ASSET_CACHE_STORE]: {
    key: string;
    value: { blob: Blob; timestamp: number };
  };
}

let dbPromise: Promise<IDBPDatabase<CacheDBSchema>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<CacheDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(MCP_CACHE_STORE)) {
          db.createObjectStore(MCP_CACHE_STORE);
        }
        if (!db.objectStoreNames.contains(ASSET_CACHE_STORE)) {
          db.createObjectStore(ASSET_CACHE_STORE);
        }
      },
    });
  }
  return dbPromise;
};

// --- MCP (Server Tool Call) Cache ---

export const getMcpCache = async (key: string): Promise<any | null> => {
  try {
    const db = await initDB();
    const entry = await db.get(MCP_CACHE_STORE, key);
    return entry ? entry.result : null;
  } catch (error) {
    console.error("Failed to get from MCP cache:", error);
    return null;
  }
};

export const setMcpCache = async (key: string, result: any): Promise<void> => {
  try {
    const db = await initDB();
    await db.put(MCP_CACHE_STORE, { result, timestamp: Date.now() }, key);
  } catch (error) {
    console.error("Failed to set in MCP cache:", error);
  }
};

// --- Asset (SVG/GLB) Cache ---

export const getAssetBlob = async (url: string): Promise<Blob | null> => {
  try {
    const db = await initDB();
    const entry = await db.get(ASSET_CACHE_STORE, url);
    return entry ? entry.blob : null;
  } catch (error) {
    console.error(`Failed to get asset from cache (${url}):`, error);
    return null;
  }
};

export const setAssetBlob = async (url: string, blob: Blob): Promise<void> => {
  try {
    const db = await initDB();
    await db.put(ASSET_CACHE_STORE, { blob, timestamp: Date.now() }, url);
  } catch (error) {
    console.error(`Failed to set asset in cache (${url}):`, error);
  }
};

export const clearAllCaches = async () => {
    try {
        const db = await initDB();
        await db.clear(MCP_CACHE_STORE);
        await db.clear(ASSET_CACHE_STORE);
        console.log("All caches cleared.");
    } catch (error) {
        console.error("Failed to clear caches:", error);
    }
}