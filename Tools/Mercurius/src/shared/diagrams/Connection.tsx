import { evolvePath } from '@remotion/paths';
import { useCurrentFrame } from 'remotion';
import { motion, progress } from '../theme/motion';
import { tokens } from '../theme/tokens';
import type { Point } from './Node';

export const Connection = ({
  from,
  to,
  label,
  start = 0,
  duration = motion.entranceFrames,
}: {
  from: Point;
  to: Point;
  label: string;
  start?: number;
  duration?: number;
}) => {
  const value = progress(useCurrentFrame(), start, duration);
  const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={tokens.color.accent}
        strokeWidth={3}
        {...evolvePath(value, path)}
      />
      <path
        d="M -12 -7 L 0 0 L -12 7"
        fill="none"
        stroke={tokens.color.accent}
        strokeWidth={3}
        transform={`translate(${to.x} ${to.y}) rotate(${angle})`}
        opacity={value === 1 ? 1 : 0}
      />
      <text
        x={(from.x + to.x) / 2}
        y={(from.y + to.y) / 2 - 18}
        textAnchor="middle"
        fontSize={18}
        fill={tokens.color.muted}
        opacity={value}
      >
        {label}
      </text>
    </g>
  );
};
