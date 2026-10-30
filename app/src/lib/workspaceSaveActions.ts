import { resourceFileKey, resourceRegistry } from './resourceRegistry';
import {
  cancelPendingSaveUnit,
  clearSaveUnit,
  saveMapImmediate,
  saveProjectImmediate,
  saveTilesetImmediate,
  getDirtySaveUnitIds,
} from './saveManager';
import { fileSystem } from './fileSystem';
import { useEditorStore } from '../store/useEditorStore';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { WorkspaceDocument, WorkspaceTab } from '../types/workspace';
import { addMissingDefinitionLayers, ensureNavigationLayer } from '../store/storeHelpers';
import { deserializeMap } from './mapMigration';
import { migrateMapToEncodedData } from './tileRef';
import { Map as GameMap, Project, Tileset } from '../types/schema';

type WorkspaceSaveOverride = {
  saveTab?: (tab: WorkspaceTab) => Promise<void>;
  saveAll?: () => Promise<void>;
};

const workspaceSaveOverrides = new Map<WorkspaceDocument['kind'], WorkspaceSaveOverride>();

export function registerWorkspaceTabSaveOverride(
  kind: WorkspaceDocument['kind'],
  override: WorkspaceSaveOverride,
): () => void {
  workspaceSaveOverrides.set(kind, override);
  return () => {
    if (workspaceSaveOverrides.get(kind) === override) {
      workspaceSaveOverrides.delete(kind);
    }
  };
}

export function canSaveWorkspaceTab(tab: WorkspaceTab | null): boolean {
  if (!tab) return false;

  if (workspaceSaveOverrides.has(tab.document.kind)) {
    return true;
  }

  return (
    tab.document.kind === 'location' ||
    tab.document.kind === 'tileset' ||
    tab.document.kind === 'configuration' ||
    tab.document.kind === 'settings' ||
    tab.document.kind === 'entities' ||
    tab.document.kind === 'scripting' ||
    tab.document.kind === 'data' ||
    tab.document.kind === 'cutscene' ||
    tab.document.kind === 'cutscenes' ||
    tab.document.kind === 'dialogues'
  );
}

export async function saveWorkspaceTab(tab: WorkspaceTab | null): Promise<void> {
  if (!tab) return;

  const override = workspaceSaveOverrides.get(tab.document.kind);
  if (override?.saveTab) {
    await override.saveTab(tab);
    return;
  }

  const editor = useEditorStore.getState();
  const document = tab.document;
  if (document.kind === 'cutscene') {
    await editor.saveCutscene(document.cutsceneId);
    return;
  }
  if (document.kind === 'cutscenes' && editor.selectedCutsceneId) {
    await editor.saveCutscene(editor.selectedCutsceneId);
    return;
  }

  if (document.kind === 'location') {
    const map =
      editor.currentMap?.id === document.mapId
        ? editor.currentMap
        : (editor.maps.find((entry) => entry.id === document.mapId) ?? null);
    if (map) {
      await saveMapImmediate(map);
    }
    return;
  }

  if (document.kind === 'tileset') {
    const tileset = editor.tilesets.get(document.tilesetId);
    if (tileset) {
      await saveTilesetImmediate(tileset);
    }
    return;
  }

  if (document.kind === 'configuration') {
    if (editor.project) {
      await saveProjectImmediate(editor.project, 'configuration');
    }
    return;
  }

  if (document.kind === 'settings') {
    useAppSettingsStore.getState().saveDraft();
    return;
  }

  if ((document.kind === 'entities' || document.kind === 'scripting' || document.kind === 'data') && editor.project) {
    await saveProjectImmediate(editor.project, 'configuration');
  }
}

export async function saveAllDirtyWorkspaceUnits(): Promise<void> {
  const editor = useEditorStore.getState();
  const dirtySaveUnits = getDirtySaveUnitIds();

  for (const saveUnitId of dirtySaveUnits) {
    if (saveUnitId.startsWith('cutscene:')) {
      await editor.saveCutscene(saveUnitId.slice('cutscene:'.length));
      continue;
    }
    if (saveUnitId.startsWith('location:')) {
      const mapId = saveUnitId.slice('location:'.length);
      const map =
        editor.currentMap?.id === mapId
          ? editor.currentMap
          : (editor.maps.find((entry) => entry.id === mapId) ?? null);
      if (map) {
        await saveMapImmediate(map);
      }
      continue;
    }

    if (saveUnitId.startsWith('tileset:')) {
      const tilesetId = saveUnitId.slice('tileset:'.length);
      const tileset = editor.tilesets.get(tilesetId);
      if (tileset) {
        await saveTilesetImmediate(tileset);
      }
      continue;
    }

    if (saveUnitId === 'configuration') {
      if (editor.project) {
        await saveProjectImmediate(editor.project, 'configuration');
      }
      continue;
    }

    if (saveUnitId === 'settings') {
      useAppSettingsStore.getState().saveDraft();
    }
  }

  for (const override of workspaceSaveOverrides.values()) {
    if (override.saveAll) {
      await override.saveAll();
    }
  }
}

function applyDiscardedProject(nextProject: Project): void {
  const editor = useEditorStore.getState();
  const nextMaps = editor.maps.map((map) =>
    ensureNavigationLayer(addMissingDefinitionLayers(map, nextProject.layerDefinitions ?? [])),
  );
  const nextCurrentMap = editor.currentMap
    ? (nextMaps.find((map) => map.id === editor.currentMap?.id) ?? null)
    : null;

  useEditorStore.setState({
    project: nextProject,
    terrainTypes: nextProject.terrainTypes ?? [],
    layerDefinitions: nextProject.layerDefinitions ?? [],
    tileMetadataDefinitions: nextProject.tileMetadataDefinitions ?? [],
    locationMetadataDefinitions: nextProject.locationMetadataDefinitions ?? [],
    itemClasses: nextProject.itemClasses ?? [],
    maps: nextMaps,
    currentMap: nextCurrentMap,
  });

  if (nextCurrentMap) {
    useEditorStore.getState().setCurrentMap(nextCurrentMap);
  }
}

function normalizeTileset(rawTileset: Tileset): Tileset {
  const tilesObjCount = rawTileset.tiles ? Object.keys(rawTileset.tiles).length : 0;
  return {
    ...rawTileset,
    tileCount: Math.max(rawTileset.tileCount || 0, tilesObjCount, rawTileset.columns || 1),
  };
}

export async function discardWorkspaceTabChanges(tab: WorkspaceTab | null): Promise<void> {
  if (!tab) return;

  const { document } = tab;
  if (document.kind === 'cutscene') {
    useEditorStore.getState().discardCutscene(document.cutsceneId);
    return;
  }
  if (document.kind === 'cutscenes') {
    const editor = useEditorStore.getState();
    if (editor.selectedCutsceneId) editor.discardCutscene(editor.selectedCutsceneId);
    return;
  }
  cancelPendingSaveUnit(document.saveUnitId);

  if (document.kind === 'settings') {
    useAppSettingsStore.getState().resetDraft();
    clearSaveUnit(document.saveUnitId);
    return;
  }

  if (
    document.kind === 'configuration' ||
    document.kind === 'entities' ||
    document.kind === 'scripting' ||
    document.kind === 'data'
  ) {
    const editor = useEditorStore.getState();
    if (!editor.project) return;
    const rawProject = await fileSystem.readJson(
      resourceRegistry.project.folder,
      resourceFileKey('project', editor.project.id),
    );
    if (!rawProject) return;
    applyDiscardedProject(rawProject as Project);
    clearSaveUnit(document.saveUnitId);
    return;
  }

  if (document.kind === 'entity') {
    const rawEntityType = await fileSystem.readJson(
      resourceRegistry.entity.folder,
      resourceFileKey('entity', document.entityTypeId),
    );
    if (!rawEntityType) return;

    useEditorStore.setState((state) => ({
      entityTypes: state.entityTypes.map((entityType) =>
        entityType.id === document.entityTypeId ? (rawEntityType as typeof entityType) : entityType,
      ),
    }));

    clearSaveUnit(document.saveUnitId);
    return;
  }

  if (document.kind === 'location') {
    const rawMap = await fileSystem.readJson(
      resourceRegistry.location.folder,
      resourceFileKey('location', document.mapId),
    );
    if (!rawMap) return;

    const editor = useEditorStore.getState();
    const nextMap = ensureNavigationLayer(
      addMissingDefinitionLayers(
        deserializeMap(migrateMapToEncodedData(rawMap as GameMap)),
        editor.layerDefinitions,
      ),
    );

    useEditorStore.setState((state) => ({
      maps: state.maps.map((map) => (map.id === nextMap.id ? nextMap : map)),
      currentMap: state.currentMap?.id === nextMap.id ? nextMap : state.currentMap,
    }));

    if (editor.currentMap?.id === nextMap.id) {
      editor.setCurrentMap(nextMap);
    }

    clearSaveUnit(document.saveUnitId);
    return;
  }

  if (document.kind === 'tileset') {
    const rawTileset = await fileSystem.readJson(
      resourceRegistry.tileset.folder,
      resourceFileKey('tileset', document.tilesetId),
    );
    if (!rawTileset) return;

    const nextTileset = normalizeTileset(rawTileset as Tileset);
    useEditorStore.setState((state) => {
      const nextTilesets = new Map(state.tilesets);
      nextTilesets.set(nextTileset.id, nextTileset);
      return {
        tilesets: nextTilesets,
      };
    });

    clearSaveUnit(document.saveUnitId);
  }
}
