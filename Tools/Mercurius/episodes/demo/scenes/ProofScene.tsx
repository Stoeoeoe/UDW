import { Callout } from '../../../src/shared/components/Callout';
import { MediaFrame } from '../../../src/shared/components/MediaFrame';
import { SplitScreen } from '../../../src/shared/layouts/SplitScreen';
import { episode } from '../episode';

export const ProofScene = () => (
  <div className="flex h-full flex-col gap-10">
    <div>
      <div className="eyebrow mb-4">02 / The review question</div>
      <h2 className="text-7xl tracking-tight">Can you see the contract?</h2>
    </div>
    <div className="min-h-0 flex-1">
      <SplitScreen
        left={
          <MediaFrame
            asset={episode.assets[0]}
            caption="Original local illustration"
          />
        }
        right={
          <div className="flex h-full flex-col justify-center gap-10">
            <p className="text-5xl leading-tight">
              Follow the dependency.
              <br />
              Then inspect the setup.
            </p>
            <Callout>
              Explicit wiring is visible work.
              <br />
              <span className="text-muted">
                It does not prove the implementation is correct.
              </span>
            </Callout>
            <p className="font-mono text-3xl text-muted">
              Component study. No claims about shipped Roemer code.
            </p>
          </div>
        }
      />
    </div>
  </div>
);
