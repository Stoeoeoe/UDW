import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuidedMapCreationDialog } from './GuidedMapCreationDialog';

vi.mock('../common/EditorModal', () => ({
  EditorModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="map-dialog">{children}</div> : null,
}));

vi.mock('./MapCreator', () => ({
  MapCreator: ({ onRequestCreateTileset }: { onRequestCreateTileset: () => void }) => (
    <button onClick={onRequestCreateTileset}>Import Tileset</button>
  ),
}));

vi.mock('../screens/tileset/CreateTilesetDialog', () => ({
  CreateTilesetDialog: ({
    isOpen,
    onCreatedTilesetId,
  }: {
    isOpen: boolean;
    onCreatedTilesetId: (tilesetId: string) => void;
  }) =>
    isOpen ? <button onClick={() => onCreatedTilesetId('forest')}>Finish Tileset</button> : null,
}));

describe('GuidedMapCreationDialog', () => {
  it('returns to map creation after a tileset is created', () => {
    render(<GuidedMapCreationDialog isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import Tileset' }));
    expect(screen.queryByTestId('map-dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish Tileset' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish Tileset' }));
    expect(screen.getByTestId('map-dialog')).toBeInTheDocument();
  });
});
