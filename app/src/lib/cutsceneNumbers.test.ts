import { describe, expect, it } from 'vitest';
import { exportCutscene, parseCutscene, readCutsceneActions, validateCutscene } from './cutscenes';
import manifest from './__fixtures__/cutscene-bindings.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const actions = readCutsceneActions(manifest);
const refs = {
  maps: [{ id: prototype.mapId, entities: [], layers: [] } as unknown as GameMap],
  entityTypes: [],
  dialogueIds: [],
};
const source = (seconds: unknown) => ({
  ...prototype,
  onComplete: { steps: [], characterPlacements: [] },
  sequence: [{ id: 'pause', action: 'cutscene.wait', arguments: { seconds } }],
});

describe('numeric cutscene arguments', () => {
  it.each([0, 0.5, 2.75, 1e-7])('round-trips %s as a JSON number', (seconds) => {
    const parsed = parseCutscene(source(seconds));
    expect(validateCutscene(parsed, actions, refs)).toEqual([]);
    const exported = exportCutscene(parsed, actions, refs);
    expect(JSON.parse(JSON.stringify(exported)).sequence[0].arguments.seconds).toBe(seconds);
  });
  it.each(['0.5', 'not a number', '', null, true])(
    'rejects values that do not match a numeric parameter: %j',
    (seconds) => {
      expect(validateCutscene(source(seconds), actions, refs).length).toBeGreaterThan(0);
      expect(() => exportCutscene(source(seconds) as never, actions, refs)).toThrow();
    },
  );
  it.each([NaN, Infinity, -Infinity, {}, []])('rejects invalid numeric data: %j', (seconds) => {
    expect(() => parseCutscene(source(seconds))).toThrow();
  });
  it('validates each argument against its declared type without converting references', () => {
    const raw = {
      ...prototype,
      sequence: [
        {
          id: 'move',
          action: 'characters.moveTo',
          arguments: { character: 5, destination: 'anchor' },
        },
      ],
    };
    expect(
      validateCutscene(raw, actions, refs).some((d) => d.message === 'Expected a string argument'),
    ).toBe(true);
  });
});
