import { describe, expect, it } from 'vitest';
import { exportCutscene, parseCutscene, readCutsceneActions, validateCutscene } from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import bindings from './__fixtures__/unity-bindings-v2.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const actions = readCutsceneActions(bindings);
const map = {
  id: prototype.mapId,
  width: 32,
  height: 24,
  entities: [],
  layers: [],
  spatialPrimitives: { anchors: [{ id: 'bell', position: [168, 104] }] },
} as unknown as GameMap;
const refs = {
  maps: [map],
  entityTypes: [],
  dialogueIds: [],
  resources: { ...bindings.resources, sound: [{ id: 'test:bell', description: 'Bell' }] },
};
const source = (position: unknown = null) =>
  parseCutscene({
    ...prototype,
    onStart: [],
    onComplete: { steps: [], characterPlacements: [] },
    sequence: [
      {
        id: 'sound',
        action: 'audio.playSound',
        arguments: { sound: 'test:bell', position },
      },
    ],
  });

describe('sound actions from the real Unity bindings', () => {
  it('requires an explicit position choice and rejects null for non-nullable parameters', () => {
    const scene = source();
    delete scene.sequence[0].arguments.position;
    expect(
      validateCutscene(scene, actions, refs).some((issue) => issue.path.endsWith('.position')),
    ).toBe(true);
    scene.sequence[0].arguments.position = null;
    const required = actions.map((action) =>
      action.id === 'audio.playSound'
        ? {
            ...action,
            parameters: action.parameters.map((parameter) => ({ ...parameter, nullable: false })),
          }
        : action,
    );
    expect(
      validateCutscene(scene, required, refs).some((issue) => issue.path.endsWith('.position')),
    ).toBe(true);
    scene.sequence[0].arguments.sound = null;
    expect(
      validateCutscene(scene, actions, refs).some(
        (issue) => issue.message === 'Required resource ID',
      ),
    ).toBe(true);
  });
  it.each([null, { x: 168, y: 104 }, { anchor: 'bell' }])(
    'round-trips global and positioned sounds: %j',
    (position) => {
      const scene = source(position);
      expect(validateCutscene(scene, actions, refs)).toEqual([]);
      expect(exportCutscene(scene, actions, refs).sequence).toEqual(scene.sequence);
      const preview = previewCutscene(
        scene,
        map,
        [],
        actions,
        { kind: 'step', id: 'sound' },
        [],
        16,
      );
      expect(preview.notices).toEqual([]);
    },
  );
  it('reports missing sound lists and unresolved sound IDs without replacing arguments', () => {
    const scene = source();
    expect(
      validateCutscene(scene, actions, { ...refs, resources: {} }).some((issue) =>
        issue.message.includes('Missing resource list'),
      ),
    ).toBe(true);
    expect(
      validateCutscene(scene, actions, { ...refs, resources: { sound: [] } }).some((issue) =>
        issue.message.includes('Missing sound resource'),
      ),
    ).toBe(true);
    expect(scene.sequence[0].arguments.sound).toBe('test:bell');
  });
});
