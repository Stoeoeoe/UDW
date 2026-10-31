import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceInit } from './useWorkspaceInit';
import { useEditorStore } from '../store/useEditorStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  persistWorkspaceNavigation,
  restoreWorkspaceNavigation,
} from '../lib/workspacePersistence';

describe('project navigation preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    useWorkspaceStore.getState().resetWorkspace();
    useEditorStore.setState({
      project: {
        id: 'demo',
        name: 'Demo',
        version: '1.0',
        tileSize: 16,
        defaultMapWidth: 20,
        defaultMapHeight: 15,
      },
      projectPath: '/projects/demo',
      resourcesLoaded: true,
      maps: [],
      tilesets: new Map(),
      characters: [],
      entityTypes: [],
      items: [],
      dialogues: new Map(),
      cutscenes: [],
      cutsceneLabels: {},
      cutsceneFolders: {},
    });
  });

  afterEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
    useEditorStore.setState({ project: null, projectPath: null, resourcesLoaded: false });
    window.history.replaceState(null, '', '/');
  });

  it('restores before saving, persists changes, and isolates project switches', () => {
    const first = {
      favoriteResourceKeys: ['character:base:player'],
      recentResourceKeys: ['cutscene:base:intro'],
    };
    const second = { favoriteResourceKeys: ['item:second'], recentResourceKeys: [] };
    persistWorkspaceNavigation('/projects/demo', first);
    persistWorkspaceNavigation('/projects/second', second);
    const hook = renderHook(() => useWorkspaceInit());
    expect(useWorkspaceStore.getState().favoriteResourceKeys).toEqual(first.favoriteResourceKeys);
    expect(restoreWorkspaceNavigation('/projects/demo')).toEqual(first);

    act(() => useWorkspaceStore.getState().toggleFavoriteResource('item:base:torch'));
    expect(restoreWorkspaceNavigation('/projects/demo').favoriteResourceKeys).toEqual([
      'character:base:player',
      'item:base:torch',
    ]);
    act(() => useEditorStore.setState({ resourcesLoaded: false }));
    act(() => useEditorStore.setState({ projectPath: '/projects/second', resourcesLoaded: true }));
    expect(useWorkspaceStore.getState().favoriteResourceKeys).toEqual(second.favoriteResourceKeys);
    expect(useWorkspaceStore.getState().recentResourceKeys).toEqual([]);
    expect(restoreWorkspaceNavigation('/projects/second')).toEqual(second);
    expect(restoreWorkspaceNavigation('/projects/demo').favoriteResourceKeys).toEqual([
      'character:base:player',
      'item:base:torch',
    ]);
    hook.unmount();
  });
});
