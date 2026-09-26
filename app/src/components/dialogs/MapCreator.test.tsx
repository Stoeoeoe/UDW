import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { MapCreator } from './MapCreator';

const mockEditorState = vi.hoisted(() => ({
  tilesets: new Map<string, { id: string; name: string }>(),
  createNewMap: vi.fn(),
}));

vi.mock('../../store/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof mockEditorState) => unknown) =>
    selector(mockEditorState),
}));

function renderMapCreator(props: React.ComponentProps<typeof MapCreator> = {}) {
  return render(
    <ChakraProvider theme={theme}>
      <MapCreator {...props} />
    </ChakraProvider>,
  );
}

describe('MapCreator', () => {
  beforeEach(() => {
    mockEditorState.tilesets = new Map();
    mockEditorState.createNewMap.mockReset();
  });

  it('guides the user to import a tileset when none exist', () => {
    const onRequestCreateTileset = vi.fn();

    renderMapCreator({ onRequestCreateTileset });

    expect(screen.getByText('Create a tileset first')).toBeInTheDocument();
    expect(screen.queryByText('Base Tileset')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import Tileset' }));
    expect(onRequestCreateTileset).toHaveBeenCalledOnce();
  });

  it('shows the map form when a tileset exists', () => {
    mockEditorState.tilesets = new Map([['forest', { id: 'forest', name: 'Forest Tileset' }]]);

    renderMapCreator();

    expect(screen.getByText('Base Tileset')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Forest Tileset' })).toHaveValue('forest');
    expect(screen.getByRole('button', { name: 'Create Map' })).toBeEnabled();
  });
});
