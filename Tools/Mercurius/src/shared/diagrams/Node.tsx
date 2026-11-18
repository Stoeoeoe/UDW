import { makeRect } from '@remotion/shapes';
import { useContext } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { entrance } from '../theme/motion';
import { directions, PresentationDirection } from '../theme/directions';
import { tokens } from '../theme/tokens';

export type Point = { x: number; y: number };
export type DiagramNode = Point & { width: number; height: number };
export const anchor = (
  node: DiagramNode,
  side: 'left' | 'right' | 'top' | 'bottom',
): Point => {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
  }
};

export const Node = ({
  bounds,
  title,
  subtitle,
  start = 0,
  active = false,
}: {
  bounds: DiagramNode;
  title: string;
  subtitle?: string;
  start?: number;
  active?: boolean;
}) => {
  const frame = useCurrentFrame();
  const direction = useContext(PresentationDirection);
  const { fps } = useVideoConfig();
  const rect = makeRect({
    width: bounds.width,
    height: bounds.height,
    cornerRadius: Math.min(18, directions[direction].radius),
  });
  return (
    <g transform={`translate(${bounds.x} ${bounds.y})`}>
      <g style={entrance(frame, fps, start)}>
        <path
          d={rect.path}
          fill={active ? 'var(--mercurius-accent)' : 'var(--mercurius-surface)'}
          stroke={
            active ? 'var(--mercurius-accent)' : 'var(--mercurius-border)'
          }
          strokeWidth={2}
        />
        <text
          x={bounds.width / 2}
          y={bounds.height / 2 + (subtitle ? -4 : 16)}
          textAnchor="middle"
          fill={active ? 'var(--mercurius-canvas)' : 'var(--mercurius-ink)'}
          fontSize={bounds.width < 300 ? tokens.type.body : 56}
          fontWeight={400}
        >
          {title}
        </text>
        {subtitle ? (
          <text
            x={bounds.width / 2}
            y={bounds.height / 2 + 42}
            textAnchor="middle"
            fill={active ? 'var(--mercurius-canvas)' : 'var(--mercurius-muted)'}
            fontSize={tokens.type.label}
          >
            {subtitle}
          </text>
        ) : null}
      </g>
    </g>
  );
};
