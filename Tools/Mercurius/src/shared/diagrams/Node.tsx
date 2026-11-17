import { makeRect } from '@remotion/shapes';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { entrance } from '../theme/motion';
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
  subtitle: string;
  start?: number;
  active?: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rect = makeRect({
    width: bounds.width,
    height: bounds.height,
    cornerRadius: 18,
  });
  return (
    <g transform={`translate(${bounds.x} ${bounds.y})`}>
      <g style={entrance(frame, fps, start)}>
        <path
          d={rect.path}
          fill={tokens.color.surface}
          stroke={active ? tokens.color.accent : tokens.color.border}
          strokeWidth={2}
        />
        <text
          x={bounds.width / 2}
          y={bounds.height / 2 - 4}
          textAnchor="middle"
          fill={tokens.color.ink}
          fontSize={27}
          fontWeight={700}
        >
          {title}
        </text>
        <text
          x={bounds.width / 2}
          y={bounds.height / 2 + 30}
          textAnchor="middle"
          fill={tokens.color.muted}
          fontSize={19}
        >
          {subtitle}
        </text>
      </g>
    </g>
  );
};
