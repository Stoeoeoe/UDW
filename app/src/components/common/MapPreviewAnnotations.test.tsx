import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapPreviewAnnotations } from './MapPreviewAnnotations';
import { theme } from '../../theme';
import type { MapPreviewOverlay } from './MapPreviewPicker';

describe('vector map annotations', () => {
  it('projects world positions while preserving readable screen-space strokes, labels and markers', () => {
    const overlays: MapPreviewOverlay[] = [
      { kind: 'segment', from: [1, 2], to: [3, 2], label: '1' },
      { kind: 'character', position: [3, 2], label: 'Host', icon: 'H' },
      { kind: 'waypoint', position: [4, 2], label: '2' },
    ];
    const view = (scale: number) => (
      <ChakraProvider theme={theme}>
        <MapPreviewAnnotations
          overlays={overlays}
          width={480}
          height={320}
          scale={scale}
          pan={{ x: 10, y: 20 }}
        />
      </ChakraProvider>
    );
    const { container, rerender } = render(view(1));
    expect(container.querySelector('line')).toHaveAttribute('x1', '26');
    expect(container.querySelector('circle')).toHaveAttribute('cx', '58');
    expect(container.querySelector('circle')).toHaveAttribute('r', '5');
    expect(screen.getByText('H')).toHaveAttribute('x', '58');
    expect(screen.getByText('H')).toHaveAttribute('y', '52');
    expect(screen.getByText('H')).toHaveAttribute('dominant-baseline', 'text-after-edge');
    expect(screen.getByText('Host')).toHaveAttribute('font-size', '12');
    expect(screen.getByText('2')).toHaveAttribute('font-size', '11');
    expect(screen.getByText('2')).toHaveAttribute('x', '74');
    rerender(view(4));
    expect(screen.getByText('2')).toHaveAttribute('font-size', '11');
    expect(screen.getByText('2')).toHaveAttribute('x', '266');
    expect(container.querySelector('line')).toHaveAttribute('x1', '74');
    expect(container.querySelector('circle')).toHaveAttribute('cx', '202');
    expect(container.querySelector('circle')).toHaveAttribute('r', '5');
    expect(screen.getByText('Host')).toHaveAttribute('font-size', '12');
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
