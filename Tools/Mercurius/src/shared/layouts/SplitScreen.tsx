import type { ReactNode } from 'react';
import { tokens } from '../theme/tokens';

export const SplitScreen = ({
  left,
  right,
  ratio = '1fr 1fr',
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: string;
}) => (
  <div
    className="grid h-full min-h-0"
    style={{ gridTemplateColumns: ratio, gap: tokens.space.lg }}
  >
    <div className="min-h-0 min-w-0">{left}</div>
    <div className="min-h-0 min-w-0">{right}</div>
  </div>
);
