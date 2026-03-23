import { Map, Variation } from '../types/schema';
import { decodeTileRef } from './tileRef';

/**
 * Resolves the inheritance chain for a variation.
 * Returns an array starting from root (base) to the target variation.
 */
export function getVariationChain(map: Map, variationId: string | null): (Variation | 'base')[] {
    if (!variationId) return ['base'];

    const chain: (Variation | 'base')[] = [];
    let currentId: string | null | undefined = variationId;

    while (currentId) {
        const v = map.variations?.find(v => v.id === currentId);
        if (v) {
            chain.unshift(v);
            currentId = v.parentId;
        } else {
            break;
        }
    }

    chain.unshift('base');
    return chain;
}

/**
 * Resolves the final tile reference for a specific coordinate and layer,
 * accounting for variation inheritance.
 */
export function resolveTileAt(
    map: Map,
    layerId: string,
    x: number,
    y: number,
    variationId: string | null
): string | null {
    const chain = getVariationChain(map, variationId).reverse(); // Child to Parent to Base

    for (const context of chain) {
        if (context === 'base') {
            const layer = map.layers.find(l => l.id === layerId);
            const cell = layer?.data[y]?.[x];
            if (cell === null || cell === undefined) return null;
            if (typeof cell === 'string') return cell;
            return decodeTileRef(cell, map.tilesetRefs);
        } else {
            const override = context.layerOverrides?.[layerId];
            if (override && override.data[y]?.[x] != null) {
                return override.data[y][x] as string; // Variations store as strings
            }
        }
    }

    return null;
}

/**
 * Resolves all entities for the current variation context.
 * Variations can Add, Remove, or Modify entities.
 */
export function resolveEntities(map: Map, variationId: string | null) {
    const chain = getVariationChain(map, variationId); // Base to Child
    let entities = [...map.entities];

    for (const context of chain) {
        if (context === 'base') continue;

        context.entityOverrides?.forEach(override => {
            if (override.action === 'add' && override.entity) {
                entities.push(override.entity);
            } else if (override.action === 'remove' && override.entityId) {
                entities = entities.filter(e => e.id !== override.entityId);
            } else if (override.action === 'modify' && override.entityId && override.entity) {
                const idx = entities.findIndex(e => e.id === override.entityId);
                if (idx !== -1) {
                    entities[idx] = { ...entities[idx], ...override.entity };
                }
            }
        });
    }

    return entities;
}
