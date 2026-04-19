import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceTab } from '../types/workspace';
import { persistWorkspaceSession, restoreWorkspaceSession } from './workspacePersistence';

const projectPath = '/projects/test-project';

const mapWithoutVariations = {
  version: 1,
  id: 'map-1',
  name: 'Map 1',
  width: 10,
  height: 10,
  baseTilesetId: 'tileset-1',
  tilesetRefs: ['tileset-1'],
  layers: [],
  entities: [],
};

const mapWithVariation = {
  ...mapWithoutVariations,
  id: 'map-2',
  name: 'Map 2',
  variations: [
    {
      id: 'variation-1',
      displayName: 'Variation 1',
      kind: 'generic' as const,
      layerOverrides: {},
      entityOverrides: [],
    },
  ],
};

const tileset = {
  version: 1,
  id: 'tileset-1',
  name: 'Tileset 1',
  tileWidth: 16,
  tileHeight: 16,
  tileCount: 1,
  columns: 1,
  image: 'tileset.png',
  spriteSheet: 'tileset.png',
  tileProperties: {},
};

describe('workspacePersistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('restores persisted tabs and active tab for a project', () => {
    const tabs: WorkspaceTab[] = [
      {
        id: 'location:map-1',
        document: {
          kind: 'location',
          mapId: 'map-1',
          variationId: null,
          label: 'Map 1',
          saveUnitId: 'location:map-1',
        },
      },
      {
        id: 'tileset:tileset-1',
        document: {
          kind: 'tileset',
          tilesetId: 'tileset-1',
          label: 'Tileset 1',
          saveUnitId: 'tileset:tileset-1',
        },
      },
      {
        id: 'location:preview-map',
        isPreview: true,
        document: {
          kind: 'location',
          mapId: 'preview-map',
          variationId: null,
          label: 'Preview Map',
          saveUnitId: 'location:preview-map',
        },
      },
    ];

    persistWorkspaceSession(projectPath, {
      tabs,
      activeTabId: tabs[1].id,
      expandedNodeIds: ['group:locations', 'group:tilesets'],
    });

    const restored = restoreWorkspaceSession(projectPath, {
      maps: [mapWithoutVariations],
      tilesets: new Map([[tileset.id, tileset]]),
    });

    expect(restored).not.toBeNull();
    expect(restored?.tabs.map((tab) => tab.id)).toEqual(['location:map-1', 'tileset:tileset-1']);
    expect(restored?.activeTabId).toBe('tileset:tileset-1');
    expect(restored?.expandedNodeIds).toEqual(['group:locations', 'group:tilesets']);
    expect(restored?.tabs.every((tab) => !tab.isPreview)).toBe(true);
  });

  it('drops documents that no longer exist and falls back to the first valid restored tab', () => {
    const tabs: WorkspaceTab[] = [
      {
        id: 'location:map-2',
        document: {
          kind: 'location',
          mapId: 'map-2',
          variationId: 'variation-1',
          label: 'Map 2',
          saveUnitId: 'location:map-2',
        },
      },
      {
        id: 'location:missing-map',
        document: {
          kind: 'location',
          mapId: 'missing-map',
          variationId: null,
          label: 'Missing',
          saveUnitId: 'location:missing-map',
        },
      },
    ];

    persistWorkspaceSession(projectPath, {
      tabs,
      activeTabId: 'location:missing-map',
      expandedNodeIds: [],
    });

    const restored = restoreWorkspaceSession(projectPath, {
      maps: [mapWithVariation],
      tilesets: new Map(),
    });

    expect(restored?.tabs.map((tab) => tab.id)).toEqual(['location:map-2']);
    expect(restored?.activeTabId).toBe('location:map-2');
  });
});
