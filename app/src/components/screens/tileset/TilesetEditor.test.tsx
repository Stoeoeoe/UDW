import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useEditorStore } from '../../../store/useEditorStore';

enableMapSet();

// vi.hoisted allows these spies to be referenced inside hoisted vi.mock factories
const mockToast = vi.hoisted(() => vi.fn());
const mockUseDisclosure = vi.hoisted(() =>
  vi.fn(() => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })),
);

vi.mock('@chakra-ui/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  type P = {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler;
    'aria-label'?: string;
  } & Record<string, unknown>;
  return {
    Flex: ({ children, onClick }: P) => React.createElement('div', { onClick }, children),
    Box: ({ children, onClick, role }: P) =>
      React.createElement('div', { onClick, role: role as string | undefined }, children),
    VStack: ({ children }: P) => React.createElement('div', null, children),
    HStack: ({ children }: P) => React.createElement('div', null, children),
    Text: ({ children }: P) => React.createElement('div', null, children),
    Heading: ({ children }: P) => React.createElement('div', null, children),
    Button: ({ children, onClick }: P) => React.createElement('button', { onClick }, children),
    IconButton: ({ 'aria-label': label, onClick }: P) =>
      React.createElement('button', { 'aria-label': label, onClick }),
    Input: ({ value, onChange, placeholder }: P) =>
      React.createElement('input', {
        value: value as string,
        onChange: onChange as React.ChangeEventHandler,
        placeholder: placeholder as string,
      }),
    Tooltip: ({ children }: P) => React.createElement('div', null, children),
    Center: ({ children }: P) => React.createElement('div', null, children),
    useDisclosure: mockUseDisclosure,
    useToast: () => mockToast,
  };
});

vi.mock('@chakra-ui/icons', () => ({
  EditIcon: () => null,
  DeleteIcon: () => null,
  AddIcon: () => null,
}));

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  PanelGroup: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  PanelResizeHandle: () => null,
}));

vi.mock('../../tileset/TilesetCanvas', () => ({
  TilesetCanvas: () => React.createElement('div', { 'data-testid': 'tileset-canvas' }),
}));

vi.mock('../../tileset/TilesetInspector', () => ({
  TilesetInspector: () => React.createElement('div', { 'data-testid': 'tileset-inspector' }),
}));

vi.mock('../../tileset/TilesetTerrainPanel', () => ({
  TilesetTerrainPanel: () => React.createElement('div', { 'data-testid': 'tileset-terrain-panel' }),
}));

vi.mock('../../tileset/TilesetMetadataDialog', () => ({
  default: () => null,
}));

vi.mock('./CreateTilesetDialog', () => ({
  CreateTilesetDialog: () => null,
}));

vi.mock('../../../hooks/useProject', () => ({
  useProject: () => ({ tileSize: 16 }),
}));

vi.mock('../../../hooks/useTileSelection', () => ({
  useTileSelection: () => ({ selectedTileIndex: null, handleTileSelect: vi.fn() }),
}));

import { TilesetEditor } from './TilesetEditor';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseTileset = {
  version: 1,
  id: 'village',
  name: 'Village Tileset',
  spriteSheet: 'assets/village.png',
  columns: 10,
  tileCount: 100,
  tiles: {},
  objects: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupStore(overrides: Record<string, unknown> = {}) {
  useEditorStore.getState().closeProject();
  useEditorStore.setState((state) => {
    state.tilesets = new Map();
    state.loadedSprites = new Map();
    state.activeTilesetId = null;
    state.tilesetToolMode = 'select';
  });
  if (Object.keys(overrides).length > 0) {
    useEditorStore.setState(overrides);
  }
}

function setupNormalEditor() {
  useEditorStore.getState().closeProject();
  useEditorStore.setState((state) => {
    state.tilesets = new Map([['village', baseTileset as never]]);
    state.activeTilesetId = 'village';
    state.loadedSprites = new Map([['assets/village.png', {} as never]]);
    state.tilesetToolMode = 'select';
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TilesetEditor', () => {
  beforeEach(() => {
    mockToast.mockReset();
    mockUseDisclosure.mockReset();
    mockUseDisclosure.mockImplementation(() => ({
      isOpen: false,
      onOpen: vi.fn(),
      onClose: vi.fn(),
    }));
  });

  // -------------------------------------------------------------------------
  // Branch 1 – no active tileset
  // -------------------------------------------------------------------------

  it('renders empty screen when no tilesets exist', () => {
    setupStore();
    render(<TilesetEditor />);

    expect(screen.getByText('No Tileset Active')).toBeTruthy();
  });

  it('shows Create Tileset button on empty screen', () => {
    setupStore();
    render(<TilesetEditor />);

    expect(screen.getByRole('button', { name: /create tileset/i })).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Branch 2 – active tileset but sprite not loaded
  // -------------------------------------------------------------------------

  it('shows missing-image UI when tileset sprite is not loaded', () => {
    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesets = new Map([['village', baseTileset as never]]);
      state.activeTilesetId = 'village';
      state.loadedSprites = new Map(); // sprite absent
    });

    render(<TilesetEditor />);

    expect(screen.getByText('Tileset image missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /choose image/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /import new tileset/i })).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Branch 3 – active tileset with sprite loaded
  // -------------------------------------------------------------------------

  it('renders tileset canvas when active tileset and sprite are loaded', () => {
    setupNormalEditor();
    render(<TilesetEditor />);

    expect(screen.getByTestId('tileset-canvas')).toBeTruthy();
  });

  it('shows tileset name in the editor header', () => {
    setupNormalEditor();
    render(<TilesetEditor />);

    // Name appears in both the layout header and the list panel — at least one confirms the editor rendered
    expect(screen.getAllByText('Village Tileset').length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Tileset list sublabel formatting
  // -------------------------------------------------------------------------

  it('formats tileset list sublabel as tileSize×tileSize • tileCount tiles', () => {
    setupNormalEditor();
    render(<TilesetEditor />);

    // tileSize is 16 from useProject mock, tileCount is 100 from baseTileset
    expect(screen.getByText('16×16 • 100 tiles')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Tileset selection
  // -------------------------------------------------------------------------

  it('calls setActiveTileset when a tileset is clicked in the list', async () => {
    const setActiveTileset = vi.fn();
    const resetSelectedTiles = vi.fn();

    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesets = new Map([['village', baseTileset as never]]);
      state.activeTilesetId = null;
      state.loadedSprites = new Map();
    });
    useEditorStore.setState({ setActiveTileset, resetSelectedTiles });

    render(<TilesetEditor />);

    fireEvent.click(screen.getByText('Village Tileset'));

    await waitFor(() => {
      expect(setActiveTileset).toHaveBeenCalledWith('village');
    });
  });

  it('calls resetSelectedTiles when a tileset is selected', async () => {
    const setActiveTileset = vi.fn();
    const resetSelectedTiles = vi.fn();

    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesets = new Map([['village', baseTileset as never]]);
      state.activeTilesetId = null;
      state.loadedSprites = new Map();
    });
    useEditorStore.setState({ setActiveTileset, resetSelectedTiles });

    render(<TilesetEditor />);

    fireEvent.click(screen.getByText('Village Tileset'));

    await waitFor(() => {
      expect(resetSelectedTiles).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Delete action
  // -------------------------------------------------------------------------

  it('calls deleteTileset when delete is confirmed', async () => {
    const deleteTileset = vi.fn().mockResolvedValue(undefined);
    setupNormalEditor();
    useEditorStore.setState({ deleteTileset });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TilesetEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tileset' }));

    await waitFor(() => {
      expect(deleteTileset).toHaveBeenCalledWith('village');
    });

    vi.restoreAllMocks();
  });

  it('shows success toast after deleting a tileset', async () => {
    const deleteTileset = vi.fn().mockResolvedValue(undefined);
    setupNormalEditor();
    useEditorStore.setState({ deleteTileset });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TilesetEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tileset' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Tileset deleted', status: 'info' }),
      );
    });

    vi.restoreAllMocks();
  });

  it('does not call deleteTileset when delete is cancelled', async () => {
    const deleteTileset = vi.fn();
    setupNormalEditor();
    useEditorStore.setState({ deleteTileset });

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<TilesetEditor />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tileset' }));

    // Give async operations a chance to run
    await waitFor(() => new Promise((r) => setTimeout(r, 50)));

    expect(deleteTileset).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Mode switching – right panel
  // -------------------------------------------------------------------------

  it('renders TilesetInspector when tilesetToolMode is select', () => {
    setupNormalEditor();
    useEditorStore.setState({ tilesetToolMode: 'select' });

    render(<TilesetEditor />);

    expect(screen.getByTestId('tileset-inspector')).toBeTruthy();
    expect(screen.queryByTestId('tileset-terrain-panel')).toBeNull();
  });

  it('renders TilesetTerrainPanel when tilesetToolMode is terrain', () => {
    setupNormalEditor();
    useEditorStore.setState({ tilesetToolMode: 'terrain' });

    render(<TilesetEditor />);

    expect(screen.getByTestId('tileset-terrain-panel')).toBeTruthy();
    expect(screen.queryByTestId('tileset-inspector')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Edit action – selects tileset first if not already active
  // -------------------------------------------------------------------------

  it('calls setActiveTileset when edit is clicked on an inactive tileset', async () => {
    const setActiveTileset = vi.fn();
    const resetSelectedTiles = vi.fn();

    // Two tilesets; only 'other' is active, 'village' is inactive
    const otherTileset = {
      ...baseTileset,
      id: 'other',
      name: 'Other Tileset',
      spriteSheet: 'other.png',
    };

    useEditorStore.getState().closeProject();
    useEditorStore.setState((state) => {
      state.tilesets = new Map([
        ['village', baseTileset as never],
        ['other', otherTileset as never],
      ]);
      state.activeTilesetId = 'other';
      state.loadedSprites = new Map([['other.png', {} as never]]);
      state.tilesetToolMode = 'select';
    });
    useEditorStore.setState({ setActiveTileset, resetSelectedTiles });

    render(<TilesetEditor />);

    // The 'village' tileset is in the list but not active — click its Edit button
    const editButtons = screen.getAllByRole('button', { name: 'Edit Tileset' });
    // editButtons[0] is for 'village' (first in map iteration), [1] for 'other'
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(setActiveTileset).toHaveBeenCalledWith('village');
    });
  });
});
