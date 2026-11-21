import { resourceFileKey, resourceRegistry } from '../lib/resourceRegistry';
/**
 * Loads all project resources (tilesets, maps, characters, dialogues, etc.) into
 * the store. Extracted from useEditorStore to keep that file focused on wiring.
 */

import { castDraft } from 'immer';
import type { EditorStore } from './useEditorStore';
import type { StateCreator } from 'zustand';
import { fileSystem } from '../lib/fileSystem';
import { resolveSpriteAsset } from '../lib/asepriteUtils';
import { migrateTilesetOnLoad } from '../lib/tilesetMigration';
import {
  addMissingDefinitionLayers,
  getPreferredSelectedLayerId,
  withHistorySuppressed,
  syncToolStateForSelectedLayer,
} from './storeHelpers';

type SetFn = Parameters<StateCreator<EditorStore, [['zustand/immer', never]], []>>[0];
type GetFn = Parameters<StateCreator<EditorStore, [['zustand/immer', never]], []>>[1];

function setResourceLoadingState(set: SetFn, label: string, progress: number): void {
  set((state) => {
    state.resourceLoadingLabel = label;
    state.resourceLoadingProgress = progress;
  });
}

export async function loadProjectResources(set: SetFn, get: GetFn): Promise<void> {
  setResourceLoadingState(set, 'Loading tilesets', 0.12);

  try {
    // 1. Load all tilesets
    const tilesets = await fileSystem.loadAllTilesets();
    for (const tileset of tilesets) {
      const migratedTileset = migrateTilesetOnLoad(tileset);
      const tilesObjCount = migratedTileset.tiles ? Object.keys(migratedTileset.tiles).length : 0;
      const normalizedTileCount = Math.max(
        migratedTileset.tileCount || 0,
        tilesObjCount,
        migratedTileset.columns || 1,
      );
      const normalized = {
        ...migratedTileset,
        tileCount: normalizedTileCount,
      } as typeof migratedTileset;
      set((state) => {
        state.tilesets.set(migratedTileset.id, castDraft(normalized));
      });

      if (migratedTileset.spriteSheet && !get().loadedSprites.has(migratedTileset.spriteSheet)) {
        try {
          const blob = await fileSystem.loadAsset(migratedTileset.spriteSheet);
          await get().loadSprite(migratedTileset.spriteSheet, blob);
        } catch (e) {
          console.warn(`Failed to load sprite for tileset ${migratedTileset.id}:`, e);
        }
      }
    }

    set((state) => {
      if (!state.activeTilesetId && tilesets.length > 0) {
        state.activeTilesetId = tilesets[0].id;
        state.selectedTileIndex = 0;
      }
    });

    const proj = get().project;

    setResourceLoadingState(set, 'Loading project definitions', 0.28);

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
    const entityTypes = await fileSystem.loadAllEntityTypes();
    const effectiveEntityTypes =
      entityTypes.length > 0 ? entityTypes : (proj?.entityTypes?.map((e) => castDraft(e)) ?? []);
    set((state) => {
      state.entityTypes = castDraft(effectiveEntityTypes);
    });

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

    setResourceLoadingState(set, 'Loading characters and items', 0.48);

    // 1.8 Characters
    const characters = await fileSystem.loadAllCharacters();
    set((state) => {
      state.characters = castDraft(characters);
    });

    // 1.81 Item classes (project-level, stored on project)
    if (proj?.itemClasses?.length) {
      set((state) => {
        state.itemClasses = castDraft(proj.itemClasses!);
      });
    }

    set((state) => {
      state.emotions = castDraft(proj?.emotions ?? []);
    });

    // 1.82 Items
    const items = await fileSystem.loadAllItems();
    set((state) => {
      state.items = castDraft(items);
    });

    // 1.83 Shops
    const shops = await fileSystem.loadAllShops();
    set((state) => {
      state.shops = castDraft(shops);
      state.savedShops = castDraft(Object.fromEntries(shops.map((shop) => [shop.id, shop])));
      state.shopPast = {};
      state.shopFuture = {};
    });

    const quests = await fileSystem.loadAllQuests();
    set((state) => {
      state.quests = castDraft(quests);
      state.savedQuests = castDraft(Object.fromEntries(quests.map((quest) => [quest.id, quest])));
      state.questPast = {};
      state.questFuture = {};
    });

    const objects = await fileSystem.loadAllObjects();
    set((state) => {
      state.objects = castDraft(objects);
      state.savedObjects = castDraft(Object.fromEntries(objects.map((o) => [o.id, o])));
      state.objectPast = {};
      state.objectFuture = {};
    });

    // 1.84 NPC routines
    const routines = await fileSystem.loadAllRoutines();
    set((state) => {
      state.routines = castDraft(routines);
      state.savedRoutines = castDraft(
        Object.fromEntries(routines.map((routine) => [routine.id, routine])),
      );
      state.routinePast = {};
      state.routineFuture = {};
    });

    setResourceLoadingState(set, 'Loading dialogues', 0.64);

    // 1.85 Dialogue documents
    const loadedDialogues = await fileSystem.loadAllDialogues();

    set((state) => {
      state.dialogues = new globalThis.Map(loadedDialogues.map((d) => [d.id, castDraft(d)]));
      state.selectedDialogueId = loadedDialogues[0]?.id ?? null;
      const first = loadedDialogues[0] as unknown as { startNodeId?: string; entryStepId?: string };
      state.selectedDialogueNodeId = first?.startNodeId ?? first?.entryStepId ?? null;
    });

    setResourceLoadingState(set, 'Loading entity assets', 0.78);

    // 1.9 Entity type sprites
    for (const et of get().entityTypes) {
      if (!et.sprite?.path) continue;
      if (get().loadedSprites.has(et.sprite.path)) continue;
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

    setResourceLoadingState(set, 'Loading locations', 0.9);

    // 2. Load all maps
    const maps = await fileSystem.loadAllMaps();
    const layerDefs = get().layerDefinitions;
    const enrichedMaps = maps.map((m) => addMissingDefinitionLayers(m, layerDefs));

    withHistorySuppressed(() =>
      set((state) => {
        state.maps = castDraft(enrichedMaps);
      }),
    );

    try {
      await get().loadCutscenes();
    } catch (error) {
      console.error('Cutscene sources need correction:', error);
    }

    setResourceLoadingState(set, 'Preparing workspace', 0.97);

    if (enrichedMaps.length > 0) {
      withHistorySuppressed(
        () =>
          set((state) => {
            state.currentMap = castDraft(enrichedMaps[0]);
            state.currentMapPath = `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', enrichedMaps[0].id))}`;
            state.selectedLayerId = getPreferredSelectedLayerId(enrichedMaps[0]);
            syncToolStateForSelectedLayer(state, { forceDefault: true });
          }),
        { clearHistory: true },
      );
    }

    set((state) => {
      state.resourcesLoaded = true;
      state.resourceLoadingLabel = null;
      state.resourceLoadingProgress = 1;
    });
  } catch (error) {
    set((state) => {
      state.resourceLoadingLabel = 'Loading failed';
      state.resourceLoadingProgress = 0;
    });
    throw error;
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
