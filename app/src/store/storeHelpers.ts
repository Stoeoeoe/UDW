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
  GameVariable,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
  PropertyValues,
} from '../types/schema';
import { ToolType } from '../types/editor';
import { fileSystem } from '../lib/fileSystem';
import { useSaveStore } from '../lib/saveManager';
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

export function ensureLocationLinkLayer(map: GameMap): GameMap {
  const hasLinkLayer = map.layers.some((l) => l.kind === 'locationlink');
  if (hasLinkLayer) return map;
  const linkLayer: Layer = {
    id: 'location-links',
    name: 'Location Links',
    kind: 'locationlink',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 9999,
  };
  return { ...map, layers: [...map.layers, linkLayer] };
}

export function ensureAnchorLayer(map: GameMap): GameMap {
  const hasAnchorLayer = map.layers.some((l) => l.kind === 'anchor');
  if (hasAnchorLayer) return map;
  const anchorLayer: Layer = {
    id: 'anchors',
    name: 'Anchors',
    kind: 'anchor',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 9998,
  };
  return { ...map, layers: [...map.layers, anchorLayer] };
}

export function ensureTriggerLayer(map: GameMap): GameMap {
  const hasTriggerLayer = map.layers.some((l) => l.kind === 'trigger');
  if (hasTriggerLayer) return map;
  const triggerLayer: Layer = {
    id: 'triggers',
    name: 'Triggers',
    kind: 'trigger',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 9997,
  };
  return { ...map, layers: [...map.layers, triggerLayer] };
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

export const DEFAULT_TOOL_BY_KIND: Record<Layer['kind'], ToolType> = {
  terrain: 'terrain',
  visual: 'stamp',
  collision: 'stamp',
  navigation: 'stamp',
  metadata: 'stamp',
  entity: 'entitySelect',
  anchor: 'anchorSelect',
  locationlink: 'linkSelect',
  trigger: 'triggerSelect',
};

export const VALID_TOOLS_BY_KIND: Record<Layer['kind'], ToolType[]> = {
  terrain: ['terrain', 'erase'],
  visual: ['stamp', 'random', 'erase', 'fill', 'terrain', 'select'],
  collision: ['stamp', 'erase', 'fill', 'select'],
  navigation: ['stamp', 'erase', 'fill', 'select'],
  metadata: ['stamp', 'erase', 'fill', 'select'],
  entity: ['entitySelect', 'entityPlace', 'entityDelete'],
  anchor: ['anchorSelect', 'anchorDelete'],
  locationlink: ['linkPlace', 'linkSelect', 'linkDelete'],
  trigger: ['triggerPlace', 'triggerPolygon', 'triggerSelect', 'triggerDelete'],
};

export function getPreferredSelectedLayerId(map: GameMap | null): string | null {
  if (!map) return null;
  const SYSTEM_KINDS = new Set(['locationlink', 'anchor', 'trigger']);
  const firstNonSystem = map.layers.find((layer) => !SYSTEM_KINDS.has(layer.kind));
  const firstNonLink = map.layers.find((layer) => layer.kind !== 'locationlink');
  return firstNonSystem?.id ?? firstNonLink?.id ?? map.layers[0]?.id ?? null;
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
    selectedEntityIds: Set<string>;
    selectedTriggerId: string | null;
  },
  options: { forceDefault?: boolean } = {},
): void {
  const layer = state.currentMap?.layers.find(
    (candidate) => candidate.id === state.selectedLayerId,
  );
  if (!layer) return;

  const validTools = VALID_TOOLS_BY_KIND[layer.kind] ?? ['stamp'];
  if (options.forceDefault || !validTools.includes(state.activeTool)) {
    state.activeTool = DEFAULT_TOOL_BY_KIND[layer.kind] ?? 'stamp';
  }

  if (layer.kind === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
    state.selectedTerrainId = state.terrainTypes[0].id;
  }

  if (layer.kind !== 'locationlink') state.selectedLinkId = null;
  if (layer.kind !== 'anchor') state.selectedAnchorId = null;
  if (layer.kind !== 'trigger') state.selectedTriggerId = null;
  if (layer.kind !== 'entity') {
    state.selectedEntityId = null;
    state.selectedEntityIds = new Set();
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
  const encodedValue = value ? encodeTileRef(value, map.tilesetRefs) : null;
  const layer = map.layers.find((l) => l.id === layerId);
  if (layer && layer.data && layer.data[y] && !layer.locked) {
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
  useSaveStore.getState().setStatus('saving');
  await fileSystem.saveJson('', `${project.id}.vproj`, {
    $schema: '../schemas/project.schema.json',
    ...project,
  });
  useSaveStore.getState().setStatus('saved');
  setTimeout(() => {
    if (useSaveStore.getState().status === 'saved') useSaveStore.getState().setStatus('idle');
  }, 2000);
}

export type ScriptingStateSnapshot = {
  project: Project | null;
  gameVariables: GameVariable[];
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  scriptContextTypes: ScriptContextType[];
};

export async function persistScriptingState(
  snapshot: ScriptingStateSnapshot,
  setState: (updater: (s: { project: Project | null }) => void) => void,
): Promise<void> {
  const proj = snapshot.project;
  if (!proj) return;
  const projectToSave = {
    ...proj,
    gameVariables: snapshot.gameVariables,
    scriptTables: snapshot.scriptTables,
    scriptFunctions: snapshot.scriptFunctions,
    scriptNamespaces: snapshot.scriptNamespaces,
    scriptContextTypes: snapshot.scriptContextTypes,
  };
  await persistProject(projectToSave);
  setState((state) => {
    state.project = castDraft(projectToSave);
  });
}

// ============================================================================
// Tileset debounced save state
// ============================================================================

export const TILESET_SAVE_DEBOUNCE_MS = 300;
export const pendingTilesetSaves = new globalThis.Map<string, ReturnType<typeof setTimeout>>();

// Re-export PropertyValues for use in applyEntityPatch callers
export type { PropertyValues };
