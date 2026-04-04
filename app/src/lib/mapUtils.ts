import { EntityInstance, Map, Variation } from '../types/schema';
import { decodeTileRef } from './tileRef';

interface VariationMetadataOverrides {
  mapNameOverride?: string;
  baseTilesetIdOverride?: string;
  descriptionOverride?: string;
}

export interface EffectiveMapContext {
  name: string;
  baseTilesetId: string;
  description?: string;
}

/**
 * Resolves the inheritance chain for a variation.
 * Returns an array starting from root (base) to the target variation.
 */
export function getVariationChain(map: Map, variationId: string | null): (Variation | 'base')[] {
  if (!variationId) return ['base'];

  const chain: (Variation | 'base')[] = [];
  let currentId: string | null | undefined = variationId;

  while (currentId) {
    const v = map.variations?.find((v) => v.id === currentId);
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
  variationId: string | null,
): string | null {
  const chain = getVariationChain(map, variationId).reverse(); // Child to Parent to Base

  for (const context of chain) {
    if (context === 'base') {
      const layer = map.layers.find((l) => l.id === layerId);
      const cell = layer?.data[y]?.[x];
      if (cell === null || cell === undefined) return null;
      if (typeof cell === 'string') return cell;
      return decodeTileRef(cell, map.tilesetRefs);
    } else {
      const override = context.layerOverrides?.[layerId];
      if (!override) continue;

      const value = override.data?.[y]?.[x];

      // Replace mode is authoritative for this layer in this variation context.
      // Null is a deliberate clear, not a fallback signal.
      if (override.mode === 'replace') {
        return value ?? null;
      }

      // Merge mode only overrides non-null cells and falls back otherwise.
      if (value !== null && value !== undefined) {
        return value as string; // Variations store string tile refs
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
  // Start with top-level entities (legacy) and entities declared on entity-type layers
  let entities: EntityInstance[] = [];
  if (Array.isArray(map.entities)) entities.push(...map.entities);
  // Collect entities from layers that have `entities` (entity layers)
  for (const layer of map.layers) {
    if (layer.kind === 'entity' && Array.isArray(layer.entities)) {
      entities.push(...layer.entities);
    }
  }

  for (const context of chain) {
    if (context === 'base') continue;

    context.entityOverrides?.forEach((override) => {
      if (override.action === 'add' && override.entity) {
        const candidate = override.entity;
        if (
          candidate.id &&
          candidate.typeId &&
          Array.isArray(candidate.position) &&
          candidate.properties
        ) {
          entities.push(candidate as EntityInstance);
        }
      } else if (override.action === 'remove' && override.entityId) {
        entities = entities.filter((e) => e.id !== override.entityId);
      } else if (override.action === 'modify' && override.entityId && override.entity) {
        const idx = entities.findIndex((e) => e.id === override.entityId);
        if (idx !== -1) {
          entities[idx] = { ...entities[idx], ...override.entity };
        }
      }
    });
  }

  return entities;
}

/**
 * Resolves map-level metadata after applying variation metadata overrides.
 * Child variation metadata wins over parent variation metadata.
 */
export function resolveMapContext(map: Map, variationId: string | null): EffectiveMapContext {
  const context: EffectiveMapContext = {
    name: map.name,
    baseTilesetId: map.baseTilesetId,
    description: map.metadata?.description,
  };

  if (!variationId) return context;

  const chain = getVariationChain(map, variationId);
  for (const node of chain) {
    if (node === 'base') continue;
    const metadata = (node.metadata || {}) as VariationMetadataOverrides;

    if (metadata.mapNameOverride && metadata.mapNameOverride.trim()) {
      context.name = metadata.mapNameOverride;
    }
    if (metadata.baseTilesetIdOverride && metadata.baseTilesetIdOverride.trim()) {
      context.baseTilesetId = metadata.baseTilesetIdOverride;
    }
    if (metadata.descriptionOverride !== undefined && metadata.descriptionOverride !== null) {
      context.description = metadata.descriptionOverride || undefined;
    }
  }

  return context;
}
