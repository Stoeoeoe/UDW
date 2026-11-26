import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Presentation } from '../shared/theme/Presentation';
import { RomanOrnament } from '../shared/components/RomanOrnament';
import { CurtainIntro } from '../shared/components/CurtainIntro';
import { CodePanel } from '../shared/components/CodePanel';
import { Node, anchor } from '../shared/diagrams/Node';
import { Connection } from '../shared/diagrams/Connection';
import type { ClipSpec } from './schema';

export const ClipScene = ({ clip }: { clip: ClipSpec }) => {
  const frame = useCurrentFrame();
  const from = { x: 100, y: 130, width: 640, height: 160 };
  const to = { x: 100, y: 640, width: 640, height: 160 };
  return (
    <Presentation direction={clip.direction}>
      <RomanOrnament ornament={clip.ornament} />
      {clip.scene === 'curtain' ? (
        <>
          <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
            <div
              style={{
                fontFamily: 'var(--mercurius-display)',
                fontSize: 132,
                color: 'var(--mercurius-accent)',
                letterSpacing: '0.025em',
              }}
            >
              {clip.wordmark}
            </div>
          </AbsoluteFill>
          <CurtainIntro
            holdFrames={clip.holdFrames}
            openingFrames={clip.openingFrames}
            accent={clip.accent}
          />
        </>
      ) : (
        <AbsoluteFill
          className="video-safe"
          style={{ display: 'flex', flexDirection: 'column', gap: 70 }}
        >
          {clip.heading ? (
            <h1
              style={{
                fontSize: 100,
                lineHeight: 1.05,
                whiteSpace: 'pre-line',
                fontWeight: 400,
              }}
            >
              {clip.heading}
            </h1>
          ) : null}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              alignItems: 'center',
            }}
          >
            {clip.scene === 'code' ? (
              <div style={{ height: '100%', maxHeight: 1100 }}>
                <CodePanel
                  key={`${clip.code}:${clip.filename}:${clip.language}`}
                  code={clip.code}
                  filename={clip.filename}
                  language={clip.language}
                  revealAt={clip.revealAt}
                  emphasis={frame >= clip.focusAt ? clip.emphasis : []}
                />
              </div>
            ) : (
              <svg
                viewBox="0 0 840 1000"
                style={{ width: '100%' }}
                aria-label={`${clip.from} ${clip.connection} ${clip.to}`}
              >
                <Connection
                  from={anchor(from, 'bottom')}
                  to={anchor(to, 'top')}
                  label={clip.connection}
                  start={clip.revealAt}
                />
                <Node
                  bounds={from}
                  title={clip.from}
                  active={frame < clip.focusAt}
                />
                <Node
                  bounds={to}
                  title={clip.to}
                  active={frame >= clip.focusAt}
                />
              </svg>
            )}
          </div>
        </AbsoluteFill>
      )}
    </Presentation>
  );
};
