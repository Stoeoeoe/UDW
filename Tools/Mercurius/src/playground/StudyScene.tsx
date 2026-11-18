import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Presentation } from '../shared/theme/Presentation';
import { directions, type DirectionId } from '../shared/theme/directions';
import { Callout } from '../shared/components/Callout';
import { CodePanel } from '../shared/components/CodePanel';
import { Node, anchor } from '../shared/diagrams/Node';
import { Connection } from '../shared/diagrams/Connection';
import { findStudy, studyTiming, type StudyId } from './studies';
import { DiagramStudy } from './DiagramStudy';
import {
  RomanOrnament,
  type OrnamentId,
} from '../shared/components/RomanOrnament';

const sample = `public Delivery(
  Inventory items)
{
  this.items = items;
}`;
const caller = { x: 10, y: 60, width: 300, height: 140 };
const inventory = { x: 530, y: 60, width: 300, height: 140 };
export type StudyProps = {
  study: StudyId;
  direction: DirectionId;
  ornament?: OrnamentId;
};
export const StudyScene = ({
  study,
  direction,
  ornament = 'meander',
}: StudyProps) => {
  const entry = findStudy(study);
  if (!entry) throw new Error(`Unknown study '${study}'`);
  const frame = useCurrentFrame();
  const palette = directions[direction].color;
  return (
    <Presentation direction={direction}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <RomanOrnament ornament={ornament} />
        <AbsoluteFill className="video-safe">
          <div className="flex h-full flex-col" style={{ gap: 48 }}>
            <div className="flex items-center gap-6">
              <span
                style={{
                  width: 48,
                  height: 5,
                  background: 'var(--mercurius-accent)',
                }}
              />
              <div className="eyebrow" style={{ fontSize: 28 }}>
                {entry.number} / {entry.name}
              </div>
            </div>
            {study === 'typography' ? (
              <>
                <div
                  style={{
                    fontFamily: 'var(--mercurius-display)',
                    fontSize: 128,
                    lineHeight: 1.1,
                    color: 'var(--mercurius-accent)',
                    marginTop: 60,
                  }}
                >
                  ROEMER
                </div>
                <div style={{ fontSize: 130, lineHeight: 1, marginTop: 60 }}>
                  An errand
                  <br />
                  in the market.
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mercurius-mono)',
                    fontSize: 36,
                    color: 'var(--mercurius-secondary)',
                    marginTop: 50,
                  }}
                >
                  Delivery(Inventory items)
                </div>
                <div
                  className="flex"
                  style={{ height: 250, marginTop: 'auto' }}
                >
                  {(['accent', 'secondary', 'ink', 'highlight'] as const).map(
                    (role) => (
                      <div
                        key={role}
                        style={{ flex: 1, background: palette[role] }}
                      />
                    ),
                  )}
                </div>
              </>
            ) : (
              <>
                <h1
                  style={{
                    fontSize: 120,
                    lineHeight: 0.98,
                    letterSpacing: 'var(--mercurius-tracking)',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {entry.heading}
                </h1>
                <div className="min-h-0 flex-1">
                  {study === 'components' ? (
                    <div
                      className="grid h-full min-h-0 gap-8"
                      style={{ gridTemplateRows: '520px minmax(0,1fr) auto' }}
                    >
                      <div>
                        <CodePanel
                          code={sample}
                          filename="Delivery.cs"
                          language="csharp"
                          revealAt={12}
                          emphasis={frame >= studyTiming.focus ? [1, 4] : []}
                        />
                      </div>
                      <svg
                        viewBox="0 0 840 260"
                        className="h-full w-full"
                        aria-label="Constructor dependency"
                      >
                        <Connection
                          from={anchor(caller, 'right')}
                          to={anchor(inventory, 'left')}
                          label="requires"
                          start={studyTiming.follow}
                        />
                        <Node bounds={caller} title="Delivery" />
                        <Node
                          bounds={inventory}
                          title="Inventory"
                          active={frame >= studyTiming.focus}
                        />
                      </svg>
                      <Callout start={studyTiming.focus}>
                        Inventory is supplied by the caller.
                      </Callout>
                    </div>
                  ) : (
                    <DiagramStudy study={study} />
                  )}
                </div>
              </>
            )}
            <div
              className="font-mono"
              style={{ fontSize: 30, color: 'var(--mercurius-muted)' }}
            >
              {entry.note}
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </Presentation>
  );
};
