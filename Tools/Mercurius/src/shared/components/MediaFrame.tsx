import { Audio, Video } from '@remotion/media';
import { Img, staticFile } from 'remotion';

export const MediaFrame = ({
  asset,
  kind = 'image',
  caption,
}: {
  asset: string;
  kind?: 'image' | 'video' | 'audio';
  caption: string;
}) => (
  <figure className="panel flex h-full flex-col">
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-canvas">
      {kind === 'image' ? (
        <Img
          src={staticFile(asset)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : null}
      {kind === 'video' ? (
        <Video
          src={staticFile(asset)}
          objectFit="contain"
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}
      {kind === 'audio' ? (
        <>
          <Audio src={staticFile(asset)} />
          <span className="eyebrow">Audio / {caption}</span>
        </>
      ) : null}
    </div>
    <figcaption
      className="border-t border-border px-8 py-5 font-mono text-muted"
      style={{ fontSize: 20 }}
    >
      {caption}
    </figcaption>
  </figure>
);
