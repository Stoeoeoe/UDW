import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTabSession, captureTabSession } from './workspaceController';
import { useEditorStore } from '../store/useEditorStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { WorkspaceTab } from '../types/workspace';

vi.mock('../lib/recentProjects', () => ({
  recentProjects: {
    add: vi.fn(),
    get: vi.fn(() => []),
    remove: vi.fn(),
  },
}));

vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(),
    loadAllTilesets: vi.fn(async () => []),
    loadAllMaps: vi.fn(async () => []),
  },
}));

function createMap(id: string, name: string) {
  return {
    version: 1 as const,
    id,
    name,
    width: 10,
    height: 10,
    baseTilesetId: 'village',
    tilesetRefs: ['village'],
    layers: [
      {
        id: 'ground',
        name: 'Ground',
        kind: 'visual' as const,
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: 0,
        data: Array(10)
          .fill(null)
          .map(() => Array(10).fill(null)),
      },
    ],
    entities: [],
  };
}

function createLocationTab(
  mapId: string,
  label: string,
  variationId: string | null = null,
): WorkspaceTab {
  return {
    id: `location:${mapId}`,
    document: {
      kind: 'location',
      mapId,
      variationId,
      label,
      saveUnitId: `location:${mapId}`,
    },
  };
}

describe('workspaceController', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useEditorStore.getState().closeProject();
  });

  it('applies location tabs when they become active', () => {
    const mapA = createMap('map-a', 'Map A');
    const mapB = createMap('map-b', 'Map B');

    useEditorStore.setState((state) => {
      state.maps = [mapA, mapB];
      state.currentMap = mapB;
      state.mode = 'settings';
      state.activeVariationId = 'spring';
      state.selectedEntityId = 'entity-1';
      state.selectedLinkId = 'link-1';
      state.selectedAnchorId = 'anchor-1';
      state.selectedTriggerId = 'trigger-1';
    });

    applyTabSession(createLocationTab('map-a', 'Map A'));

    const state = useEditorStore.getState();
    expect(state.currentMap?.id).toBe('map-a');
    expect(state.mode).toBe('maps');
    expect(state.activeVariationId).toBeNull();
    expect(state.selectedEntityId).toBeNull();
    expect(state.selectedLinkId).toBeNull();
    expect(state.selectedAnchorId).toBeNull();
    expect(state.selectedTriggerId).toBeNull();
  });

  it('captures the active variation when leaving a location tab', () => {
    const mapA = createMap('map-a', 'Map A');

    useEditorStore.setState((state) => {
      state.maps = [mapA];
      state.currentMap = mapA;
      state.mode = 'maps';
      state.activeVariationId = 'spring';
    });

    captureTabSession(createLocationTab('map-a', 'Map A'));

    expect(useWorkspaceStore.getState().locationSessions['location:map-a']).toMatchObject({
      activeVariationId: 'spring',
    });
  });

  it('uses the document variation as the initial session context for a location tab', () => {
    const mapA = {
      ...createMap('map-a', 'Map A'),
      variations: [
        {
          id: 'winter',
          displayName: 'Winter',
          kind: 'generic' as const,
          layerOverrides: {},
          entityOverrides: [],
        },
      ],
    };

    useEditorStore.setState((state) => {
      state.maps = [mapA];
    });

    applyTabSession(createLocationTab('map-a', 'Map A', 'winter'));

    expect(useEditorStore.getState()).toMatchObject({
      currentMap: expect.objectContaining({ id: 'map-a' }),
      mode: 'maps',
      activeVariationId: 'winter',
    });
  });
});
