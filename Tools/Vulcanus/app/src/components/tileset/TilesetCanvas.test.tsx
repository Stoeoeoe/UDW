import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { enableMapSet } from 'immer';
import { TilesetCanvas } from './TilesetCanvas';
import { useEditorStore } from '../../store/useEditorStore';

enableMapSet();

vi.mock('../../hooks/useProject', () => ({
  useProject: () => ({ tileSize: 16 }),
}));

vi.mock('../../hooks/usePanZoom', () => ({
  usePanZoom: () => ({
    startPan: vi.fn(),
    panMove: vi.fn(() => false),
    stopPan: vi.fn(),
    handleWheel: vi.fn(),
  }),
}));

vi.mock('../common/ZoomControls', () => ({
  ZoomControls: () => null,
}));

const renderWithChakra = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

const contextStub = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  arcTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  imageSmoothingEnabled: false,
  shadowColor: '',
  shadowBlur: 0,
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 0,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'alphabetic' as CanvasTextBaseline,
};

describe('TilesetCanvas object mode', () => {
  const tileset = {
    version: 1,
    id: 'village',
    name: 'Village',
    spriteSheet: 'village.png',
    columns: 4,
    tileCount: 64,
    tiles: {},
    objects: [
      {
        id: 'tree',
        name: 'Tree',
        tiles: [
          { x: 0, y: 0, tileIndex: 0 },
          { x: 1, y: 0, tileIndex: 1 },
        ],
      },
    ],
  };

  beforeEach(() => {
    useEditorStore.getState().closeProject();
    vi.restoreAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      contextStub as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 64,
      right: 64,
      width: 64,
      height: 64,
      toJSON: () => ({}),
    } as DOMRect);

    useEditorStore.setState((state) => {
      state.tilesetToolMode = 'objects';
      state.selectedTileIndex = null;
      state.selectedTileIndices = [];
      state.selectedObjectDefinitionId = null;
      state.loadedSprites = new Map([
        [
          'village.png',
          {
            width: 64,
            height: 64,
          } as HTMLImageElement,
        ],
      ]);
    });
  });

  it('selects an object when clicking one of its tiles', () => {
    const { container } = renderWithChakra(
      <TilesetCanvas
        tileset={tileset}
        selectedIndex={null}
        onSelect={vi.fn()}
        mode="static"
        zoom={1}
        tool="objects"
        enableMultiSelect={true}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    fireEvent.mouseDown(canvas!, { button: 0, clientX: 4, clientY: 4 });

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBe('tree');
    expect(state.selectedTileIndices).toEqual([0, 1]);
  });

  it('clears the selected object when starting a new loose-tile selection', () => {
    useEditorStore.setState((state) => {
      state.selectedObjectDefinitionId = 'tree';
      state.selectedTileIndices = [0, 1];
    });

    const { container } = renderWithChakra(
      <TilesetCanvas
        tileset={tileset}
        selectedIndex={null}
        onSelect={vi.fn()}
        mode="static"
        zoom={1}
        tool="objects"
        enableMultiSelect={true}
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    fireEvent.mouseDown(canvas!, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas!, { button: 0, clientX: 20, clientY: 20 });

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBeNull();
    expect(state.selectedTileIndices).toEqual([5]);
  });
});
