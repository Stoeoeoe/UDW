import { describe, expect, it } from 'vitest';
import {
  completionPlacement,
  completionPosition,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import bindings from './__fixtures__/cutscene-bindings.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap, EntityType } from '../types/schema';

const actions = readCutsceneActions(bindings);
const host = 'cutscene-prototype-host-01';
const npc = { id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType;
const map = {
  id: prototype.mapId,
  width: 32,
  height: 24,
  layers: [],
  entities: [{ id: host, typeId: npc.id, position: [32, 48], properties: {} }],
  spatialPrimitives: { anchors: [{ id: 'prototype-meeting', position: [64, 80], facing: [1, 0] }] },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [npc], dialogueIds: ['prototype_greeting'], tileSize: 16 };
const source = () => parseCutscene(prototype);

describe('completion positions', () => {
  it('preserves anchor endpoints and round-trips pixel/tile-center coordinates without modes', () => {
    const scene = source();
    expect(completionPosition(scene.onComplete.characterPlacements[0])).toEqual({
      anchor: 'prototype-meeting',
    });
    expect(exportCutscene(scene, actions, refs).onComplete.characterPlacements[0]).toEqual({
      character: host,
      anchor: 'prototype-meeting',
    });
    scene.onComplete.characterPlacements = [completionPlacement(host, { x: 168, y: 104 })];
    expect(validateCutscene(scene, actions, refs)).toEqual([]);
    expect(exportCutscene(scene, actions, refs).onComplete.characterPlacements).toEqual([
      { character: host, position: { x: 168, y: 104 } },
    ]);
    expect(parseCutscene(JSON.parse(JSON.stringify(exportCutscene(scene, actions, refs))))).toEqual(
      exportCutscene(scene, actions, refs),
    );
  });
  it.each([
    { character: host, anchor: 'prototype-meeting', position: { x: 1, y: 2 } },
    { character: host, position: { anchor: 'prototype-meeting' } },
    { character: host, position: { x: 1 } },
    { character: host, position: { x: -1, y: 2 } },
    { character: host, position: { x: 1.5, y: 2 } },
    { character: host, position: { x: 1, y: 2, mode: 'pixel' } },
  ])('rejects mixed or malformed endpoint shapes %j', (placement) => {
    expect(() =>
      parseCutscene({ ...prototype, onComplete: { steps: [], characterPlacements: [placement] } }),
    ).toThrow();
  });
  it('flags unresolved anchors and map bounds without replacing the authored value', () => {
    const scene = source();
    scene.onComplete.characterPlacements = [{ character: host, position: { x: 512, y: 104 } }];
    expect(validateCutscene(scene, actions, refs)).toContainEqual(
      expect.objectContaining({ message: 'Final position is outside the selected map' }),
    );
    expect(() => exportCutscene(scene, actions, refs)).toThrow();
    expect(scene.onComplete.characterPlacements[0]).toEqual({
      character: host,
      position: { x: 512, y: 104 },
    });
    scene.onComplete.characterPlacements = [{ character: host, anchor: 'missing' }];
    expect(validateCutscene(scene, actions, refs)).toContainEqual(
      expect.objectContaining({ message: 'Missing anchor missing' }),
    );
  });
  it('previews the same final pixel position after watch or skip and applies anchor facing only for anchors', () => {
    const scene = source();
    scene.onComplete.characterPlacements = [{ character: host, position: { x: 168, y: 104 } }];
    const preview = () =>
      previewCutscene(scene, map, [npc], actions, { kind: 'completion' }, [], 16);
    expect(preview().characters.find((c) => c.id === host)).toMatchObject({
      position: [168, 104],
      facing: null,
    });
    const before = preview();
    scene.sequence = [];
    expect(preview()).toEqual(before);
    scene.onComplete.characterPlacements = [{ character: host, anchor: 'prototype-meeting' }];
    expect(preview().characters.find((c) => c.id === host)).toMatchObject({
      position: [64, 80],
      facing: [1, 0],
    });
  });
});
