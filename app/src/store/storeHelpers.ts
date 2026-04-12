/**
 * Pure helper functions and shared utilities used across store slices.
 * Nothing in this file references the store instance itself.
 */

import { castDraft } from 'immer';
import {
  Project,
  Map as GameMap,
  Layer,
  LayerDefinition,
  EntityInstance,
  Variation,
  GameVariable,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
} from '../types/schema';
import { ToolType } from '../types/editor';
import { fileSystem } from '../lib/fileSystem';
import { useSaveStore } from '../lib/saveManager';
import { encodeTileRef } from '../lib/tileRef';

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
  locationlink: 'linkSelect',
};

export const VALID_TOOLS_BY_KIND: Record<Layer['kind'], ToolType[]> = {
  terrain: ['terrain', 'erase'],
  visual: ['stamp', 'random', 'erase', 'fill', 'terrain', 'select'],
  collision: ['stamp', 'erase', 'fill', 'select'],
  navigation: ['stamp', 'erase', 'fill', 'select'],
  metadata: ['stamp', 'erase', 'fill', 'select'],
  entity: ['entitySelect', 'entityPlace', 'entityDelete'],
  locationlink: ['linkSelect', 'linkDelete'],
};

export function getPreferredSelectedLayerId(map: GameMap | null): string | null {
  if (!map) return null;
  const firstNonLink = map.layers.find((layer) => layer.kind !== 'locationlink');
  return firstNonLink?.id ?? map.layers[0]?.id ?? null;
}

export function syncToolStateForSelectedLayer(
  state: {
    currentMap: GameMap | null;
    selectedLayerId: string | null;
    activeTool: ToolType;
    selectedTerrainId: string | null;
    terrainTypes: Array<{ id: string }>;
    selectedLinkId: string | null;
    selectedEntityId: string | null;
    selectedEntityIds: Set<string>;
  },
  options: { forceDefault?: boolean } = {},
): void {
  const layer = state.currentMap?.layers.find(
    (candidate) => candidate.id === state.selectedLayerId,
  );
  if (!layer) {
    return;
  }

  const validTools = VALID_TOOLS_BY_KIND[layer.kind] ?? ['stamp'];
  if (options.forceDefault || !validTools.includes(state.activeTool)) {
    state.activeTool = DEFAULT_TOOL_BY_KIND[layer.kind] ?? 'stamp';
  }

  if (layer.kind === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
    state.selectedTerrainId = state.terrainTypes[0].id;
  }

  if (layer.kind !== 'locationlink') {
    state.selectedLinkId = null;
  }

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
// Persistence helpers
// ============================================================================

export async function persistProject(project: Project): Promise<void> {
  useSaveStore.getState().setStatus('saving');
  await fileSystem.saveJson('', `${project.id}.project.json`, {
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
// Tileset debounced save
// ============================================================================

export const TILESET_SAVE_DEBOUNCE_MS = 300;
export const pendingTilesetSaves = new globalThis.Map<string, ReturnType<typeof setTimeout>>();
