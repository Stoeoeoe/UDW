import { describe, expect, it } from 'vitest';
import {
  parseCutscene,
  exportCutscene,
  readCutsceneActions,
  validateCutscene,
  actionsForCutscenePhase,
} from './cutscenes';
import { previewCutscene, readActionPreview } from './cutscenePreview';
import { pathPickerMetadata, mapPathSchema } from './mapPosition';
import bindings from './__fixtures__/cutscene-bindings.json';
import method from './__fixtures__/walk-path-action.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap, EntityType } from '../types/schema';
const actions = readCutsceneActions({
  ...bindings,
  modules: [...bindings.modules, { path: 'GenericPathFixture', methods: [method] }],
});
const walk = actions.find((a) => a.id === method.action.id)!;
const host = 'cutscene-prototype-host-01';
const npc = { id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType;
const map = {
  id: prototype.mapId,
  width: 32,
  height: 24,
  layers: [],
  entities: [{ id: host, typeId: npc.id, position: [32, 48], properties: {} }],
  spatialPrimitives: { anchors: [{ id: 'prototype-meeting', position: [96, 80] }] },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [npc], dialogueIds: ['prototype_greeting'], tileSize: 16 };
const source = () =>
  parseCutscene({
    ...prototype,
    onComplete: { characterPlacements: [], steps: [] },
    sequence: [
      {
        id: 'walk',
        action: walk.id,
        arguments: {
          character: host,
          path: [{ x: 64, y: 48 }, { anchor: 'prototype-meeting' }, { x: 128, y: 80 }],
        },
      },
    ],
  });
const preview = (s = source()) =>
  previewCutscene(s, map, [npc], actions, { kind: 'step', id: 'walk' }, [], 16);
describe('metadata-driven cutscene paths', () => {
  it('round-trips ordered mixed waypoints without modes or action-specific parsing', () => {
    const s = source();
    expect(validateCutscene(s, actions, refs)).toEqual([]);
    expect(exportCutscene(s, actions, refs).sequence).toEqual(s.sequence);
    expect(parseCutscene(JSON.parse(JSON.stringify(exportCutscene(s, actions, refs))))).toEqual(
      exportCutscene(s, actions, refs),
    );
    expect(actionsForCutscenePhase(actions, 'setup')).not.toContain(walk);
    expect(actionsForCutscenePhase(actions, 'completion')).not.toContain(walk);
  });
  it.each([
    [],
    [{ x: -1, y: 2 }],
    [{ x: 1.5, y: 2 }],
    [{ anchor: 'prototype-meeting', x: 1, y: 2 }],
    [{ x: 1, y: 2, mode: 'pixel' }],
    [''],
  ])('rejects incomplete or invalid path shape %j', (path) => {
    expect(mapPathSchema.safeParse(path).success).toBe(false);
    const s = source();
    s.sequence[0].arguments.path = path as never;
    expect(validateCutscene(s, actions, refs).length).toBeGreaterThan(0);
    expect(() => exportCutscene(s, actions, refs)).toThrow();
  });
  it('identifies out-of-bounds and unresolved waypoint IDs without replacing them', () => {
    const s = source();
    s.sequence[0].arguments.path = [{ x: 512, y: 0 }, { anchor: 'missing' }];
    expect(validateCutscene(s, actions, refs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Waypoint 1: position is outside the selected map' }),
        expect.objectContaining({ message: 'Waypoint 2: missing anchor missing' }),
      ]),
    );
    expect(s.sequence[0].arguments.path).toEqual([{ x: 512, y: 0 }, { anchor: 'missing' }]);
  });
  it('shows each leg with ordered numbers and the final position, without guessing facing', () => {
    const p = preview();
    expect(p.segments.map((s) => [s.from, s.to, s.waypoint])).toEqual([
      [[32, 48], [64, 48], 1],
      [[64, 48], [96, 80], 2],
      [[96, 80], [128, 80], 3],
    ]);
    expect(p.characters.find((c) => c.id === host)).toMatchObject({
      position: [128, 80],
      facing: null,
    });
    expect(p.placements.map((p) => p.waypoint)).toEqual([1, 2, 3]);
  });
  it('does not fabricate an origin for the runtime player or bridge an unresolved waypoint', () => {
    const s = source();
    s.sequence[0].arguments.character = 'player';
    expect(preview(s).segments.map((s) => s.waypoint)).toEqual([2, 3]);
    s.sequence[0].arguments.path = [{ x: 64, y: 48 }, { anchor: 'gone' }, { x: 128, y: 80 }];
    expect(preview(s).segments).toEqual([]);
    expect(preview(s).notices.some((n) => n.message.includes('Waypoint 2'))).toBe(true);
  });
  it('folds renamed mappings and respects unknown spatial state and completion restoration', () => {
    const renamed = {
      ...walk,
      id: 'custom.traverse',
      parameters: walk.parameters.map((p) => ({
        ...p,
        name: p.name === 'character' ? 'who' : 'route',
      })),
      preview: {
        version: 2,
        spatialState: 'unknown',
        effects: [
          {
            kind: 'moveCharacterAlongPath',
            characterParameter: 'who',
            pathParameter: 'route',
            facing: 'unknown',
          },
        ],
      },
    };
    const s = source();
    s.sequence[0] = {
      id: 'walk',
      action: renamed.id,
      arguments: { who: host, route: [{ x: 64, y: 48 }] },
    };
    const result = previewCutscene(s, map, [npc], [renamed], { kind: 'step', id: 'walk' }, [], 16);
    expect(result.segments).toHaveLength(1);
    expect(result.characters.find((c) => c.id === host)?.position).toBeNull();
    expect(
      previewCutscene(s, map, [npc], [renamed], { kind: 'completion' }, [], 16).characters.find(
        (c) => c.id === host,
      )?.position,
    ).toEqual([32, 48]);
  });
  it('requires supported path metadata and preview v2', () => {
    expect(
      readActionPreview({ ...walk, preview: { ...method.action.preview, version: 1 } }),
    ).toBeNull();
    expect(pathPickerMetadata({ ...method.parameters[1], origin: 'bottomLeft' })).toBeNull();
    expect(
      readActionPreview({
        ...walk,
        parameters: walk.parameters.map((p) =>
          p.type === 'path' ? { ...p, picker: 'unknown' } : p,
        ),
      }),
    ).toBeNull();
  });
});
