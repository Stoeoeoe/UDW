import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableMapSet } from 'immer';

// Ensure Immer Map/Set plugin is enabled for tests that manipulate Maps in state
enableMapSet();

import { useEditorStore } from './useEditorStore';
import type { TileDefinition, Tileset } from '../types/schema';

// Mock fileSystem and saveManager used by the store
vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(async () => undefined),
    loadAllTilesets: vi.fn(async () => []),
    loadAllMaps: vi.fn(async () => []),
  },
}));

vi.mock('../lib/saveManager', () => ({
  useSaveStore: {
    getState: () => ({ setStatus: vi.fn(), status: 'idle' }),
  },
}));

describe('tileset save scheduling', () => {
  beforeEach(() => {
    // Reset store and timers
    const { closeProject } = useEditorStore.getState();
    closeProject();
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
      tileWidth: 16,
      tileHeight: 16,
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

    // Advance timers past debounce threshold (300ms)
    await vi.advanceTimersByTimeAsync(350);

    // Allow any pending microtasks to complete
    await Promise.resolve();

    expect(fs.fileSystem.saveJson).toHaveBeenCalled();
    const calls = vi.mocked(fs.fileSystem.saveJson).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('tilesets');
    expect(last[1]).toBe('ts1.tileset.json');
    // payload snapshot should contain the tiles array with updated collision
    expect(last[2]).toBeTruthy();
    expect(last[2].tiles[0].collision.type).toBe('full');
  });
});
