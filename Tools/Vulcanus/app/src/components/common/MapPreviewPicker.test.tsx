import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapPreviewPicker } from './MapPreviewPicker';
import { useEditorStore } from '../../store/useEditorStore';
import { theme } from '../../theme';

describe('scrollable map preview', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    useEditorStore.setState({
      project: { id: 'base:game', tileSize: 16 } as never,
      maps: [
        { id: 'base:map', name: 'Map', width: 8, height: 8, layers: [], entities: [] } as never,
      ],
      currentMap: null,
    });
  });

  it('lets wheel scrolling reach the page and zooms only through explicit controls', () => {
    const onWheel = vi.fn();
    const { container } = render(
      <ChakraProvider theme={theme}>
        <div onWheel={onWheel}>
          <MapPreviewPicker
            mapId="base:map"
            wheelZoom={false}
            initialZoom={1}
            interactive={false}
          />
        </div>
      </ChakraProvider>,
    );
    const viewport = container.querySelector('canvas')!.parentElement!;
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(onWheel).toHaveBeenCalledOnce();
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/Scroll to zoom/)).not.toBeInTheDocument();
  });
  it('navigates a standalone preview with left drag and consumes wheel zoom without picking tiles', () => {
    const onSelect = vi.fn(),
      onWheel = vi.fn();
    const { container } = render(
      <ChakraProvider theme={theme}>
        <div onWheel={onWheel}>
          <MapPreviewPicker mapId="base:map" leftDragPan wheelZoom onSelect={onSelect} />
        </div>
      </ChakraProvider>,
    );
    const canvas = container.querySelector('canvas')!;
    const viewport = canvas.parentElement!;
    fireEvent.mouseDown(viewport, { button: 0, clientX: 150, clientY: 100 });
    expect(viewport).toHaveStyle({ cursor: 'grabbing' });
    fireEvent.mouseMove(viewport, { clientX: 100, clientY: 80 });
    expect(canvas.style.left).toBe('-50px');
    fireEvent.mouseUp(viewport, { button: 0, clientX: 100, clientY: 80 });
    expect(viewport).toHaveStyle({ cursor: 'grab' });
    fireEvent.mouseMove(viewport, { clientX: 50, clientY: 40 });
    expect(canvas.style.left).toBe('-50px');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.wheel(viewport, { deltaY: -100, clientX: 100, clientY: 80 });
    expect(screen.getByText('240%')).toBeInTheDocument();
    expect(onWheel).not.toHaveBeenCalled();
  });

  it('frames the selected step while preserving manual Fit until selection changes', () => {
    useEditorStore.setState({
      maps: [
        { id: 'base:map', name: 'Map', width: 100, height: 100, layers: [], entities: [] } as never,
      ],
    });
    const view = (focusKey: string) => (
      <ChakraProvider theme={theme}>
        <MapPreviewPicker
          mapId="base:map"
          wheelZoom={false}
          initialZoom={1}
          focusPositions={[
            [30, 30],
            [40, 30],
          ]}
          focusKey={focusKey}
        />
      </ChakraProvider>
    );
    const { rerender, container } = render(view('first'));
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(view('first'));
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(view('second'));
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    // Only game tiles are rasterized; annotations use viewport-sized vectors.
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelector('canvas')!.width).toBe(1600);
    expect(container.querySelector('svg[viewBox="0 0 480 320"]')).toBeInTheDocument();
  });
  it('picks tile centers or exact pixels while keeping left drag available for navigation', () => {
    useEditorStore.setState({
      maps: [
        { id: 'base:map', name: 'Map', width: 32, height: 32, layers: [], entities: [] } as never,
      ],
    });
    const onPick = vi.fn(),
      onHover = vi.fn();
    const view = (mode: 'tile' | 'pixel') => (
      <ChakraProvider theme={theme}>
        <MapPreviewPicker
          mapId="base:map"
          interactive={false}
          initialZoom={1}
          leftDragPan
          positionPick={{ mode, onPick, onHover }}
        />
      </ChakraProvider>
    );
    const { container, rerender } = render(view('tile'));
    const viewport = container.querySelector('canvas')!.parentElement!;
    fireEvent.mouseMove(viewport, { clientX: 187, clientY: 67 });
    expect(onHover).toHaveBeenLastCalledWith({ x: 168, y: 104 });
    fireEvent.mouseDown(viewport, { button: 0, clientX: 187, clientY: 67 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 187, clientY: 67 });
    expect(onPick).toHaveBeenLastCalledWith({ x: 168, y: 104 });
    rerender(view('pixel'));
    fireEvent.mouseDown(viewport, { button: 0, clientX: 187, clientY: 67 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 187, clientY: 67 });
    expect(onPick).toHaveBeenLastCalledWith({ x: 171, y: 107 });
    fireEvent.mouseDown(viewport, { button: 0, clientX: 187, clientY: 67 });
    fireEvent.mouseMove(viewport, { clientX: 137, clientY: 100 });
    fireEvent.mouseUp(viewport, { button: 0, clientX: 137, clientY: 100 });
    expect(onPick).toHaveBeenCalledTimes(2);
    fireEvent.mouseMove(viewport, { clientX: 1, clientY: 1 });
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});
