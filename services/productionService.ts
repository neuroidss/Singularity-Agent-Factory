// services/productionService.ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { ProductionSession, ProductionData } from '../types';

const DB_NAME = 'singularity-productions';
const DB_VERSION = 1;
const PRODUCTION_STORE = 'productions';

interface ProductionDBSchema extends DBSchema {
  [PRODUCTION_STORE]: {
    key: string; // Session ID
    value: ProductionSession;
  };
}

let dbPromise: Promise<IDBPDatabase<ProductionDBSchema>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ProductionDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PRODUCTION_STORE)) {
          db.createObjectStore(PRODUCTION_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const saveProductionSession = async (session: ProductionSession): Promise<void> => {
  try {
    const db = await initDB();
    await db.put(PRODUCTION_STORE, session);
  } catch (error) {
    console.error("Failed to save production session:", error);
    throw new Error("Could not save session to the database.");
  }
};

export const listProductionSessions = async (): Promise<ProductionSession[]> => {
  try {
    const db = await initDB();
    const sessions = await db.getAll(PRODUCTION_STORE);
    // Sort by creation date, newest first
    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error("Failed to list production sessions:", error);
    return [];
  }
};

export const loadProductionSession = async (sessionId: string): Promise<ProductionSession | null> => {
  try {
    const db = await initDB();
    const session = await db.get(PRODUCTION_STORE, sessionId);
    return session || null;
  } catch (error) {
    console.error("Failed to load production session:", error);
    return null;
  }
};

export const deleteProductionSession = async (sessionId: string): Promise<void> => {
  try {
    const db = await initDB();
    await db.delete(PRODUCTION_STORE, sessionId);
  } catch (error) {
    console.error("Failed to delete production session:", error);
    throw new Error("Could not delete session from the database.");
  }
};
