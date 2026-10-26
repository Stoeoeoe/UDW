import { describe, expect, it } from 'vitest';
import {
  actionsForCutscenePhase,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import type { CutsceneAction } from '../types/cutscene';
import type { Map as GameMap, EntityType } from '../types/schema';
import bindings from './__fixtures__/cutscene-bindings.json';
import legacy from './__fixtures__/prototype.runtime.cutscene.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';

const actions = readCutsceneActions(bindings);
const npc = { id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType;
const host = 'cutscene-prototype-host-01';
const map = {
  id: prototype.mapId,
  layers: [],
  entities: [
    { id: host, typeId: npc.id, position: [32, 48], properties: {} },
    { id: 'guest', typeId: npc.id, position: [96, 80], properties: {} },
  ],
  spatialPrimitives: {
    anchors: [{ id: 'prototype-meeting', name: 'Meeting', position: [64, 80] }],
  },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [npc], dialogueIds: ['prototype_greeting'] };
const source = () =>
  parseCutscene({
    ...prototype,
    onComplete: {
      ...prototype.onComplete,
      steps: [
        { id: 'final-face', action: 'actors.face', arguments: { actor: host, target: 'guest' } },
      ],
    },
  });

describe('typed completion v2 contract', () => {
  it('restricts completion to explicitly permitted immediate actions', () => {
    expect(actionsForCutscenePhase(actions, 'completion').map((a) => a.id)).toEqual([
      'actors.face',
    ]);
    expect(
      actionsForCutscenePhase(
        [{ ...actions[0], phases: ['completion'], execution: 'awaitable' }],
        'completion',
      ),
    ).toEqual([]);
    const scene = source();
    scene.onComplete.steps = [{ id: 'bad', action: 'cutscene.wait', arguments: { seconds: 0 } }];
    expect(() => exportCutscene(scene, actions, refs)).toThrow(
      'completion bad: Action cutscene.wait is not allowed in completion',
    );
  });
  it('exports typed steps and placements without a raw Lua field', () => {
    const scene = source(),
      exported = exportCutscene(scene, actions, refs);
    expect(exported.formatVersion).toBe(2);
    expect(exported.onComplete).toEqual(scene.onComplete);
    expect(Object.keys(exported.onComplete).sort()).toEqual(['actorPlacements', 'steps']);
    expect(parseCutscene(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
    expect(() =>
      parseCutscene({ ...exported, onComplete: { ...exported.onComplete, actions: '' } }),
    ).toThrow();
  });
  it('requires stable unique IDs across all three phases', () => {
    const scene = source();
    scene.onStart = [{ ...scene.onComplete.steps[0], id: 'setup' }];
    scene.onComplete.steps[0].id = 'setup';
    expect(() => parseCutscene(scene)).toThrow('duplicate step ID');
    expect(validateCutscene(scene, actions, refs)).toContainEqual(
      expect.objectContaining({
        stepId: 'setup',
        phase: 'completion',
        message: 'Duplicate step ID',
      }),
    );
  });
  it('validates resource IDs in completion with the same generic rules', () => {
    const custom: CutsceneAction = {
      ...actions[0],
      id: 'test.resourceCompletion',
      phases: ['completion'],
      parameters: [{ name: 'asset', type: 'string', resourceType: 'custom' }],
    };
    const scene = source();
    scene.onComplete.steps = [
      { id: 'finish-resource', action: custom.id, arguments: { asset: 'base:asset' } },
    ];
    expect(validateCutscene(scene, [...actions, custom], refs)).toContainEqual(
      expect.objectContaining({
        phase: 'completion',
        stepId: 'finish-resource',
        message: 'Missing resource list "custom" in Lua manifest',
      }),
    );
    expect(
      validateCutscene(scene, [...actions, custom], {
        ...refs,
        resources: { custom: [{ id: 'base:asset', description: 'Asset' }] },
      }),
    ).toEqual([]);
  });
  it('applies the placement plan before completion effects, independently of sequence or setup', () => {
    const scene = source();
    const preview = () =>
      previewCutscene(scene, map, [npc], actions, { kind: 'completion' }, refs.dialogueIds);
    const watched = preview();
    const actor = watched.actors.find((a) => a.id === host)!;
    expect(actor.position).toEqual([64, 80]);
    expect(actor.facing).toEqual([1, 0]);
    scene.sequence = [
      {
        id: 'unplayed',
        action: 'actors.moveTo',
        arguments: { actor: 'guest', destination: 'prototype-meeting' },
      },
    ];
    scene.onStart = [
      { id: 'unused-setup', action: 'actors.face', arguments: { actor: 'guest', target: host } },
    ];
    expect(preview()).toEqual(watched); // Skipping uses the same explicit terminal plan.
  });
  it('previews completion in authored order and stops at the selected step', () => {
    const scene = source();
    scene.onComplete.steps.push({
      id: 'face-back',
      action: 'actors.face',
      arguments: { actor: 'guest', target: host },
    });
    const first = previewCutscene(
      scene,
      map,
      [npc],
      actions,
      { kind: 'step', id: 'final-face' },
      refs.dialogueIds,
    );
    expect(first.actors.find((a) => a.id === 'guest')!.facing).toBeNull();
    const all = previewCutscene(
      scene,
      map,
      [npc],
      actions,
      { kind: 'completion' },
      refs.dialogueIds,
    );
    expect(all.actors.find((a) => a.id === 'guest')!.facing).toEqual([-1, 0]);
  });
  it('upgrades v1 with empty Lua losslessly without mutating the original source', () => {
    const before = JSON.stringify(legacy),
      result = parseCutscene(legacy);
    expect(result.formatVersion).toBe(2);
    expect(result.sequence).toEqual(legacy.sequence);
    expect(result.onComplete).toEqual({
      steps: [],
      actorPlacements: legacy.onComplete.actorPlacements,
    });
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('refuses to silently discard or translate authored v1 Lua', () => {
    const raw = {
      ...legacy,
      onComplete: { ...legacy.onComplete, actions: 'GameState.Story.SetFlag("important")' },
    };
    const before = JSON.stringify(raw);
    expect(() => parseCutscene(raw)).toThrow('requires manual conversion');
    expect(JSON.stringify(raw)).toBe(before);
  });
});
