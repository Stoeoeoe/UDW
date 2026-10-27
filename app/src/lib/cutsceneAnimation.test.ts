import { describe, expect, it } from 'vitest';
import {
  createCutsceneStep,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import bindings from './__fixtures__/unity-bindings-v2.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const actions = readCutsceneActions(bindings);
const action = actions.find((action) => action.id === 'characters.playAnimation')!;
const refs = {
  maps: [{ id: prototype.mapId, entities: [], layers: [] } as unknown as GameMap],
  entityTypes: [],
  dialogueIds: [],
  resources: bindings.resources,
};
const source = (holdLastFrame: unknown = undefined) =>
  parseCutscene({
    ...prototype,
    onStart: [],
    onComplete: { steps: [], characterPlacements: [] },
    sequence: [
      {
        id: 'death',
        action: action.id,
        arguments: {
          character: 'player',
          animation: 'base:pass-out',
          ...(holdLastFrame !== undefined ? { holdLastFrame } : {}),
        },
      },
    ],
  });

describe('held animation boolean from the real Unity bindings', () => {
  it.each([true, false, undefined])(
    'round-trips %s and preserves existing steps without the flag',
    (hold) => {
      const scene = source(hold);
      expect(validateCutscene(scene, actions, refs)).toEqual([]);
      expect(exportCutscene(scene, actions, refs).sequence).toEqual(scene.sequence);
    },
  );
  it('creates new steps with hold disabled using the exported default', () => {
    expect(createCutsceneStep(action).arguments.holdLastFrame).toBe(false);
    expect(action.parameters.find((parameter) => parameter.name === 'holdLastFrame')).toMatchObject(
      { type: 'boolean', optional: true, defaultValue: false },
    );
  });
  it.each(['true', 'false', 0, 1, null])(
    'rejects non-boolean flags without coercion: %j',
    (hold) => {
      const scene = source(hold);
      expect(
        validateCutscene(scene, actions, refs).some(
          (issue) => issue.message === 'Expected a boolean argument',
        ),
      ).toBe(true);
      expect(() => exportCutscene(scene, actions, refs)).toThrow();
    },
  );
});
