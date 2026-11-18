import type { EpisodeMetadata } from '../../src/shared/episode';

export const episode = {
  id: 'demo',
  title: 'Make the dependency visible',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 720,
  assets: ['episodes/demo/dependency-study.svg'],
} satisfies EpisodeMetadata;
