import { useCurrentFrame } from 'remotion';
import { CodePanel } from '../../../src/shared/components/CodePanel';
import { Callout } from '../../../src/shared/components/Callout';
import { Connection } from '../../../src/shared/diagrams/Connection';
import { Node, anchor } from '../../../src/shared/diagrams/Node';
import { timeline } from '../timeline';
import { serviceCode } from '../snippets/service';

const delivery = { x: 100, y: 30, width: 580, height: 140 };
const inventory = { x: 100, y: 340, width: 580, height: 140 };
const localCue = (cue: keyof typeof timeline.cues) =>
  timeline.cues[cue] - timeline.scenes.explanation.from;

export const DependencyScene = () => {
  const frame = useCurrentFrame();
  const emphasize = frame >= localCue('emphasizeConstructor');
  return (
    <div
      className="grid h-full min-h-0 gap-6"
      style={{ gridTemplateRows: 'auto 500px minmax(0,1fr) auto' }}
    >
      <div>
        <div className="eyebrow mb-4">01 / The required service</div>
        <h2 style={{ fontSize: 72, lineHeight: 1.12 }}>
          What does Delivery need?
        </h2>
      </div>
      <CodePanel
        code={serviceCode}
        language="csharp"
        filename="Constructor excerpt"
        emphasis={emphasize ? [1, 4] : []}
        revealAt={localCue('revealCode')}
      />
      <div className="panel min-h-0">
        <svg
          viewBox="0 0 780 520"
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
        <span className="text-muted">Setup must wire it correctly.</span>
      </Callout>
    </div>
  );
};
