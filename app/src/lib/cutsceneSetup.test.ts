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
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';

const actions = readCutsceneActions(bindings);
const face = actions.find((a) => a.id === 'actors.face')!;
const npc = { id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType;
const map = {
  id: prototype.mapId,
  layers: [],
  entities: [
    { id: 'cutscene-prototype-host-01', typeId: npc.id, position: [32, 48], properties: {} },
  ],
  spatialPrimitives: {
    anchors: [
      { id: 'prototype-meeting', name: 'Meeting', position: [64, 80] },
      { id: 'player-start', name: 'Player start', position: [96, 80] },
    ],
  },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [npc], dialogueIds: ['prototype_greeting'] };
const source = () =>
  parseCutscene({
    ...prototype,
    onStart: [
      {
        id: 'prepare-facing',
        action: face.id,
        arguments: { actor: 'cutscene-prototype-host-01', target: 'player' },
      },
    ],
  });

describe('cutscene setup phase', () => {
  it('offers only explicitly permitted immediate cutscene actions', () => {
    expect(actionsForCutscenePhase(actions, 'setup').map((a) => a.id)).toEqual(['actors.face']);
    expect(actionsForCutscenePhase([{ ...face, execution: 'awaitable' }], 'setup')).toEqual([]);
    expect(actionsForCutscenePhase([{ ...face, contexts: ['npcRoutine'] }], 'setup')).toEqual([]);
    expect(actionsForCutscenePhase([{ ...face, phases: undefined }], 'setup')).toEqual([]);
    expect(actionsForCutscenePhase([{ ...face, phases: ['setup'] }], 'sequence')).toEqual([]);
  });
  it('round-trips optional setup steps and enforces IDs across both phases', () => {
    expect(parseCutscene(prototype).onStart).toBeUndefined();
    const scene = source();
    expect(validateCutscene(scene, actions, refs)).toEqual([]);
    expect(exportCutscene(scene, actions, refs).onStart).toEqual(scene.onStart);
    scene.onStart![0].id = scene.sequence[0].id;
    expect(() => parseCutscene(scene)).toThrow('duplicate step ID');
    expect(validateCutscene(scene, actions, refs)).toContainEqual(
      expect.objectContaining({
        phase: 'sequence',
        stepId: scene.sequence[0].id,
        message: 'Duplicate step ID',
      }),
    );
  });
  it('rejects ineligible or malformed setup rather than replacing or executing it', () => {
    const scene = source();
    scene.onStart = [{ ...scene.sequence[0], id: 'invalid-walk' }];
    expect(() => exportCutscene(scene, actions, refs)).toThrow('setup invalid-walk');
    expect(validateCutscene(scene, actions, refs)).toContainEqual(
      expect.objectContaining({
        phase: 'setup',
        stepId: 'invalid-walk',
        message: 'Action actors.moveTo is not allowed in setup',
      }),
    );
    expect(() => parseCutscene({ ...scene, onStart: 'raw Lua' })).toThrow();
  });
  it('validates resources and arguments for setup using the same manifest rules', () => {
    const custom: CutsceneAction = {
      ...face,
      id: 'test.resourceSetup',
      parameters: [{ name: 'asset', type: 'string', resourceType: 'customCatalog' }],
    };
    const scene = source();
    scene.onStart = [
      { id: 'resource-setup', action: custom.id, arguments: { asset: 'base:asset' } },
    ];
    expect(
      validateCutscene(scene, [...actions, custom], refs).some(
        (d) => d.phase === 'setup' && d.message.includes('Missing resource list'),
      ),
    ).toBe(true);
    expect(
      validateCutscene(scene, [...actions, custom], {
        ...refs,
        resources: { customCatalog: [{ id: 'base:asset', description: 'Asset' }] },
      }),
    ).toEqual([]);
  });
  it('previews setup first, establishes player context, and does not invent walking during setup', () => {
    // Synthetic binding fixture: tests metadata consumption, not an additional shipped API.
    const place: CutsceneAction = {
      ...actions.find((a) => a.id === 'actors.moveTo')!,
      id: 'test.immediatePlacement',
      execution: 'immediate',
      phases: ['setup'],
    };
    const scene = source();
    scene.onStart = [
      {
        id: 'place-player',
        action: place.id,
        arguments: { actor: 'player', destination: 'player-start' },
      },
      ...scene.onStart!,
    ];
    const api = [...actions, place];
    const initial = previewCutscene(scene, map, [npc], api, { kind: 'scene' }, refs.dialogueIds);
    expect(initial.actors.find((a) => a.id === 'player')!.position).toBeNull();
    const prepared = previewCutscene(scene, map, [npc], api, { kind: 'setup' }, refs.dialogueIds);
    expect(prepared.actors.find((a) => a.id === 'player')!.position).toEqual([96, 80]);
    expect(prepared.segments.every((s) => s.kind !== 'move')).toBe(true);
    const selected = previewCutscene(
      scene,
      map,
      [npc],
      api,
      { kind: 'step', id: 'greet' },
      refs.dialogueIds,
    );
    expect(selected.actors.find((a) => a.id === 'cutscene-prototype-host-01')!.facing).toEqual([
      1, 0,
    ]);
    expect(selected.notices).toEqual([]);
    const completion = previewCutscene(
      scene,
      map,
      [npc],
      api,
      { kind: 'completion' },
      refs.dialogueIds,
    );
    expect(completion.actors.find((a) => a.id === 'player')!.position).toBeNull();
    expect(scene.onStart[0].id).toBe('place-player');
  });
  it('propagates unknown setup effects into subsequent sequence previews', () => {
    const opaque: CutsceneAction = {
      ...face,
      id: 'test.opaqueSetup',
      preview: { version: 1, spatialState: 'unknown', effects: [] },
    };
    const scene = source();
    scene.onStart = [
      {
        id: 'opaque',
        action: opaque.id,
        arguments: { actor: 'player', target: 'cutscene-prototype-host-01' },
      },
    ];
    const result = previewCutscene(
      scene,
      map,
      [npc],
      [...actions, opaque],
      { kind: 'step', id: 'approach' },
      refs.dialogueIds,
    );
    expect(
      result.notices.some(
        (n) => n.stepId === 'opaque' && n.message.includes('Spatial state is unknown'),
      ),
    ).toBe(true);
    expect(result.segments.filter((s) => s.kind === 'move')).toEqual([]);
    expect(result.actors.find((a) => a.id === 'cutscene-prototype-host-01')!.position).toEqual([
      64, 80,
    ]);
  });
});
