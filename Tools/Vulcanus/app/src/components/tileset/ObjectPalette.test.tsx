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
      state.selectedObjectId = null;
      state.tilesets = new Map([
        [
          'test:village',
          {
            version: 1,
            id: 'test:village',
            name: 'Village',
            spriteSheet: 'village.png',
            columns: 4,
            tileCount: 64,
            tiles: {},
          },
        ],
      ]);
      const object = (id: string, name: string, extra = {}) => ({
        formatVersion: 1 as const,
        id,
        name,
        tilesetId: 'test:village',
        tiles: [{ x: 0, y: 0, tileIndex: 1 }],
        ...extra,
      });
      state.objects = [
        object('test:oak_tree', 'Oak Tree', { tags: ['nature'] }),
        object('test:barrel', 'Barrel', { folderPath: 'Market' }),
        object('test:unfinished', 'Unfinished', { tiles: [] }),
      ];
      state.loadedSprites = new Map();
    });
  });

  it('lists the objects with tiles and selects one to place', () => {
    renderWithChakra(<ObjectPalette />);

    expect(screen.queryByRole('button', { name: /unfinished/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /oak tree/i }));
    expect(useEditorStore.getState().selectedObjectId).toBe('test:oak_tree');
  });

  it('finds objects by name, folder or tag', () => {
    renderWithChakra(<ObjectPalette />);
    const search = screen.getByLabelText('Search objects');

    fireEvent.change(search, { target: { value: 'market' } });
    expect(screen.getByRole('button', { name: /barrel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /oak tree/i })).toBeNull();

    fireEvent.change(search, { target: { value: 'nature' } });
    expect(screen.getByRole('button', { name: /oak tree/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /barrel/i })).toBeNull();
  });
});
