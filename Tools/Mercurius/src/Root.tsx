import { Composition, Folder } from 'remotion';
import { Episode } from '../episodes/demo/Episode.tsx';
import { episode } from '../episodes/demo/episode';
import { Showcase, showcaseDuration } from './shared/showcase/Showcase';
import { StudyScene } from './playground/StudyScene';
import { studies, studyTiming } from './playground/studies';
import { directions, type DirectionId } from './shared/theme/directions';
import { videoFormat } from './shared/theme/format';
import { curtainIntroSeconds } from './shared/components/CurtainIntro';
import { ClipScene } from './clips/ClipScene';
import { clipSchema, newClip } from './clips/schema';

export const RemotionRoot = () => (
  <>
    <Composition
      id="MercuriusClip"
      component={ClipScene}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={{ clip: newClip('curtain', 'curtain-intro') }}
      calculateMetadata={({ props }) => {
        const clip = clipSchema.parse(props.clip);
        return { durationInFrames: clip.durationFrames, props: { clip } };
      }}
    />
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
      width={videoFormat.width}
      height={videoFormat.height}
      fps={videoFormat.fps}
      durationInFrames={showcaseDuration}
    />
    <Folder name="Playground">
      {(Object.keys(directions) as DirectionId[]).map((direction) => (
        <Folder name={direction} key={direction}>
          {studies.map(({ id }) => (
            <Composition
              key={id}
              id={`Study-${id}-${direction}`}
              component={StudyScene}
              defaultProps={{ study: id, direction }}
              width={videoFormat.width}
              height={videoFormat.height}
              fps={studyTiming.fps}
              durationInFrames={
                id === 'intro'
                  ? Math.round(curtainIntroSeconds * videoFormat.fps)
                  : studyTiming.duration
              }
            />
          ))}
        </Folder>
      ))}
    </Folder>
  </>
);
