import { interpolate, spring } from 'remotion';

export const motion = {
  entranceFrames: 24,
  staggerFrames: 6,
  transitionFrames: 18,
  spring: { damping: 200, stiffness: 120, mass: 1 },
} as const;

export const progress = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const entrance = (frame: number, fps: number, start = 0) => {
  const value = spring({ frame: frame - start, fps, config: motion.spring });
  return { opacity: value, transform: `translateY(${(1 - value) * 24}px)` };
};
