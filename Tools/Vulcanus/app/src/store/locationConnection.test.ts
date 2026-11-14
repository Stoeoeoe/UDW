import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { redoEditorChange, undoEditorChange, useEditorStore } from './useEditorStore';
import type { Project } from '../types/schema';
import { connectionDraft, connectionMaps } from '../lib/__fixtures__/locationConnection';

vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(),
    resolveFilename: (_folder: string, filename: string) => filename,
  },
}));
enableMapSet();

describe('connection creation in the editor', () => {
  beforeEach(() => {
    const maps = connectionMaps();
    useEditorStore.setState({
      maps,
      currentMap: maps[0],
      project: { idPrefix: 'base', tileSize: 16 } as Project,
      connectionWizard: null,
    });
    useEditorStore.temporal.getState().clear();
  });

  it('commits both maps in one undoable edit and redoes the full connection', () => {
    useEditorStore.getState().createLocationConnection(connectionDraft());
    expect(useEditorStore.getState().maps.every((map) => map.locationLinks?.length === 1)).toBe(
      true,
    );
    expect(useEditorStore.getState().connectionWizard).toBeNull();
    undoEditorChange();
    expect(
      useEditorStore.getState().maps.every((map) => !map.locationLinks && !map.spatialPrimitives),
    ).toBe(true);
    redoEditorChange();
    expect(useEditorStore.getState().maps.every((map) => map.locationLinks?.length === 1)).toBe(
      true,
    );
    expect(useEditorStore.getState().maps[1].spatialPrimitives!.anchors![0].facing).toEqual([
      -1, 0,
    ]);
  });

  it('opening and cancelling the wizard never changes maps or history', () => {
    const before = useEditorStore.getState().maps;
    useEditorStore.getState().openConnectionWizard();
    useEditorStore.getState().closeConnectionWizard();
    expect(useEditorStore.getState().maps).toBe(before);
    expect(useEditorStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
