import { Composition } from 'remotion';
import { Episode } from '../episodes/demo/Episode.tsx';
import { episode } from '../episodes/demo/episode';
import { Showcase, showcaseDuration } from './shared/showcase/Showcase';

export const RemotionRoot = () => (
  <>
    <Composition
      id={episode.id}
      component={Episode}
      width={episode.width}
      height={episode.height}
      fps={episode.fps}
      durationInFrames={episode.durationInFrames}
    />
    <Composition
      id="Showcase"
      component={Showcase}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={showcaseDuration}
    />
  </>
);
