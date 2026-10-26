import { useEditorStore } from '../store/useEditorStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  LocationTabSession,
  TilesetTabSession,
  WorkspaceDocument,
  WorkspaceTab,
} from '../types/workspace';
import { DEFAULT_TOOL_BY_KIND } from '../store/storeHelpers';

export function createDefaultLocationSession(
  document: Extract<WorkspaceDocument, { kind: 'location' }>,
): LocationTabSession {
  const store = useEditorStore.getState();
  const map = store.maps.find((entry) => entry.id === document.mapId) ?? null;
  const firstLayer =
    map?.layers.find((layer) => layer.kind !== 'navigation') ?? map?.layers[0] ?? null;
  return {
    activeVariationId: document.variationId === 'base' ? null : document.variationId,
    selectedLayerId: firstLayer?.id ?? null,
    activeTilesetId: map?.baseTilesetId ?? store.activeTilesetId,
    selectedTileIndex: null,
    selectedTileIndices: [],
    selectedTerrainId: null,
    activeTool: firstLayer ? (DEFAULT_TOOL_BY_KIND[firstLayer.kind] ?? 'stamp') : 'stamp',
    drawMode: 'point',
    brushSize: 1,
    camera: store.mapCameras?.[document.mapId] ?? { x: 0, y: 0, zoom: 1.5 },
    selectedEntityId: null,
    selectedEntityTypeId: store.selectedEntityTypeId,
    selectedLinkId: null,
    selectedAnchorId: null,
    selectedTriggerId: null,
    selectedCollisionId: null,
    timePreviewEnabled: false,
    timeOfDay: 0.5,
  };
}

export function createDefaultTilesetSession(
  document: Extract<WorkspaceDocument, { kind: 'tileset' }>,
): TilesetTabSession {
  return {
    activeTilesetId: document.tilesetId,
    selectedTileIndex: null,
    selectedTileIndices: [],
    selectedObjectDefinitionId: null,
    selectedTerrainId: null,
    tilesetToolMode: 'select',
    showTilesetCollisionOverlay: false,
    showTilesetSortPivotOverlay: false,
  };
}

export function ensureDocumentSession(document: WorkspaceDocument, tabId: string): void {
  const workspace = useWorkspaceStore.getState();
  if (document.kind === 'location' && !workspace.locationSessions[tabId]) {
    workspace.setLocationSession(tabId, createDefaultLocationSession(document));
  }
  if (document.kind === 'tileset' && !workspace.tilesetSessions[tabId]) {
    workspace.setTilesetSession(tabId, createDefaultTilesetSession(document));
  }
}

export function captureTabSession(tab: WorkspaceTab | null): void {
  if (!tab) return;

  const editor = useEditorStore.getState();
  const workspace = useWorkspaceStore.getState();

  if (tab.document.kind === 'location') {
    workspace.setLocationSession(tab.id, {
      activeVariationId: editor.activeVariationId,
      selectedLayerId: editor.selectedLayerId,
      activeTilesetId: editor.activeTilesetId,
      selectedTileIndex: editor.selectedTileIndex,
      selectedTileIndices: [...editor.selectedTileIndices],
      selectedTerrainId: editor.selectedTerrainId,
      activeTool: editor.activeTool,
      drawMode: editor.drawMode,
      brushSize: editor.brushSize,
      camera: { ...editor.camera },
      selectedEntityId: editor.selectedEntityId,
      selectedEntityTypeId: editor.selectedEntityTypeId,
      selectedLinkId: editor.selectedLinkId,
      selectedAnchorId: editor.selectedAnchorId,
      selectedTriggerId: editor.selectedTriggerId,
      selectedCollisionId: editor.selectedCollisionId,
      timePreviewEnabled: editor.timePreviewEnabled,
      timeOfDay: editor.timeOfDay,
    });
    return;
  }

  if (tab.document.kind === 'tileset') {
    workspace.setTilesetSession(tab.id, {
      activeTilesetId: editor.activeTilesetId,
      selectedTileIndex: editor.selectedTileIndex,
      selectedTileIndices: [...editor.selectedTileIndices],
      selectedObjectDefinitionId: editor.selectedObjectDefinitionId ?? null,
      selectedTerrainId: editor.selectedTerrainId,
      tilesetToolMode: editor.tilesetToolMode ?? 'select',
      showTilesetCollisionOverlay: editor.showTilesetCollisionOverlay,
      showTilesetSortPivotOverlay: editor.showTilesetSortPivotOverlay,
    });
  }
}

export function applyTabSession(tab: WorkspaceTab | null): void {
  if (!tab) return;

  const editor = useEditorStore.getState();
  const workspace = useWorkspaceStore.getState();
  ensureDocumentSession(tab.document, tab.id);

  if (tab.document.kind === 'location') {
    const session =
      workspace.locationSessions[tab.id] ?? createDefaultLocationSession(tab.document);
    if (editor.currentMap?.id !== tab.document.mapId) {
      editor.loadMap(tab.document.mapId);
    }
    const nextEditor = useEditorStore.getState();
    nextEditor.setMode('maps');
    nextEditor.setActiveVariation(session.activeVariationId);
    if (session.selectedLayerId) nextEditor.selectLayer(session.selectedLayerId);
    nextEditor.setActiveTileset(session.activeTilesetId);
    nextEditor.setSelectedTerrain(session.selectedTerrainId);
    nextEditor.setSelectedTile(session.selectedTileIndex);
    nextEditor.setSelectedTiles(session.selectedTileIndices);
    nextEditor.setActiveTool(session.activeTool);
    nextEditor.setDrawMode(session.drawMode);
    nextEditor.setBrushSize(session.brushSize);
    nextEditor.setCamera(session.camera);
    nextEditor.selectEntity(session.selectedEntityId);
    nextEditor.selectLink(session.selectedLinkId);
    nextEditor.selectAnchor(session.selectedAnchorId);
    nextEditor.selectTrigger(session.selectedTriggerId);
    nextEditor.selectCollision(session.selectedCollisionId);
    nextEditor.setTimePreviewEnabled(session.timePreviewEnabled);
    nextEditor.setTimeOfDay(session.timeOfDay);
    useEditorStore.setState((state) => {
      state.selectedEntityTypeId = session.selectedEntityTypeId;
    });
    return;
  }

  if (tab.document.kind === 'tileset') {
    const session = workspace.tilesetSessions[tab.id] ?? createDefaultTilesetSession(tab.document);
    editor.setMode('tilesets');
    editor.setActiveTileset(session.activeTilesetId);
    editor.setSelectedTerrain(session.selectedTerrainId);
    editor.setSelectedTile(session.selectedTileIndex);
    editor.setSelectedTiles(session.selectedTileIndices);
    editor.setSelectedObjectDefinition(session.selectedObjectDefinitionId);
    editor.setTilesetToolMode(session.tilesetToolMode);
    editor.setShowTilesetCollisionOverlay(session.showTilesetCollisionOverlay);
    editor.setShowTilesetSortPivotOverlay(session.showTilesetSortPivotOverlay);
    return;
  }

  if (tab.document.kind === 'settings') {
    editor.setMode('settings');
    return;
  }

  if (tab.document.kind === 'configuration') {
    editor.setMode('config');
    return;
  }

  if (tab.document.kind === 'entities') {
    editor.setMode('entities');
    return;
  }

  if (tab.document.kind === 'characters') {
    editor.setMode('characters');
    return;
  }

  if (tab.document.kind === 'items') {
    editor.setMode('items');
    return;
  }

  if (tab.document.kind === 'cutscene') {
    editor.setMode('cutscenes');
    useEditorStore.setState({ selectedCutsceneId: tab.document.cutsceneId });
    return;
  }
  if (tab.document.kind === 'cutscenes') {
    editor.setMode('cutscenes');
    return;
  }

  if (tab.document.kind === 'dialogues') {
    editor.setMode('dialogues');
    return;
  }

  if (tab.document.kind === 'scripting') {
    editor.setMode('scripting');
  }
}
