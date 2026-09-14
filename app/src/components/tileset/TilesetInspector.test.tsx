import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { enableMapSet } from 'immer';
import { TilesetInspector } from './TilesetInspector';
import { useEditorStore } from '../../store/useEditorStore';

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
    id: 'village',
    name: 'Village',
    spriteSheet: 'village.png',
    columns: 4,
    tileCount: 64,
    tiles: {},
    objects: [],
  };

  beforeEach(() => {
    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesetToolMode = 'objects';
      state.selectedTileIndex = 5;
      state.selectedTileIndices = [0, 1, 4, 5];
      state.selectedObjectDefinitionId = null;
      state.maps = [];
      state.tilesets = new Map();
      state.loadedSprites = new Map();
    });
  });

  it('opens the create modal and keeps typed values', async () => {
    renderWithChakra(<TilesetInspector tileset={baseTileset} />);

    fireEvent.click(screen.getByRole('button', { name: /create object from selection/i }));

    const nameInput = await screen.findByLabelText(/^name$/i);
    const idInput = await screen.findByLabelText(/^id$/i);

    fireEvent.change(nameInput, { target: { value: 'Oak Tree' } });
    fireEvent.change(idInput, { target: { value: 'oak_tree' } });

    expect(nameInput).toHaveValue('Oak Tree');
    expect(idInput).toHaveValue('oak_tree');
    expect(screen.getByRole('button', { name: /^create$/i })).toBeEnabled();
  });

  it('submits the create modal and selects the created object', async () => {
    const updateTileset = vi.fn().mockResolvedValue(undefined);

    useEditorStore.setState((state) => {
      state.updateTileset = updateTileset;
    });

    renderWithChakra(<TilesetInspector tileset={baseTileset} />);

    fireEvent.click(screen.getByRole('button', { name: /create object from selection/i }));

    fireEvent.change(await screen.findByLabelText(/^name$/i), {
      target: { value: 'Oak Tree' },
    });
    fireEvent.change(screen.getByLabelText(/^id$/i), {
      target: { value: 'oak_tree' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(updateTileset).toHaveBeenCalledWith('village', {
        objects: [
          {
            id: 'oak_tree',
            name: 'Oak Tree',
            tiles: [
              { x: 0, y: 0, tileIndex: 0 },
              { x: 1, y: 0, tileIndex: 1 },
              { x: 0, y: 1, tileIndex: 4 },
              { x: 1, y: 1, tileIndex: 5 },
            ],
          },
        ],
      });
    });

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBe('oak_tree');
    expect(state.selectedTileIndices).toEqual([0, 1, 4, 5]);
  });
});
