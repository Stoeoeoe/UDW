/**
 * Loads all project resources (tilesets, maps, actors, dialogues, etc.) into
 * the store. Extracted from useEditorStore to keep that file focused on wiring.
 */

import { castDraft } from 'immer';
import type { EditorStore } from './useEditorStore';
import type { StateCreator } from 'zustand';
import { fileSystem } from '../lib/fileSystem';
import { resolveSpriteAsset } from '../lib/asepriteUtils';
import { DialogueIndex } from '../types/schema';
import {
  addMissingDefinitionLayers,
  getPreferredSelectedLayerId,
  withHistorySuppressed,
  syncToolStateForSelectedLayer,
} from './storeHelpers';

type SetFn = Parameters<StateCreator<EditorStore, [['zustand/immer', never]], []>>[0];
type GetFn = Parameters<StateCreator<EditorStore, [['zustand/immer', never]], []>>[1];

export async function loadProjectResources(set: SetFn, get: GetFn): Promise<void> {
  // 1. Load all tilesets
  const tilesets = await fileSystem.loadAllTilesets();
  for (const tileset of tilesets) {
    const tilesObjCount = tileset.tiles ? Object.keys(tileset.tiles).length : 0;
    const normalizedTileCount = Math.max(
      tileset.tileCount || 0,
      tilesObjCount,
      tileset.columns || 1,
    );
    const normalized = { ...tileset, tileCount: normalizedTileCount } as typeof tileset;
    set((state) => {
      state.tilesets.set(tileset.id, castDraft(normalized));
    });

    try {
      const blob = await fileSystem.loadAsset(tileset.spriteSheet);
      await get().loadSprite(tileset.spriteSheet, blob);
    } catch (e) {
      console.warn(`Failed to load sprite for tileset ${tileset.id}:`, e);
    }
  }

  set((state) => {
    if (!state.activeTilesetId && tilesets.length > 0) {
      state.activeTilesetId = tilesets[0].id;
      state.selectedTileIndex = 0;
    }
  });

  const proj = get().project;

  // 1.5 Terrain types
  if (proj?.terrainTypes?.length) {
    set((state) => {
      state.terrainTypes = proj.terrainTypes!.map((t) => castDraft(t));
    });
  }

  // 1.6 Layer definitions
  if (proj?.layerDefinitions?.length) {
    set((state) => {
      state.layerDefinitions = proj.layerDefinitions!.map((d) => castDraft(d));
    });
  }

  // 1.7 Entity types
  if (proj?.entityTypes?.length) {
    set((state) => {
      state.entityTypes = proj.entityTypes!.map((e) => castDraft(e));
    });
  }

  // 1.72 Tile metadata definitions
  if (proj?.tileMetadataDefinitions?.length) {
    set((state) => {
      state.tileMetadataDefinitions = proj.tileMetadataDefinitions!.map((d) => castDraft(d));
    });
  }

  // 1.73 Location (map) metadata definitions
  if (proj?.locationMetadataDefinitions?.length) {
    set((state) => {
      state.locationMetadataDefinitions = proj.locationMetadataDefinitions!.map((d) =>
        castDraft(d),
      );
    });
  }

  // 1.75 Game variables
  if (proj?.gameVariables?.length) {
    set((state) => {
      state.gameVariables = castDraft(proj.gameVariables!);
    });
  }

  // 1.76 Scripting primitives
  if (proj?.scriptTables?.length) {
    set((state) => {
      state.scriptTables = castDraft(proj.scriptTables!);
    });
  }
  if (proj?.scriptFunctions?.length) {
    set((state) => {
      state.scriptFunctions = castDraft(proj.scriptFunctions!);
    });
  }
  if (proj?.scriptNamespaces?.length) {
    set((state) => {
      state.scriptNamespaces = castDraft(proj.scriptNamespaces!);
    });
  }
  if (proj?.scriptContextTypes?.length) {
    set((state) => {
      state.scriptContextTypes = castDraft(proj.scriptContextTypes!);
    });
  }

  // 1.8 Actors
  const actors = await fileSystem.loadAllActors();
  set((state) => {
    state.actors = castDraft(actors);
  });

  // 1.81 Item classes (project-level, stored on project)
  if (proj?.itemClasses?.length) {
    set((state) => {
      state.itemClasses = castDraft(proj.itemClasses!);
    });
  }

  // 1.82 Items
  const items = await fileSystem.loadAllItems();
  set((state) => {
    state.items = castDraft(items);
  });

  // 1.85 Dialogue index + documents
  const loadedDialogueIndex: DialogueIndex = (await fileSystem.readDialogueIndex()) ?? {
    version: 1,
    categories: [],
    customActors: [],
    dialogues: [],
  };

  const loadedDialogues = await fileSystem.loadDialoguesByIds(
    loadedDialogueIndex.dialogues.map((entry) => entry.id),
  );

  set((state) => {
    state.dialogueIndex = castDraft(loadedDialogueIndex);
    state.dialogues = new globalThis.Map(loadedDialogues.map((d) => [d.id, castDraft(d)]));
    state.selectedDialogueId = loadedDialogues[0]?.id ?? null;
    const first = loadedDialogues[0] as unknown as { startNodeId?: string; entryStepId?: string };
    state.selectedDialogueNodeId = first?.startNodeId ?? first?.entryStepId ?? null;
  });

  // 1.9 Entity type sprites
  for (const et of get().entityTypes) {
    if (!et.sprite?.path) continue;
    try {
      const path = et.sprite.path;
      const looksRelative = !path.match(/^([A-Za-z]:[/\\]|\/)/);
      const blob = looksRelative
        ? await fileSystem.loadAsset(path)
        : await fileSystem.readFileAsBlob(path);
      await get().loadSprite(path, blob);
    } catch (e) {
      console.warn(`Failed to load sprite for entity type ${et.id}:`, e);
    }
  }

  // 2. Load all maps
  const maps = await fileSystem.loadAllMaps();
  const layerDefs = get().layerDefinitions;
  const enrichedMaps = maps.map((m) => addMissingDefinitionLayers(m, layerDefs));

  withHistorySuppressed(() =>
    set((state) => {
      state.maps = castDraft(enrichedMaps);
    }),
  );

  if (enrichedMaps.length > 0) {
    withHistorySuppressed(
      () =>
        set((state) => {
          state.currentMap = castDraft(enrichedMaps[0]);
          state.currentMapPath = `maps/${enrichedMaps[0].id}.vmap`;
          state.selectedLayerId = getPreferredSelectedLayerId(enrichedMaps[0]);
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    );
  }
}

/** Loads a single image asset, resolves Aseprite if needed, and registers it. */
export async function loadSprite(path: string, blob: Blob, set: SetFn): Promise<string> {
  const resolved = await resolveSpriteAsset(path, blob);
  const url = URL.createObjectURL(resolved.imageBlob);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });
  set((state) => {
    state.loadedSprites = new Map(state.loadedSprites);
    state.loadedSprites.set(path, castDraft(img));
  });
  return url;
}
