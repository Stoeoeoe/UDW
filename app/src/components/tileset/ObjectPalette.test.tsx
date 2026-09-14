import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { enableMapSet } from 'immer';
import { ObjectPalette } from './ObjectPalette';
import { useEditorStore } from '../../store/useEditorStore';

enableMapSet();

const renderWithChakra = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe('ObjectPalette', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useEditorStore.getState().closeProject();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          drawImage: vi.fn(),
          imageSmoothingEnabled: false,
        }) as unknown as CanvasRenderingContext2D,
    );

    useEditorStore.setState((state) => {
      state.project = {
        id: 'project',
        version: '1.0',
        name: 'Test Project',
        tileSize: 16,
        defaultMapWidth: 10,
        defaultMapHeight: 10,
      };
      state.activeTilesetId = 'village';
      state.selectedObjectDefinitionId = null;
      state.selectedTileIndex = null;
      state.selectedTileIndices = [];
      state.sampledPattern = null;
      state.tilesets = new Map([
        [
          'village',
          {
            version: 1,
            id: 'village',
            name: 'Village',
            spriteSheet: 'village.png',
            columns: 4,
            tileCount: 64,
            tiles: {},
            objects: [
              {
                id: 'oak_tree',
                name: 'Oak Tree',
                tiles: [
                  { x: 0, y: 0, tileIndex: 1 },
                  { x: 1, y: 0, tileIndex: 2 },
                  { x: 0, y: 1, tileIndex: 5 },
                ],
              },
            ],
          },
        ],
      ]);
      state.loadedSprites = new Map();
    });
  });

  it('selects an object definition and prepares its stamp pattern', () => {
    renderWithChakra(<ObjectPalette />);

    fireEvent.click(screen.getByRole('button', { name: /oak tree/i }));

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBe('oak_tree');
    expect(state.selectedTileIndices).toEqual([]);
    expect(state.sampledPattern).toEqual({
      tilesetId: 'village',
      pattern: [
        [1, 2],
        [5, null],
      ],
      width: 2,
      height: 2,
    });
  });
});
