import React from 'react';
import { Box, useToken } from '@chakra-ui/react';
import type { MapPreviewOverlay } from './MapPreviewPicker';

type Point = [number, number];
const TILE_PIXELS = 16;

/** Annotations are vector UI in viewport pixels, independent of the pixel-art canvas. */
export const MapPreviewAnnotations: React.FC<{
  overlays?: MapPreviewOverlay[];
  width: number;
  height: number;
  scale: number;
  pan: { x: number; y: number };
}> = ({ overlays, width, height, scale, pan }) => {
  const [movement, facing, actor, ghost, background, text] = useToken('colors', [
    'cyan.400',
    'orange.300',
    'blue.200',
    'gray.300',
    'editorFieldBg',
    'cyan.50',
  ]);
  const colors = { movement, facing, actor, ghost, background, text };
  const project = ([x, y]: Point): Point => [
    x * TILE_PIXELS * scale + pan.x,
    y * TILE_PIXELS * scale + pan.y,
  ];
  const arrow = (from: Point, to: Point, color: string, dashed = false, endpointInset = 0) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (!length) return null;
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    // Keep movement heads outside the actor marker instead of hiding under it.
    const inset = Math.min(endpointInset, length * 0.2);
    const tip: Point = [to[0] - inset * Math.cos(angle), to[1] - inset * Math.sin(angle)];
    const headLength = Math.min(dashed ? 8 : 13, length * 0.5);
    const wing = (offset: number) =>
      `${tip[0] - headLength * Math.cos(angle + offset)},${tip[1] - headLength * Math.sin(angle + offset)}`;
    return (
      <g stroke={color} fill={color} strokeWidth={2}>
        <line
          x1={from[0]}
          y1={from[1]}
          x2={tip[0]}
          y2={tip[1]}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
        <polygon points={`${tip[0]},${tip[1]} ${wing(-0.5)} ${wing(0.5)}`} stroke="none" />
      </g>
    );
  };
  const label = (text: string, x: number, y: number, color = colors.text) => (
    <text
      x={Math.max(8, Math.min(width - Math.min(text.length * 7, width - 16) - 8, x))}
      y={Math.max(16, Math.min(height - 8, y))}
      fill={color}
      stroke={colors.background}
      strokeWidth={4}
      paintOrder="stroke"
      strokeLinejoin="round"
      fontFamily="sans-serif"
      fontSize={12}
    >
      {text}
    </text>
  );
  const facingArrow = (position: Point, facing: Point, color: string) => {
    const length = Math.hypot(...facing);
    if (!length) return null;
    return arrow(
      position,
      [position[0] + (facing[0] / length) * 20, position[1] + (facing[1] / length) * 20],
      color,
      true,
    );
  };
  return (
    <Box
      as="svg"
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      position="absolute"
      inset={0}
      w={`${width}px`}
      h={`${height}px`}
      pointerEvents="none"
      shapeRendering="geometricPrecision"
    >
      {overlays?.map((overlay, index) => {
        if (overlay.kind === 'placement') {
          const [x, y] = project(overlay.position);
          return (
            <g key={index} stroke={colors.actor} strokeWidth={2} fill="none">
              {overlay.icon && (
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="text-after-edge"
                  fontSize={16 * scale}
                >
                  {overlay.icon}
                </text>
              )}
              <circle cx={x} cy={y} r={9} strokeDasharray="3 3" />
              <line x1={x - 14} x2={x + 14} y1={y} y2={y} />
              <line x1={x} x2={x} y1={y - 14} y2={y + 14} />
              {label(overlay.label, x + 12, y - 15)}
            </g>
          );
        }
        if (overlay.kind === 'segment') {
          const from = project(overlay.from);
          let to = project(overlay.to);
          if (overlay.dashed) {
            const dx = to[0] - from[0],
              dy = to[1] - from[1],
              length = Math.hypot(dx, dy);
            if (!length) return null;
            const size = Math.max(18, length);
            to = [from[0] + (dx / length) * size, from[1] + (dy / length) * size];
          }
          const color = overlay.dashed ? colors.facing : colors.movement;
          return (
            <g key={index} opacity={overlay.opacity ?? 1}>
              {arrow(from, to, color, overlay.dashed, overlay.dashed ? 0 : 8)}
              {label(overlay.label, (from[0] + to[0]) / 2 + 5, (from[1] + to[1]) / 2 - 6, color)}
            </g>
          );
        }
        if (overlay.kind === 'actor') {
          const position = project(overlay.position);
          const color = overlay.ghost ? colors.ghost : colors.actor;
          return (
            <g key={index} opacity={overlay.opacity ?? 1}>
              {overlay.facing && facingArrow(position, overlay.facing, color)}
              {overlay.icon && (
                <text
                  x={position[0]}
                  y={position[1]}
                  textAnchor="middle"
                  dominantBaseline="text-after-edge"
                  fontSize={16 * scale}
                >
                  {overlay.icon}
                </text>
              )}
              <circle
                cx={position[0]}
                cy={position[1]}
                r={5}
                fill={colors.background}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={overlay.ghost ? '3 3' : undefined}
              />
              {!overlay.ghost && label(overlay.label, position[0] + 9, position[1] - 10)}
            </g>
          );
        }
        if (overlay.kind === 'trigger') {
          const position = project(overlay.position),
            size = overlay.size ?? [1, 1],
            color = overlay.color ?? colors.facing;
          return (
            <rect
              key={index}
              x={position[0]}
              y={position[1]}
              width={size[0] * TILE_PIXELS * scale}
              height={size[1] * TILE_PIXELS * scale}
              fill={color}
              fillOpacity={0.2}
              stroke={color}
              strokeWidth={1.5}
            />
          );
        }
        const position = project([overlay.position[0] + 0.5, overlay.position[1] + 0.5]);
        const color =
          overlay.color ?? (overlay.kind === 'anchor' ? colors.facing : colors.movement);
        return (
          <g key={index}>
            {overlay.kind === 'anchor' && (
              <g stroke={color} strokeWidth={1.5}>
                <line x1={position[0] - 6} x2={position[0] + 6} y1={position[1]} y2={position[1]} />
                <line x1={position[0]} x2={position[0]} y1={position[1] - 6} y2={position[1] + 6} />
              </g>
            )}
            <circle cx={position[0]} cy={position[1]} r={3} fill={color} />
            {facingArrow(position, overlay.facing ?? [0, 1], color)}
          </g>
        );
      })}
    </Box>
  );
};
