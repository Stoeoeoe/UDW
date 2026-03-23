import type { Map, Layer, LayerDefinition, Variation, Project } from '../types/schema';
import { encodeTileRef } from '../lib/tileRef';
import { fileSystem } from '../lib/fileSystem';
import { useSaveStore } from '../lib/saveManager';

// Module-level tracker for object URLs created for sprite blobs.
// Allows revocation when sprites are replaced or tilesets are removed.
export const spriteObjectUrls = new globalThis.Map<string, string>();

/** Creates an empty 2D grid filled with null values */
export function createEmptyGrid(width: number, height: number): (number | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

/** Creates an empty 2D grid filled with null values for variations */
export function createEmptyStringGrid(
  width: number,
  height: number,
): (string | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

/** Adds missing layers from layer definitions to a map */
export function addMissingDefinitionLayers(
  map: Map,
  layerDefs: LayerDefinition[],
): Map {
  if (layerDefs.length === 0) return map;

  const existingDefIds = new Set(
    map.layers.filter((l) => l.definitionId).map((l) => l.definitionId),
  );
  const missingDefs = layerDefs.filter((def) => !existingDefIds.has(def.id));
  if (missingDefs.length === 0) return map;

  const newLayers: Layer[] = missingDefs.map((def) => ({
    id: def.id,
    name: def.name,
    kind: 'visual' as const,
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: def.zIndex,
    data: createEmptyGrid(map.width, map.height),
    definitionId: def.id,
  }));

  const allLayers = [...map.layers, ...newLayers].sort(
    (a, b) => a.zOrder - b.zOrder,
  );
  return { ...map, layers: allLayers };
}

/** Creates layers from layer definitions */
export function createLayersFromDefinitions(
  layerDefs: LayerDefinition[],
  width: number,
  height: number,
): Layer[] {
  return layerDefs
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((def) => ({
      id: def.id,
      name: def.name,
      kind: 'visual' as const,
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: def.zIndex,
      data: createEmptyGrid(width, height),
      definitionId: def.id,
    }));
}

/** Creates a default ground layer */
export function createDefaultLayer(width: number, height: number): Layer {
  return {
    id: 'ground',
    name: 'Ground',
    kind: 'visual',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    data: createEmptyGrid(width, height),
  };
}

/** Ensures a variation has a layer override initialized */
export function ensureVariationLayerOverride(
  variation: Variation,
  layerId: string,
  width: number,
  height: number,
): void {
  if (!variation.layerOverrides) variation.layerOverrides = {};
  if (!variation.layerOverrides[layerId]) {
    variation.layerOverrides[layerId] = {
      mode: 'merge',
      data: createEmptyStringGrid(width, height),
    };
  }
}

/** Sets a tile value, handling variation overrides */
export function setTileInState(
  map: Map,
  activeVariationId: string | null,
  layerId: string,
  x: number,
  y: number,
  value: string | null,
): void {
  if (activeVariationId) {
    const variation = map.variations?.find((v) => v.id === activeVariationId);
    if (variation) {
      ensureVariationLayerOverride(variation, layerId, map.width, map.height);
      variation.layerOverrides![layerId].data[y][x] = value; // Keep as string for variations
      return;
    }
  }
  const encodedValue = value ? encodeTileRef(value, map.tilesetRefs) : null;
  const layer = map.layers.find((l) => l.id === layerId);
  if (layer && layer.data[y] && !layer.locked) {
    layer.data[y][x] = encodedValue;
  }
}

/** Persists project data to project.json with save status feedback */
export async function persistProject(project: Project): Promise<void> {
  useSaveStore.getState().setStatus('saving');
  await fileSystem.saveJson('', 'project.json', project);
  useSaveStore.getState().setStatus('saved');
  setTimeout(() => {
    if (useSaveStore.getState().status === 'saved')
      useSaveStore.getState().setStatus('idle');
  }, 2000);
}
