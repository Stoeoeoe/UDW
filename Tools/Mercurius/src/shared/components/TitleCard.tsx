import { useCurrentFrame, useVideoConfig } from 'remotion';
import { entrance, motion } from '../theme/motion';
import { tokens } from '../theme/tokens';

export const TitleCard = ({
  title,
  subtitle,
  kicker = 'Roemer / Technical notes',
}: {
  title: string;
  subtitle: string;
  kicker?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="flex h-full flex-col justify-center gap-10">
      <div className="eyebrow" style={entrance(frame, fps)}>
        {kicker}
      </div>
      <h1
        style={{
          ...entrance(frame, fps, motion.staggerFrames),
          fontSize: tokens.type.title,
          fontWeight: 400,
          lineHeight: 1.04,
          letterSpacing: 'var(--mercurius-tracking)',
          maxWidth: 1500,
        }}
      >
        {title}
      </h1>
      <p
        className="text-muted"
        style={{
          ...entrance(frame, fps, motion.staggerFrames * 2),
          fontSize: tokens.type.body,
          maxWidth: 1100,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
};
