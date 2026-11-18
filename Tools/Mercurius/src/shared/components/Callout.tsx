import { Paper } from '@mantine/core';
import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { entrance } from '../theme/motion';
import { tokens } from '../theme/tokens';

export const Callout = ({
  children,
  start = 0,
}: {
  children: ReactNode;
  start?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Paper
      className="flex items-center gap-6 border border-border bg-raised p-8 text-ink"
      style={{
        ...entrance(frame, fps, start),
        borderRadius: 'var(--mercurius-radius)',
      }}
    >
      <Lightbulb
        size={36}
        color="var(--mercurius-accent)"
        style={{ flexShrink: 0 }}
      />
      <div style={{ fontSize: tokens.type.body, lineHeight: 1.45 }}>
        {children}
      </div>
    </Paper>
  );
};
