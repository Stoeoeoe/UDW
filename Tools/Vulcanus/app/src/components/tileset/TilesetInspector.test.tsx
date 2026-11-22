import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { enableMapSet } from 'immer';
import { TilesetInspector } from './TilesetInspector';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

enableMapSet();

vi.mock('./TileCollisionEditor', () => ({
  TileCollisionEditor: () => null,
}));

vi.mock('../screens', () => ({
  InspectorEmptyState: ({ message, hint }: { message: string; hint?: string }) => (
    <div>
      <div>{message}</div>
      {hint ? <div>{hint}</div> : null}
    </div>
  ),
}));

const renderWithChakra = (ui: React.ReactElement) => {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('TilesetInspector object mode', () => {
  const baseTileset = {
    version: 1,
    id: 'test:village',
    name: 'Village',
    spriteSheet: 'village.png',
    columns: 4,
    tileCount: 64,
    tiles: {},
  };
  const openDocument = vi.fn();

  beforeEach(() => {
    openDocument.mockClear();
    useEditorStore.getState().closeProject();
    useWorkspaceStore.setState({ openDocument });
    useEditorStore.setState((state) => {
      state.project = { idPrefix: 'test' } as typeof state.project;
      state.tilesetToolMode = 'objects';
      state.selectedTileIndex = 5;
      state.selectedTileIndices = [0, 1, 4, 5];
      state.selectedObjectId = null;
      state.objects = [];
      state.maps = [];
      state.tilesets = new Map();
      state.loadedSprites = new Map();
    });
  });

  it('makes an object file from the selected tiles and opens it', async () => {
    const addObject = vi.fn().mockResolvedValue(undefined);
    useEditorStore.setState({ addObject });

    renderWithChakra(<TilesetInspector tileset={baseTileset} />);
    fireEvent.click(screen.getByRole('button', { name: /create object from selection/i }));
    fireEvent.change(await screen.findByPlaceholderText('e.g. My Object'), {
      target: { value: 'Oak Tree' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create object$/i }));

    await waitFor(() =>
      expect(addObject).toHaveBeenCalledWith({
        formatVersion: 1,
        id: 'test:oak_tree',
        name: 'Oak Tree',
        tilesetId: 'test:village',
        tiles: [
          { x: 0, y: 0, tileIndex: 0 },
          { x: 1, y: 0, tileIndex: 1 },
          { x: 0, y: 1, tileIndex: 4 },
          { x: 1, y: 1, tileIndex: 5 },
        ],
        folderPath: '',
      }),
    );
    expect(useEditorStore.getState().selectedObjectId).toBe('test:oak_tree');
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'object', objectId: 'test:oak_tree' }),
      { pin: true },
    );
  });

  it('shows the selected object of this tileset and opens it in the object editor', () => {
    useEditorStore.setState((state) => {
      state.objects = [
        {
          formatVersion: 1,
          id: 'test:oak_tree',
          name: 'Oak Tree',
          tilesetId: 'test:village',
          tiles: [
            { x: 0, y: 0, tileIndex: 0 },
            { x: 0, y: 1, tileIndex: 4 },
          ],
        },
      ];
      state.selectedObjectId = 'test:oak_tree';
    });

    renderWithChakra(<TilesetInspector tileset={baseTileset} />);
    expect(screen.getByText('1 × 2 tiles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open object/i }));
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'object', objectId: 'test:oak_tree' }),
      { pin: true },
    );
  });
});

describe('TilesetInspector navigation cost', () => {
  const tileset = {
    version: 1,
    id: 'village',
    name: 'Village',
    spriteSheet: 'village.png',
    columns: 4,
    tileCount: 64,
    tiles: { 3: { navigationCost: 4 } },
    objects: [],
  };

  const setup = (selected: number[]) => {
    const setTilesNavigationCost = vi.fn();
    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesetToolMode = 'tiles';
      state.selectedTileIndex = selected[selected.length - 1];
      state.selectedTileIndices = selected;
      state.selectedObjectId = null;
      state.maps = [];
      state.tilesets = new Map();
      state.loadedSprites = new Map();
      state.setTilesNavigationCost = setTilesNavigationCost;
    });
    renderWithChakra(<TilesetInspector tileset={tileset} />);
    return setTilesNavigationCost;
  };

  it('sets the cost on a single tile', () => {
    const set = setup([5]);
    fireEvent.change(screen.getByPlaceholderText('Not set'), { target: { value: '3' } });
    expect(set).toHaveBeenCalledWith('village', [5], 3);
  });

  it('applies the cost to every selected tile', () => {
    const set = setup([5, 6, 7]);
    fireEvent.change(screen.getByPlaceholderText('Not set'), { target: { value: '1' } });
    expect(set).toHaveBeenCalledWith('village', [5, 6, 7], 1);
  });

  it('clears the cost when emptied', () => {
    const set = setup([3]);
    const input = screen.getByPlaceholderText('Not set');
    expect(input).toHaveValue('4');
    fireEvent.change(input, { target: { value: '' } });
    expect(set).toHaveBeenCalledWith('village', [3], undefined);
  });

  it('ignores out-of-range values', () => {
    const set = setup([5]);
    fireEvent.change(screen.getByPlaceholderText('Not set'), { target: { value: '500' } });
    expect(set).not.toHaveBeenCalled();
  });
});
