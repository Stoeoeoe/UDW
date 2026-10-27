import { describe, expect, it } from 'vitest';
import { exportCutscene, parseCutscene, readCutsceneActions } from './cutscenes';
import { DEFAULT_CUTSCENE_TRANSITION } from '../types/cutscene';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import manifest from './__fixtures__/cutscene-bindings.json';

describe('cutscene transitions', () => {
  it('defaults omitted metadata to the enabled presentation without rewriting old source', () => {
    const scene = parseCutscene(prototype);
    expect(scene.transition ?? DEFAULT_CUTSCENE_TRANSITION).toEqual({
      enabled: true,
    });
  });

  it.each([true, false])('round trips selection with enabled=%s', (enabled) => {
    const scene = parseCutscene({
      ...prototype,
      onComplete: { steps: [], characterPlacements: [] },
      sequence: [{ id: 'pause', action: 'cutscene.wait', arguments: { seconds: 1 } }],
      transition: { enabled },
    });
    const actions = readCutsceneActions(manifest);
    const exported = exportCutscene(scene, actions, {
      maps: [{ id: scene.mapId, width: 32, height: 32, entities: [], layers: [] } as never],
      entityTypes: [],
      dialogueIds: [],
    });
    expect(parseCutscene(JSON.parse(JSON.stringify(scene))).transition).toEqual(scene.transition);
    expect(exported.transition).toEqual(scene.transition);
  });

  it.each([
    {},
    { enabled: 'yes' },
    { enabled: true, fadeSeconds: 0.3 },
    { enabled: true, holdSeconds: 1.7 },
    { enabled: true, revealSeconds: 0.12 },
  ])('rejects malformed transition metadata %j', (transition) => {
    expect(() => parseCutscene({ ...prototype, transition })).toThrow();
  });
});
