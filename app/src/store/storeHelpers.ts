/**
 * Pure helper functions and shared utilities used across store slices.
 * This file never imports from useEditorStore — store refs are injected
 * via registerTemporalStore() after creation.
 */

import { castDraft } from 'immer';
import type { TemporalState } from 'zundo';
import {
  Project,
  Map as GameMap,
  Layer,
  LayerDefinition,
  EntityInstance,
  EntityOverride,
  Variation,
  PropertyValues,
} from '../types/schema';
import { ToolType } from '../types/editor';
import { saveProjectDebounced } from '../lib/saveManager';
import { encodeTileRef } from '../lib/tileRef';

// ============================================================================
// History suppression infrastructure
// ============================================================================

type TemporalGetState = () => TemporalState<{ currentMap: unknown }>;

let _temporalGetState: TemporalGetState | null = null;

// Module-level history state shared between withHistorySuppressed and the
// batch helpers in useEditorStore.ts.
export let historySuppressionDepth = 0;
export let historyBatchCaptured = false;

/** Called once, right after the store is created in useEditorStore.ts. */
export function registerTemporalStore(fn: TemporalGetState): void {
  _temporalGetState = fn;
}

export function setHistoryBatchCaptured(value: boolean): void {
  historyBatchCaptured = value;
}

export function withHistorySuppressed<T>(fn: () => T, options?: { clearHistory?: boolean }): T {
  if (!_temporalGetState) return fn();

  const temporalState = _temporalGetState();
  const shouldResume = temporalState.isTracking && historySuppressionDepth === 0;

  historySuppressionDepth += 1;
  temporalState.pause();

  try {
    const result = fn();
    if (options?.clearHistory) {
      temporalState.clear();
      historyBatchCaptured = false;
    }
    return result;
  } finally {
    historySuppressionDepth -= 1;
    if (shouldResume && historySuppressionDepth === 0) {
      temporalState.resume();
    }
  }
}

// ============================================================================
// Grid helpers
// ============================================================================

export function createEmptyGrid(width: number, height: number): (number | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

export function createEmptyStringGrid(width: number, height: number): (string | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

// ============================================================================
// Layer helpers
// ============================================================================

export function addMissingDefinitionLayers(map: GameMap, layerDefs: LayerDefinition[]): GameMap {
  if (layerDefs.length === 0) return map;

  const existingDefIds = new Set(
    map.layers.filter((l) => l.definitionId).map((l) => l.definitionId),
  );
  const missingDefs = layerDefs.filter((def) => !existingDefIds.has(def.id));
  if (missingDefs.length === 0) return map;

  const newLayers: Layer[] = missingDefs.map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.type === 'entity' ? 'entity' : def.type === 'terrain' ? 'terrain' : 'visual',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: def.zIndex,
    ...(def.type === 'entity'
      ? { entities: [] as EntityInstance[] }
      : {
          data: createEmptyGrid(map.width, map.height),
          ...(def.type === 'terrain'
            ? { terrainData: createEmptyStringGrid(map.width, map.height) }
            : {}),
        }),
    definitionId: def.id,
  }));

  const allLayers = [...map.layers, ...newLayers].sort((a, b) => a.zOrder - b.zOrder);
  return { ...map, layers: allLayers };
}

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
      kind: def.type === 'entity' ? 'entity' : def.type === 'terrain' ? 'terrain' : 'visual',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: def.zIndex,
      ...(def.type === 'entity'
        ? { entities: [] as EntityInstance[] }
        : {
            data: createEmptyGrid(width, height),
            ...(def.type === 'terrain'
              ? { terrainData: createEmptyStringGrid(width, height) }
              : {}),
          }),
      definitionId: def.id,
    }));
}

/**
 * Ensures a single 'navigation' layer exists on the map. Used as the
 * host layer for anchors, triggers, and location links.
 */
export function ensureNavigationLayer(map: GameMap): GameMap {
  const hasNavLayer = map.layers.some((l) => l.kind === 'navigation');
  if (hasNavLayer) return map;
  const navLayer: Layer = {
    id: 'navigation',
    name: 'Navigation',
    kind: 'navigation',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 9999,
  };
  return { ...map, layers: [...map.layers, navLayer] };
}

export function ensureCollisionLayer(map: GameMap): GameMap {
  const hasCollisionLayer = map.layers.some((l) => l.kind === 'collision');
  if (hasCollisionLayer) return map;
  const collisionLayer: Layer = {
    id: 'collision',
    name: 'Collision',
    kind: 'collision',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 9998,
  };
  return { ...map, layers: [...map.layers, collisionLayer] };
}

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

// ============================================================================
// Tool / layer sync helpers
// ============================================================================

export function getEffectiveToolLayerKind(layer: Layer): Layer['kind'] {
  return layer.kind;
}

export const DEFAULT_TOOL_BY_KIND: Record<Layer['kind'], ToolType> = {
  terrain: 'terrain',
  visual: 'stamp',
  object: 'objectPlace',
  collision: 'collisionSelect',
  navigation: 'select',
  metadata: 'stamp',
  entity: 'entitySelect',
  water: 'waterBrush',
};

export const VALID_TOOLS_BY_KIND: Record<Layer['kind'], ToolType[]> = {
  terrain: ['terrain', 'erase'],
  visual: ['stamp', 'random', 'erase', 'fill', 'terrain', 'select'],
  object: ['objectSelect', 'objectPlace', 'objectDelete'],
  collision: ['collisionSelect', 'collisionRect', 'collisionPolygon', 'collisionCircle'],
  navigation: ['select', 'anchorPlace', 'triggerPlace', 'triggerPolygon', 'linkPlace'],
  metadata: ['stamp', 'erase', 'fill', 'select'],
  entity: ['entitySelect', 'entityPlace', 'entityDelete'],
  water: ['waterBrush', 'waterErase', 'waterFlow', 'waterFlowErase'],
};

export function getPreferredSelectedLayerId(map: GameMap | null): string | null {
  if (!map) return null;
  const firstNonNav = map.layers.find((layer) => layer.kind !== 'navigation');
  return firstNonNav?.id ?? map.layers[0]?.id ?? null;
}

/**
 * Choose a preferred layer id for a newly-loaded map, attempting to preserve
 * the user's previous selection by id, then by name, then by kind, falling
 * back to the regular preferred layer.
 */
export function choosePreferredSelectedLayerId(
  map: GameMap | null,
  prevSelectedLayerId: string | null,
  prevSelectedLayerName: string | null,
  prevLayerKind: Layer['kind'] | null,
): string | null {
  if (!map) return null;

  // 1) Try same id
  if (prevSelectedLayerId) {
    const sameId = map.layers.find((l) => l.id === prevSelectedLayerId);
    if (sameId) return sameId.id;
  }

  // 2) Try same name
  if (prevSelectedLayerName) {
    const sameName = map.layers.find((l) => l.name === prevSelectedLayerName);
    if (sameName) return sameName.id;
  }

  // 3) Try same kind (first match)
  if (prevLayerKind) {
    const sameKind = map.layers.find((l) => l.kind === prevLayerKind);
    if (sameKind) return sameKind.id;
  }

  // 4) Fallback
  return getPreferredSelectedLayerId(map);
}

export function syncToolStateForSelectedLayer(
  state: {
    currentMap: GameMap | null;
    selectedLayerId: string | null;
    activeTool: ToolType;
    selectedTerrainId: string | null;
    terrainTypes: Array<{ id: string }>;
    selectedLinkId: string | null;
    selectedAnchorId: string | null;
    selectedEntityId: string | null;
    selectedObjectInstanceId: string | null;
    selectedEntityIds: Set<string>;
    selectedTriggerId: string | null;
    selectedCollisionId: string | null;
  },
  options: { forceDefault?: boolean } = {},
): void {
  const layer = state.currentMap?.layers.find(
    (candidate) => candidate.id === state.selectedLayerId,
  );
  if (!layer) return;

  const effectiveKind = getEffectiveToolLayerKind(layer);
  const validTools = VALID_TOOLS_BY_KIND[effectiveKind] ?? ['stamp'];
  if (options.forceDefault || !validTools.includes(state.activeTool)) {
    state.activeTool = DEFAULT_TOOL_BY_KIND[effectiveKind] ?? 'stamp';
  }

  if (effectiveKind === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
    state.selectedTerrainId = state.terrainTypes[0].id;
  }

  if (layer.kind !== 'navigation') {
    state.selectedLinkId = null;
    state.selectedAnchorId = null;
    state.selectedTriggerId = null;
  }
  if (layer.kind !== 'collision') {
    state.selectedCollisionId = null;
  }
  if (layer.kind !== 'entity') {
    state.selectedEntityId = null;
    state.selectedEntityIds = new Set();
  }
  if (effectiveKind !== 'object') {
    state.selectedObjectInstanceId = null;
  }
}

// ============================================================================
// Tile helpers
// ============================================================================

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

export function setTileInState(
  map: GameMap,
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
      variation.layerOverrides![layerId].data[y][x] = value;
      return;
    }
  }
  const layer = map.layers.find((l) => l.id === layerId);
  if (!layer || layer.locked) return;

  if (value) {
    const tilesetId = value.slice(0, value.lastIndexOf(':'));
    if (tilesetId && !map.tilesetRefs.includes(tilesetId)) {
      map.tilesetRefs.push(tilesetId);
    }
  }

  const encodedValue = value ? encodeTileRef(value, map.tilesetRefs) : null;
  if (layer.data && layer.data[y]) {
    layer.data[y][x] = encodedValue;
  }
}

// ============================================================================
// Entity override helper
// ============================================================================

/**
 * Applies a mutation to an entity, routing through the variation override
 * system when a variation is active. The `patch` callback receives the entity
 * (or sparse override entity) and mutates it in place — safe inside immer.
 *
 * Used by moveEntity, updateEntityLabel, updateEntityProperties to eliminate
 * identical 50-line override scaffolding in each action.
 */
export function applyEntityPatch(
  map: GameMap,
  activeVariationId: string | null,
  entityId: string,
  patch: (entity: Partial<EntityInstance>) => void,
): void {
  if (activeVariationId) {
    const variation = map.variations?.find((v) => v.id === activeVariationId);
    if (variation) {
      if (!variation.entityOverrides) variation.entityOverrides = [];

      const existingAdd = variation.entityOverrides.find(
        (o): o is EntityOverride & { entity: Partial<EntityInstance> } =>
          o.action === 'add' && o.entity?.id === entityId,
      );
      if (existingAdd?.entity) {
        patch(existingAdd.entity);
        return;
      }

      const existingModify = variation.entityOverrides.find(
        (o): o is EntityOverride & { action: 'modify'; entityId: string } =>
          o.action === 'modify' && o.entityId === entityId,
      );
      if (existingModify) {
        if (!existingModify.entity) existingModify.entity = {} as Partial<EntityInstance>;
        patch(existingModify.entity);
      } else {
        const newOverride: EntityOverride = {
          action: 'modify',
          entityId,
          entity: {} as Partial<EntityInstance>,
        };
        patch(newOverride.entity!);
        variation.entityOverrides.push(newOverride);
      }
      return;
    }
  }

  const topLevel = map.entities.find((e) => e.id === entityId);
  if (topLevel) {
    patch(topLevel);
    return;
  }

  for (const layer of map.layers) {
    if (layer.kind === 'entity' && layer.entities) {
      const layerEntity = layer.entities.find((e) => e.id === entityId);
      if (layerEntity) {
        patch(layerEntity);
        return;
      }
    }
  }
}

// ============================================================================
// Persistence helpers
// ============================================================================

export async function persistProject(project: Project): Promise<void> {
  saveProjectDebounced(project, 'configuration');
}

// ============================================================================
// Tileset debounced save state
// ============================================================================

export const TILESET_SAVE_DEBOUNCE_MS = 300;
export const pendingTilesetSaves = new globalThis.Map<string, ReturnType<typeof setTimeout>>();

// Re-export PropertyValues for use in applyEntityPatch callers
export type { PropertyValues };
