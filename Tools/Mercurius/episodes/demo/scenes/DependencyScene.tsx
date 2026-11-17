import { useCurrentFrame } from 'remotion';
import { CodePanel } from '../../../src/shared/components/CodePanel';
import { Callout } from '../../../src/shared/components/Callout';
import { Connection } from '../../../src/shared/diagrams/Connection';
import { Node, anchor } from '../../../src/shared/diagrams/Node';
import { SplitScreen } from '../../../src/shared/layouts/SplitScreen';
import { timeline } from '../timeline';
import { serviceCode } from '../snippets/service';

const delivery = { x: 60, y: 80, width: 290, height: 120 };
const inventory = { x: 420, y: 320, width: 290, height: 120 };
const localCue = (cue: keyof typeof timeline.cues) =>
  timeline.cues[cue] - timeline.scenes.explanation.from;

export const DependencyScene = () => {
  const frame = useCurrentFrame();
  const emphasize = frame >= localCue('emphasizeConstructor');
  return (
    <div className="flex h-full flex-col gap-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow mb-4">
            01 / Make the relationship explicit
          </div>
          <h2 className="text-6xl font-bold tracking-tight">
            What does Delivery need?
          </h2>
        </div>
        <span className="font-mono text-xl text-muted">Illustrative C#</span>
      </div>
      <div className="min-h-0 flex-1">
        <SplitScreen
          ratio="1.08fr 1fr"
          left={
            <CodePanel
              code={serviceCode}
              language="csharp"
              filename="Delivery.cs"
              emphasis={emphasize ? [5, 7] : []}
              revealAt={localCue('revealCode')}
            />
          }
          right={
            <div className="flex h-full flex-col gap-6">
              <div className="panel min-h-0 flex-1">
                <svg
                  viewBox="0 0 780 510"
                  className="h-full w-full"
                  aria-label="Delivery requires Inventory through its constructor"
                >
                  <Connection
                    from={anchor(delivery, 'bottom')}
                    to={anchor(inventory, 'top')}
                    label="requires"
                    start={localCue('revealDependency')}
                  />
                  <Node
                    bounds={delivery}
                    title="Delivery"
                    subtitle="caller"
                    active
                    start={localCue('revealCode')}
                  />
                  <Node
                    bounds={inventory}
                    title="Inventory"
                    subtitle="required dependency"
                    active={emphasize}
                    start={localCue('revealDependency')}
                  />
                </svg>
              </div>
              <Callout start={localCue('showTradeoff')}>
                The caller supplies Inventory.
                <br />
                <span className="text-muted">
                  The cost: setup must wire it correctly.
                </span>
              </Callout>
            </div>
          }
        />
      </div>
    </div>
  );
};
