import type { ReactNode } from 'react';
import { tokens } from '../theme/tokens';
import { useVideoConfig } from 'remotion';

export const SplitScreen = ({
  left,
  right,
  ratio = '1fr 1fr',
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: string;
}) => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return (
    <div
      className="grid h-full min-h-0"
      style={{
        gridTemplateColumns: portrait ? '1fr' : ratio,
        gridTemplateRows: portrait ? ratio : undefined,
        gap: tokens.space.lg,
      }}
    >
      <div className="min-h-0 min-w-0">{left}</div>
      <div className="min-h-0 min-w-0">{right}</div>
    </div>
  );
};
