import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceExplorer } from './WorkspaceExplorer';
import { buildWorkspaceTree } from '../../lib/workspaceTree';
import { createEditorResourceDocument } from '../../lib/editorResourceTypes';
import { useSaveStore } from '../../lib/saveManager';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { theme } from '../../theme';
import { WorkspaceTreeNode } from '../../types/workspace';

function resource(
  kind: 'character' | 'item' | 'cutscene',
  id: string,
  name: string,
): WorkspaceTreeNode {
  return {
    id: `${kind}:${id}`,
    kind: 'leaf',
    label: name,
    resourceKind: kind,
    document: createEditorResourceDocument({ type: kind, id, name }),
  };
}

describe('scoped workspace navigation', () => {
  const open = vi.fn();
  const toggle = vi.fn();
  let nodes: WorkspaceTreeNode[];

  beforeEach(() => {
    open.mockReset();
    toggle.mockReset();
    useSaveStore.getState().reset();
    useWorkspaceStore.getState().resetWorkspace();
    nodes = buildWorkspaceTree({
      maps: [],
      tilesets: new Map(),
      characters: [],
      entityTypes: [],
      items: [],
      dialogues: [],
    });
    nodes.find((node) => node.id === 'group:characters')!.children = [
      resource('character', 'base:player', 'Player'),
    ];
    nodes.find((node) => node.id === 'group:items')!.children = [
      resource('item', 'base:torch', 'Torch'),
    ];
    nodes.find((node) => node.id === 'group:cutscenes')!.children = [
      resource('cutscene', 'base:intro', 'Introduction'),
      {
        id: 'folder:cutscene:Chapter One',
        kind: 'folder',
        label: 'Chapter One',
        resourceKind: 'cutscene',
        children: [resource('cutscene', 'base:harbour', 'Arrival at the Harbour')],
      },
    ];
  });

  function explorer(
    activeTabId: string | null = null,
    expandedNodeIds = nodes.map((node) => node.id),
  ) {
    return (
      <ChakraProvider theme={theme}>
        <WorkspaceExplorer
          nodes={nodes}
          activeTabId={activeTabId}
          expandedNodeIds={expandedNodeIds}
          onToggleNode={toggle}
          onOpenNode={open}
        />
      </ChakraProvider>
    );
  }

  it('offers every resource editor and project tool without expanding all content', async () => {
    render(explorer());
    expect(screen.getByRole('textbox', { name: 'Search Locations' })).toBeInTheDocument();
    expect(screen.queryByText('Player')).not.toBeInTheDocument();
    expect(screen.queryByText('Introduction')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    const picker = within(await screen.findByRole('dialog', { name: 'Editor picker' }));
    for (const name of [
      'Locations',
      'Tilesets',
      'Characters',
      'Entities',
      'Items',
      'Dialogues',
      'Cutscenes',
      'Data',
      'Scripting',
      'Settings',
      'Configuration',
    ]) {
      expect(picker.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(picker.getByRole('button', { name: 'Characters' }));
    expect(screen.getByRole('textbox', { name: 'Search Characters' })).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.queryByText('Torch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Player' })).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Player'));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ kind: 'character', characterId: 'base:player' }),
      }),
      { pin: false },
    );
  });

  it('finds nested content by name, ID and folder path without changing saved expansion', () => {
    render(explorer('cutscene:base:intro'));
    expect(screen.queryByText('Arrival at the Harbour')).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Search Cutscenes' });
    for (const query of ['HARBOUR', 'base:harbour', 'Chapter One/Arrival']) {
      fireEvent.change(input, { target: { value: query } });
      expect(screen.getByText('Chapter One')).toBeInTheDocument();
      expect(screen.getByText('Arrival at the Harbour')).toBeInTheDocument();
      expect(screen.queryByText('Introduction')).not.toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: 'not found' } });
    expect(screen.getByRole('status')).toHaveTextContent('No matching content');
    expect(screen.getByRole('button', { name: 'Create Cutscenes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear content search' }));
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.queryByText('Arrival at the Harbour')).not.toBeInTheDocument();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('follows tab activation, clears stale filters and reveals the active folder', () => {
    const view = render(explorer('character:base:player'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Characters' }), {
      target: { value: 'unrelated' },
    });
    view.rerender(explorer('cutscene:base:harbour'));
    expect(screen.getByRole('textbox', { name: 'Search Cutscenes' })).toHaveValue('');
    expect(toggle).toHaveBeenCalledWith('folder:cutscene:Chapter One');
    // An explicit subsequent collapse must stay collapsed, rather than being undone by the effect.
    toggle.mockClear();
    view.rerender(explorer('cutscene:base:harbour'));
    expect(toggle).not.toHaveBeenCalled();
  });

  it('lets users search the picker and select editors with the keyboard', async () => {
    render(explorer());
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    const input = await screen.findByRole('textbox', { name: 'Find an editor' });
    fireEvent.change(input, { target: { value: 'cut' } });
    const picker = within(await screen.findByRole('dialog', { name: 'Editor picker' }));
    expect(picker.queryByRole('button', { name: 'Characters' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(picker.getByRole('button', { name: 'Cutscenes' })).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Search Cutscenes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    await screen.findByRole('dialog', { name: 'Editor picker' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Find an editor' }), {
      target: { value: 'no such editor' },
    });
    expect(picker.getByRole('status')).toHaveTextContent('No matching editors');
  });

  it('keeps project tools in the picker while reserving the footer for recent content', async () => {
    render(explorer('cutscene:base:intro'));
    expect(screen.queryByText('Data')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Editor picker' })).getByRole('button', {
        name: 'Data',
      }),
    );
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({
        document: { kind: 'data', label: 'Data', saveUnitId: 'configuration' },
      }),
      { pin: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Editor picker' })).getByRole('button', {
        name: 'Settings',
      }),
    );
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({
        document: { kind: 'settings', label: 'Settings', saveUnitId: 'settings' },
      }),
      { pin: true },
    );
    expect(screen.getByText('Introduction')).toBeInTheDocument();
  });

  it('preserves dirty indicators, preview pinning and resource context menus', () => {
    useSaveStore.getState().markDirty('cutscene:base:intro');
    render(explorer('cutscene:base:intro'));
    expect(screen.getByRole('img', { name: 'Unsaved changes: Introduction' })).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByText('Introduction'));
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ kind: 'cutscene' }) }),
      { pin: true },
    );
    fireEvent.contextMenu(screen.getByText('Introduction'));
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Introduction' })).toBeInTheDocument();
  });

  it('stars content without opening it and shows live favorites across editors', async () => {
    render(explorer('cutscene:base:intro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Introduction to favorites' }));
    expect(open).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().favoriteResourceKeys).toEqual(['cutscene:base:intro']);
    fireEvent.click(screen.getByRole('button', { name: 'Choose editor' }));
    const editorSearch = await screen.findByRole('textbox', { name: 'Find an editor' });
    fireEvent.change(editorSearch, { target: { value: 'characters' } });
    fireEvent.keyDown(editorSearch, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Player to favorites' }));
    const favorites = within(screen.getByRole('region', { name: 'Favorites' }));
    expect(favorites.getByText('Introduction')).toBeVisible();
    expect(favorites.getByText('Player')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Browse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search Favorites' })).not.toBeInTheDocument();
    fireEvent.click(favorites.getByRole('button', { name: 'Favorites' }));
    expect(favorites.getByRole('button', { name: 'Favorites' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(favorites.getByText('Introduction')).not.toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Search Characters' })).toBeVisible();
    fireEvent.click(favorites.getByRole('button', { name: 'Favorites' }));
    fireEvent.click(favorites.getByText('Introduction'));
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ kind: 'cutscene', cutsceneId: 'base:intro' }),
      }),
      { pin: false },
    );
    fireEvent.click(favorites.getByRole('button', { name: 'Remove Introduction from favorites' }));
    expect(favorites.queryByText('Introduction')).not.toBeInTheDocument();
    expect(favorites.getByText('Player')).toBeVisible();
  });

  it('keeps recent resources visible below browsing and favorites, in access order', () => {
    useWorkspaceStore.getState().markRecentResource('cutscene:base:intro');
    useWorkspaceStore.getState().markRecentResource('item:base:torch');
    useWorkspaceStore.getState().markRecentResource('cutscene:base:deleted');
    render(explorer('character:base:player'));
    const content = screen.getByRole('region', { name: 'Recently opened' });
    expect(
      within(content)
        .getAllByText(/^(Torch|Introduction)$/)
        .map((el) => el.textContent),
    ).toEqual(['Torch', 'Introduction']);
    const history = [...useWorkspaceStore.getState().recentResourceKeys];
    fireEvent.click(within(content).getByRole('button', { name: 'Add Torch to favorites' }));
    expect(within(content).queryByText('Torch')).not.toBeInTheDocument();
    const favorites = within(screen.getByRole('region', { name: 'Favorites' }));
    expect(favorites.getByText('Torch')).toBeVisible();
    expect(useWorkspaceStore.getState().recentResourceKeys).toEqual(history);
    fireEvent.click(favorites.getByRole('button', { name: 'Remove Torch from favorites' }));
    expect(
      within(content)
        .getAllByText(/^(Torch|Introduction)$/)
        .map((el) => el.textContent),
    ).toEqual(['Torch', 'Introduction']);
    expect(useWorkspaceStore.getState().recentResourceKeys).toEqual(history);
    expect(screen.queryByRole('button', { name: 'Recent' })).not.toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Characters' }), {
      target: { value: 'nothing matches' },
    });
    expect(within(content).getByText('Torch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(within(content).getByText('Torch')).toBeInTheDocument();
    const recentHeader = within(content).getByRole('button', { name: 'Recently opened' });
    fireEvent.click(recentHeader);
    expect(recentHeader).toHaveAttribute('aria-expanded', 'false');
    expect(within(content).getByText('Torch')).not.toBeVisible();
    fireEvent.click(recentHeader);
    expect(within(content).getByText('Torch')).toBeVisible();
    fireEvent.click(within(content).getByText('Introduction'));
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ kind: 'cutscene' }) }),
      { pin: false },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Characters' }), {
      target: { value: '' },
    });
    expect(screen.getByText('Player')).toBeInTheDocument();
  });
});
