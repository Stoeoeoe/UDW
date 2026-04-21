import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableMapSet } from 'immer';

// Ensure Immer Map/Set plugin is enabled for tests that manipulate Maps in state
enableMapSet();

import { useEditorStore } from './useEditorStore';
import { useAppSettingsStore } from './useAppSettingsStore';
import type { TileDefinition, Tileset } from '../types/schema';

// Mock fileSystem and saveManager used by the store
vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(async () => undefined),
    loadAllTilesets: vi.fn(async () => []),
    loadAllMaps: vi.fn(async () => []),
    loadAsset: vi.fn(async () => new Blob()),
  },
}));

vi.mock('../lib/saveManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/saveManager')>();
  return {
    ...actual,
    useSaveStore: {
      getState: () => ({ setStatus: vi.fn(), status: 'idle' }),
    },
  };
});

describe('tileset save scheduling', () => {
  beforeEach(() => {
    // Reset store and timers
    const { closeProject } = useEditorStore.getState();
    closeProject();
    useAppSettingsStore.setState((state) => ({
      ...state,
      savedSettings: {
        ...state.savedSettings,
        autosaveEnabled: true,
      },
      draftSettings: {
        ...state.draftSettings,
        autosaveEnabled: true,
      },
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('schedules a debounced tileset save when tile definition is updated', async () => {
    const fs = await import('../lib/fileSystem');

    // Add a tileset into the store
    const ts: Tileset = {
      version: 1,
      name: 'TS1',
      id: 'ts1',
      spriteSheet: 's.png',
      columns: 4,
      tileCount: 1,
      tiles: { 0: { collision: { type: 'none' } } },
      wangSets: [],
    };
    // Add the tileset via store action (this will trigger initial save)
    await useEditorStore.getState().addTileset(ts);

    // Update a tile definition which should schedule another save
    useEditorStore.getState().updateTileDefinition('ts1', 0, {
      collision: { type: 'full' },
    } as Partial<TileDefinition>);

    // Advance timers past debounce threshold
    await vi.advanceTimersByTimeAsync(1100);

    // Allow any pending microtasks to complete
    await Promise.resolve();

    expect(fs.fileSystem.saveJson).toHaveBeenCalled();
    const calls = vi.mocked(fs.fileSystem.saveJson).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('tilesets');
    expect(last[1]).toBe('ts1.vts');
    // payload snapshot should contain the tiles array with updated collision
    expect(last[2]).toBeTruthy();
    expect(last[2].tiles[0].collision.type).toBe('full');
  });

  it('saves pivotY as a non-negative integer', async () => {
    const fs = await import('../lib/fileSystem');

    const ts: Tileset = {
      version: 1,
      name: 'TS1',
      id: 'ts1',
      spriteSheet: 's.png',
      columns: 4,
      tileCount: 1,
      tiles: { 0: {} },
      wangSets: [],
    };

    await useEditorStore.getState().addTileset(ts);

    useEditorStore.getState().updateTileDefinition('ts1', 0, {
      pivotY: 2.6,
    } as Partial<TileDefinition>);

    await vi.advanceTimersByTimeAsync(1100);
    await Promise.resolve();

    const calls = vi.mocked(fs.fileSystem.saveJson).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[2].tiles[0].pivotY).toBe(3);
  });
});
