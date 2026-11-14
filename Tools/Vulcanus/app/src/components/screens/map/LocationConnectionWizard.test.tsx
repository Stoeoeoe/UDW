import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { LocationConnectionWizard } from './LocationConnectionWizard';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  connectionMaps,
  connectionTrigger,
  connectionAnchor,
} from '../../../lib/__fixtures__/locationConnection';
import { theme } from '../../../theme';
import type { Project } from '../../../types/schema';

// Exercise the wizard independently of canvas drawing (covered by MapPreviewPicker's tests).
vi.mock('../../common/MapPreviewPicker', () => ({
  MapPreviewPicker: ({
    onSelect,
    positionPick,
    mapId,
  }: {
    mapId: string;
    onSelect?: (x: number, y: number) => void;
    positionPick?: { onPick: (point: { x: number; y: number }) => void };
  }) => (
    <button
      onClick={() => (positionPick ? positionPick.onPick({ x: 88, y: 88 }) : onSelect?.(5, 5))}
    >
      Pick on {mapId}
    </button>
  ),
}));
vi.mock('../../../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(),
    resolveFilename: (_folder: string, filename: string) => filename,
  },
}));
enableMapSet();

describe('location connection wizard', () => {
  beforeEach(() => {
    const maps = connectionMaps();
    maps[0].spatialPrimitives = { triggers: [connectionTrigger('outside-exit')] };
    maps[1].spatialPrimitives = { anchors: [connectionAnchor('inside-arrival', [-1, 0])] };
    useEditorStore.setState({
      maps,
      currentMap: maps[0],
      project: { idPrefix: 'base', tileSize: 16 } as Project,
    });
    render(
      <ChakraProvider theme={theme}>
        <LocationConnectionWizard initialTriggerId="outside-exit" />
      </ChakraProvider>,
    );
  });
  afterEach(cleanup);
  const destination = () => {
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination map' }), {
      target: { value: 'base:inside' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('requires confirmation of shared arrival facing before review and creates a one-way link', () => {
    destination();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also create a way back' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'base:inside arrival anchor' }), {
      target: { value: 'inside-arrival' },
    });
    expect(screen.getByText(/Direction: Left/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Confirm each arrival anchor and facing direction.',
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm arrival position and facing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Press Interact → inside-arrival, facing Left/)).toBeInTheDocument();
    expect(useEditorStore.getState().currentMap!.locationLinks).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    expect(useEditorStore.getState().currentMap!.locationLinks![0].targetAnchorId).toBe(
      'inside-arrival',
    );
    expect(useEditorStore.getState().maps[1].spatialPrimitives!.anchors![0].facing).toEqual([
      -1, 0,
    ]);
  });

  it('keeps new areas and anchors in the draft when cancelled', () => {
    destination();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also create a way back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place new arrival anchor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick on base:inside' }));
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useEditorStore.getState().maps[1].spatialPrimitives!.anchors).toHaveLength(1);
    expect(useEditorStore.getState().currentMap!.locationLinks).toBeUndefined();
  });

  it('saves the explicitly chosen direction on a new arrival anchor', () => {
    destination();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also create a way back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place new arrival anchor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick on base:inside' }));
    fireEvent.click(screen.getByRole('button', { name: 'Up' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirm arrival position and facing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    expect(useEditorStore.getState().maps[1].spatialPrimitives!.anchors![1]).toMatchObject({
      position: [88, 88],
      facing: [0, -1],
    });
  });
});
