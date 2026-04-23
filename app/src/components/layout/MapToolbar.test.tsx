import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { enableMapSet } from 'immer';
import { MapToolbar } from './MapToolbar';
import { useEditorStore } from '../../store/useEditorStore';

enableMapSet();

const renderWithChakra = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe('MapToolbar object layers', () => {
  beforeEach(() => {
    useEditorStore.getState().closeProject();
  });

  it('shows object tools for explicit object layers', () => {
    useEditorStore.setState((state) => {
      state.currentMap = {
        version: 1,
        id: 'map',
        name: 'Map',
        width: 10,
        height: 10,
        baseTilesetId: 'village',
        tilesetRefs: ['village'],
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'object',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            sortingLayer: 'objects',
            objectInstances: [],
          },
        ],
        entities: [],
      };
      state.selectedLayerId = 'objects';
      state.activeTool = 'objectPlace';
    });

    renderWithChakra(<MapToolbar />);

    expect(screen.getByRole('button', { name: /select \/ move object/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place object/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete object/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bucket fill/i })).not.toBeInTheDocument();
  });

  it('shows object tools for legacy object-sorted visual layers too', () => {
    useEditorStore.setState((state) => {
      state.currentMap = {
        version: 1,
        id: 'map',
        name: 'Map',
        width: 10,
        height: 10,
        baseTilesetId: 'village',
        tilesetRefs: ['village'],
        layers: [
          {
            id: 'legacy-objects',
            name: 'Legacy Objects',
            kind: 'visual',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            sortingLayer: 'objects',
            objectInstances: [],
          },
        ],
        entities: [],
      };
      state.selectedLayerId = 'legacy-objects';
      state.activeTool = 'objectPlace';
    });

    renderWithChakra(<MapToolbar />);

    expect(screen.getByRole('button', { name: /place object/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete object/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /random/i })).not.toBeInTheDocument();
  });
});
