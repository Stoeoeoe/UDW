import { beforeEach, describe, expect, it } from 'vitest';
import { useSaveStore } from '../lib/saveManager';
import { WorkspaceDocument } from '../types/workspace';
import { getWorkspaceTabId, useWorkspaceStore } from './useWorkspaceStore';

function locationDocument(mapId: string, variationId: string | null = null): WorkspaceDocument {
  return {
    kind: 'location',
    mapId,
    variationId,
    label: mapId,
    saveUnitId: `location:${mapId}`,
  };
}

function tilesetDocument(tilesetId: string): WorkspaceDocument {
  return {
    kind: 'tileset',
    tilesetId,
    label: tilesetId,
    saveUnitId: `tileset:${tilesetId}`,
  };
}

type PreviewableScreenKind = 'settings' | 'configuration' | 'entities';

function screenDocument(kind: PreviewableScreenKind): WorkspaceDocument {
  switch (kind) {
    case 'settings':
      return {
        kind: 'settings',
        label: 'Settings',
        saveUnitId: 'settings',
      };
    case 'configuration':
      return {
        kind: 'configuration',
        label: 'Configuration',
        saveUnitId: 'configuration',
        configTab: 'terrain',
      };
    case 'entities':
      return {
        kind: 'entities',
        label: 'Entities',
        saveUnitId: 'configuration',
      };
  }
}

function actorDocument(actorId: string): WorkspaceDocument {
  return {
    kind: 'actor',
    actorId,
    label: actorId,
    saveUnitId: `actor:${actorId}`,
  };
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useSaveStore.getState().reset();
  });

  it('reuses a single preview tab when browsing locations', () => {
    const firstTab = useWorkspaceStore
      .getState()
      .openDocument(locationDocument('map-1'), { preview: true });

    expect(firstTab.isPreview).toBe(true);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);

    const secondTab = useWorkspaceStore
      .getState()
      .openDocument(locationDocument('map-2'), { preview: true });

    expect(secondTab.isPreview).toBe(true);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0].id).toBe('location:map-2');
  });

  it('reuses the preview slot across document types', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { preview: true });
    const secondTab = useWorkspaceStore
      .getState()
      .openDocument(tilesetDocument('tileset-1'), { preview: true });

    expect(secondTab.isPreview).toBe(true);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0].id).toBe('tileset:tileset-1');
  });

  it('reuses the preview slot across editor modes', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { preview: true });
    const secondTab = useWorkspaceStore
      .getState()
      .openDocument(screenDocument('entities'), { preview: true });

    expect(secondTab.isPreview).toBe(true);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0].id).toBe('entities');
  });

  it('clears the old preview when opening an already pinned document in preview mode', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { preview: true });
    useWorkspaceStore.getState().openDocument(tilesetDocument('tileset-1'), { pin: true });

    useWorkspaceStore.getState().openDocument(tilesetDocument('tileset-1'), { preview: true });

    expect(useWorkspaceStore.getState().tabs).toEqual([
      expect.objectContaining({ id: 'tileset:tileset-1', isPreview: false }),
    ]);
  });

  it('pins an existing preview instead of opening a duplicate', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { preview: true });
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { pin: true });

    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
      id: 'location:map-1',
      isPreview: false,
    });
  });

  it('auto-pins a dirty preview before opening a new preview item', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { preview: true });
    useSaveStore.getState().markDirty('location:map-1');

    useWorkspaceStore.getState().openDocument(locationDocument('map-2'), { preview: true });

    expect(useWorkspaceStore.getState().tabs).toHaveLength(2);
    expect(useWorkspaceStore.getState().tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'location:map-1', isPreview: false }),
        expect.objectContaining({ id: 'location:map-2', isPreview: true }),
      ]),
    );
  });

  it('reuses the same location tab even when the initial variation changes', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1', 'winter'), { pin: true });
    useWorkspaceStore.getState().openDocument(locationDocument('map-1', 'summer'), { pin: true });

    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
      id: 'location:map-1',
      document: expect.objectContaining({
        kind: 'location',
        mapId: 'map-1',
        variationId: 'summer',
      }),
    });
  });

  it('allows screen documents to open as previews', () => {
    useWorkspaceStore.getState().openDocument(screenDocument('settings'), { preview: true });

    expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
      id: 'settings',
      isPreview: true,
    });
  });

  it('reorders tabs when a dragged tab is dropped on another tab', () => {
    useWorkspaceStore.getState().openDocument(locationDocument('map-1'), { pin: true });
    useWorkspaceStore.getState().openDocument(locationDocument('map-2'), { pin: true });
    useWorkspaceStore.getState().openDocument(locationDocument('map-3'), { pin: true });

    useWorkspaceStore.getState().reorderTabs('location:map-3', 'location:map-1');

    expect(useWorkspaceStore.getState().tabs.map((tab) => tab.id)).toEqual([
      'location:map-3',
      'location:map-1',
      'location:map-2',
    ]);
  });

  it('uses first-class tab ids for resource documents', () => {
    expect(getWorkspaceTabId(actorDocument('marcus'))).toBe('actor:marcus');

    const tab = useWorkspaceStore
      .getState()
      .openDocument(actorDocument('marcus'), { preview: true });
    expect(tab.id).toBe('actor:marcus');
    expect(tab.isPreview).toBe(true);
  });

  it('tracks recent resources in last-accessed order without duplicates', () => {
    useWorkspaceStore.getState().markRecentResource('location:map-1');
    useWorkspaceStore.getState().markRecentResource('tileset:tileset-1');
    useWorkspaceStore.getState().markRecentResource('actor:marcus');
    useWorkspaceStore.getState().markRecentResource('location:map-1');

    expect(useWorkspaceStore.getState().recentResourceKeys).toEqual([
      'location:map-1',
      'actor:marcus',
      'tileset:tileset-1',
    ]);
  });
});
