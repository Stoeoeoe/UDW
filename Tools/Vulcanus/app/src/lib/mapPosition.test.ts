import { describe, expect, it } from 'vitest';
import { isMapPosition, pickMapPosition, positionPickerMetadata } from './mapPosition';
import { exportCutscene, parseCutscene, readCutsceneActions, validateCutscene } from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import type { CutsceneAction } from '../types/cutscene';
import type { Map as GameMap, EntityType } from '../types/schema';
import bindings from './__fixtures__/cutscene-bindings.json';
import method from './__fixtures__/position-action.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';

const manifest = {
  ...bindings,
  modules: [...bindings.modules, { path: 'PositionFixture', methods: [method] }],
};
const actions = readCutsceneActions(manifest);
const place = actions.find((a) => a.id === 'characters.place')!;
const npc = { id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType;
const host = 'cutscene-prototype-host-01';
const map = {
  id: prototype.mapId,
  width: 32,
  height: 32,
  layers: [],
  entities: [{ id: host, typeId: npc.id, position: [32, 48], properties: {} }],
  spatialPrimitives: {
    anchors: [
      { id: 'prototype-meeting', position: [64, 80], name: 'Meeting' },
      { id: 'player-spot', position: [96, 80], name: 'Player spot' },
    ],
  },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [npc], dialogueIds: ['prototype_greeting'], tileSize: 16 };
const source = () =>
  parseCutscene({
    ...prototype,
    onStart: [
      {
        id: 'place-player',
        action: place.id,
        arguments: { character: 'player', position: { x: 168, y: 104 } },
      },
    ],
  });

describe('declarative map position parameters', () => {
  it('snaps to tile centers or individual pixels using the project tile size', () => {
    expect(pickMapPosition(10.7, 6.7, 16, 'tile')).toEqual({ x: 168, y: 104 });
    expect(pickMapPosition(10.7, 6.7, 16, 'pixel')).toEqual({ x: 171, y: 107 });
    expect(pickMapPosition(2.1, 3.9, 32, 'tile')).toEqual({ x: 80, y: 112 });
  });
  it('preserves structured pixel coordinates in source and deterministic export', () => {
    const scene = source();
    expect(validateCutscene(scene, actions, refs)).toEqual([]);
    expect(exportCutscene(scene, actions, refs).onStart![0].arguments.position).toEqual({
      x: 168,
      y: 104,
    });
    expect(parseCutscene(JSON.parse(JSON.stringify(exportCutscene(scene, actions, refs))))).toEqual(
      exportCutscene(scene, actions, refs),
    );
  });
  it('rejects unsupported hints and out-of-map values instead of guessing or clamping authored coordinates', () => {
    expect(positionPickerMetadata({ ...method.parameters[1], origin: 'bottomLeft' })).toBeNull();
    expect(
      positionPickerMetadata({ ...method.parameters[1], placementModes: ['tile', 'tile'] }),
    ).toBeNull();
    const scene = source();
    scene.onStart![0].arguments.position = { x: 512, y: 104 };
    expect(validateCutscene(scene, actions, refs).some((d) => d.message.includes('outside'))).toBe(
      true,
    );
    expect(scene.onStart![0].arguments.position).toEqual({ x: 512, y: 104 });
  });
  it.each([
    { x: -1, y: 2 },
    { x: 1.5, y: 2 },
    { x: NaN, y: 2 },
    { x: 1, y: Infinity },
    { x: 1 },
    { x: 1, y: 2, z: 3 },
  ])('rejects invalid position shapes: %j', (value) => expect(isMapPosition(value)).toBe(false));
  it('establishes player position through setup, allowing subsequent facing without a walking arrow', () => {
    const scene = source();
    const preview = previewCutscene(
      scene,
      map,
      [npc],
      actions,
      { kind: 'step', id: 'greet' },
      refs.dialogueIds,
      16,
    );
    expect(preview.characters.find((a) => a.id === 'player')!.position).toEqual([168, 104]);
    expect(preview.facings).toContainEqual({
      stepId: 'greet',
      characterId: host,
      targetId: 'player',
    });
    expect(
      preview.segments.filter((s) => s.kind === 'move').every((s) => s.stepId !== 'place-player'),
    ).toBe(true);
    expect(preview.notices).toEqual([]);
    expect(preview.placements).toContainEqual({
      stepId: 'place-player',
      characterId: 'player',
      position: [168, 104],
    });
  });
  it('uses parameter mappings and preserves an already known facing when placing in completion', () => {
    const custom: CutsceneAction = {
      ...place,
      id: 'custom.relocate',
      parameters: [
        { ...place.parameters[1], name: 'where' },
        { ...place.parameters[0], name: 'who' },
      ],
      preview: {
        version: 2,
        spatialState: 'described',
        effects: [
          {
            kind: 'setCharacterPosition',
            characterParameter: 'who',
            positionParameter: 'where',
            facing: 'preserve',
          },
        ],
      },
    };
    const scene = source();
    scene.onComplete.steps = [
      { id: 'face', action: 'characters.face', arguments: { character: host, target: 'player' } },
      { id: 'place', action: custom.id, arguments: { who: host, where: { x: 200, y: 120 } } },
    ];
    scene.onComplete.characterPlacements.push({ character: 'player', anchor: 'player-spot' });
    const before = previewCutscene(
      scene,
      map,
      [npc],
      [...actions, custom],
      { kind: 'step', id: 'face' },
      refs.dialogueIds,
    );
    const after = previewCutscene(
      scene,
      map,
      [npc],
      [...actions, custom],
      { kind: 'completion' },
      refs.dialogueIds,
    );
    expect(before.characters.find((a) => a.id === host)!.facing).toEqual([1, 0]);
    expect(after.characters.find((a) => a.id === host)!.facing).toEqual(
      before.characters.find((a) => a.id === host)!.facing,
    );
    expect(after.characters.find((a) => a.id === host)!.position).toEqual([200, 120]);
  });
});
