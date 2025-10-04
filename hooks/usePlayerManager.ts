// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import { useState, useCallback } from 'react';
import { getOrCreatePlayer, savePlayerState as persistPlayerState } from '../services/playerStateService';
import type { PlayerState, VaultItem, ServerInventoryItem } from '../types';

export const usePlayerManager = ({ logEvent }: { logEvent: (message: string) => void }) => {
    const [playerState, setPlayerState] = useState<PlayerState | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const loadPlayer = useCallback(async (playerName: string) => {
        if (!playerName.trim()) {
            logEvent('[ERROR] Player name cannot be empty.');
            return;
        }
        setIsLoading(true);
        try {
            const player = await getOrCreatePlayer(playerName);
            setPlayerState(player);
            logEvent(`[PLAYER] Loaded character: ${player.name}`);
        } catch (e) {
            logEvent(`[ERROR] Failed to load character: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(false);
        }
    }, [logEvent]);

    const updatePlayer = useCallback(async (updatedPlayerState: PlayerState) => {
        setPlayerState(updatedPlayerState);
        await persistPlayerState(updatedPlayerState);
    }, []);

    const addToVault = useCallback(async (vaultItem: Omit<VaultItem, 'id' | 'createdAt'>) => {
        if (!playerState) return;

        const newVaultItem: VaultItem = {
            ...vaultItem,
            id: `${vaultItem.name.replace(/\s+/g, '_')}_${Date.now()}`,
            createdAt: new Date().toISOString(),
        };

        const updatedVault = [...playerState.vault, newVaultItem];
        const updatedPlayer = { ...playerState, vault: updatedVault };
        await updatePlayer(updatedPlayer);
        logEvent(`[VAULT] New blueprint acquired: "${vaultItem.name}"`);

    }, [playerState, updatePlayer, logEvent]);
    
    // This function is for checking the player's permanent vault for existing designs.
    const hasBlueprint = useCallback((blueprintName: string): boolean => {
        if (!playerState) return false;
        return playerState.vault.some(item => item.name === blueprintName);
    }, [playerState]);
    
    // --- New Functions for Server-Side Inventory ---

    const updateInventory = useCallback(async (items: ServerInventoryItem[]) => {
        if (!playerState) return;
        const updatedPlayer = { ...playerState, inventory: items };
        // This only updates the local representation. The server is the source of truth during an online session.
        setPlayerState(updatedPlayer);
        logEvent('[INVENTORY] Client-side inventory representation updated.');
    }, [playerState, logEvent]);
    
    const hasItems = useCallback((items: { name: string, quantity: number }[]): boolean => {
        if (!playerState || !playerState.inventory) return false;
        
        const currentInventory = new Map(playerState.inventory.map(i => [i.name, i.quantity]));
        
        return items.every(requiredItem => {
            // Fix: Explicitly cast the value from the map to a Number to resolve the `unknown` type error.
            return (Number(currentInventory.get(requiredItem.name)) || 0) >= requiredItem.quantity;
        });
    }, [playerState]);


    return {
        playerState,
        isLoadingPlayer: isLoading,
        loadPlayer,
        updatePlayer,
        addToVault,
        hasBlueprint,
        updateInventory,
        hasItems,
        setPlayerState,
        savePlayerState: persistPlayerState,
    };
};
