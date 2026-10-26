import { describe, expect, it } from 'vitest';
import {
  actionsForCutscenePhase,
  declaredActorsBefore,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import { previewCutscene, readActionPreview } from './cutscenePreview';
import { parseScriptingManifest } from './scriptingManifest';
import bindings from './__fixtures__/unity-bindings-v2.json';
import type { Cutscene, CutsceneStep } from '../types/cutscene';
import type { Map as GameMap } from '../types/schema';
const actions = readCutsceneActions(bindings);
const resources = parseScriptingManifest(bindings).resources!;
const definition = resources.actor[0].id;
const map = {
  id: 'base:map',
  width: 32,
  height: 24,
  layers: [],
  entities: [],
  spatialPrimitives: { anchors: [{ id: 'meeting', position: [168, 104], facing: [1, 0] }] },
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [], dialogueIds: [], resources, tileSize: 16 };
const spawn: CutsceneStep = {
  id: 'spawn-guest',
  action: 'actors.spawn',
  arguments: { actor: 'guest', definition, position: { anchor: 'meeting' } },
};
const face: CutsceneStep = {
  id: 'face-guest',
  action: 'actors.faceDirection',
  arguments: { actor: 'guest', direction: 'East' },
};
const scene = (): Cutscene => ({
  $schema: '../schemas/cutscene.schema.json',
  formatVersion: 2,
  id: 'base:test',
  mapId: map.id,
  allowSkip: true,
  onStart: [structuredClone(spawn), structuredClone(face)],
  sequence: [{ id: 'wait', action: 'cutscene.wait', arguments: { seconds: 1 } }],
  onComplete: { steps: [], actorPlacements: [] },
});
const preview = (s: Cutscene, selection: Parameters<typeof previewCutscene>[4]) =>
  previewCutscene(s, map, [], actions, selection, [], 16, resources);
describe('Unity actor declaration and position handoff', () => {
  it('loads the actual export and limits Spawn to setup', () => {
    expect(actionsForCutscenePhase(actions, 'setup').map((a) => a.id)).toContain('actors.spawn');
    for (const phase of ['sequence', 'completion'] as const)
      expect(actionsForCutscenePhase(actions, phase).map((a) => a.id)).not.toContain(
        'actors.spawn',
      );
    expect(readActionPreview(actions.find((a) => a.id === 'actors.spawn'))?.effects[0].kind).toBe(
      'spawnActor',
    );
  });
  it('exports an anchor argument unchanged and makes declarations visible strictly after their setup step', () => {
    const s = scene();
    expect(validateCutscene(s, actions, refs)).toEqual([]);
    expect(parseCutscene(exportCutscene(s, actions, refs)).onStart![0]).toEqual(spawn);
    expect(declaredActorsBefore(s, actions, ['player'], 'spawn-guest')).toEqual([]);
    expect(declaredActorsBefore(s, actions, ['player'], 'face-guest')).toEqual(['guest']);
    expect(declaredActorsBefore(s, actions, ['player'], 'wait')).toEqual(['guest']);
    s.onStart!.reverse();
    expect(declaredActorsBefore(s, actions, ['player'], 'face-guest')).toEqual([]);
    expect(validateCutscene(s, actions, refs)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: 'face-guest', message: 'Missing actorRef: guest' }),
      ]),
    );
  });
  it('recalculates renamed declarations without rewriting unresolved references', () => {
    const s = scene();
    s.onStart![0].arguments.actor = 'visitor';
    expect(declaredActorsBefore(s, actions, ['player'], 'wait')).toEqual(['visitor']);
    expect(
      validateCutscene(s, actions, refs).some((d) => d.message === 'Missing actorRef: guest'),
    ).toBe(true);
    expect(s.onStart![1].arguments.actor).toBe('guest');
  });
  it.each(['player', 'guest', '   '])('rejects duplicate or empty declarations %j', (name) => {
    const s = scene();
    s.onStart!.push({
      ...structuredClone(spawn),
      id: 'duplicate',
      arguments: { ...spawn.arguments, actor: name },
    });
    expect(validateCutscene(s, actions, refs).length).toBeGreaterThan(0);
  });
  it('rejects declaration collisions with placed actors and unregistered definitions', () => {
    const s = scene();
    s.onStart![0].arguments.actor = 'placed';
    const occupied = {
      ...map,
      entities: [{ id: 'placed', typeId: 'npc', position: [0, 0], properties: {} }],
    } as GameMap;
    expect(
      validateCutscene(s, actions, {
        ...refs,
        maps: [occupied],
        entityTypes: [{ id: 'npc', category: 'npc' } as never],
      }).some((d) => d.message === 'Duplicate actor name: placed'),
    ).toBe(true);
    s.onStart![0].arguments.definition = 'base:unregistered';
    expect(
      validateCutscene(s, actions, refs).some((d) => d.message.includes('Missing actor resource')),
    ).toBe(true);
    expect(
      preview(s, { kind: 'setup' }).notices.some((n) => n.message.includes('unregistered')),
    ).toBe(true);
  });
  it('rejects mixed position shapes and missing anchors without replacing their IDs', () => {
    const s = scene();
    s.onStart![0].arguments.position = { anchor: 'gone' };
    expect(
      validateCutscene(s, actions, refs).some((d) => d.message === 'Missing anchor: gone'),
    ).toBe(true);
    expect(preview(s, { kind: 'setup' }).actors.find((a) => a.id === 'guest')?.position).toBeNull();
    expect(s.onStart![0].arguments.position).toEqual({ anchor: 'gone' });
    expect(() =>
      parseCutscene({
        ...s,
        onStart: [
          {
            ...spawn,
            arguments: { ...spawn.arguments, position: { anchor: 'meeting', x: 1, y: 2 } },
          },
        ],
      }),
    ).toThrow();
  });
  it('spawns with unknown facing, folds later effects, and restores the spawn point on completion/skip', () => {
    const s = scene();
    expect(
      preview(s, { kind: 'step', id: 'spawn-guest' }).actors.find((a) => a.id === 'guest'),
    ).toEqual({
      id: 'guest',
      label: 'guest',
      definitionId: definition,
      position: [168, 104],
      facing: null,
    });
    expect(
      preview(s, { kind: 'step', id: 'wait' }).actors.find((a) => a.id === 'guest')?.facing,
    ).toEqual([1, 0]);
    s.onStart!.push({
      id: 'place-guest',
      action: 'actors.place',
      arguments: { actor: 'guest', position: { x: 20, y: 30 } },
    });
    expect(preview(s, { kind: 'setup' }).actors.find((a) => a.id === 'guest')?.position).toEqual([
      20, 30,
    ]);
    expect(preview(s, { kind: 'completion' }).actors.find((a) => a.id === 'guest')).toMatchObject({
      position: [168, 104],
      facing: null,
    });
    s.onComplete.steps = [
      {
        id: 'finish',
        action: 'actors.place',
        arguments: { actor: 'guest', position: { anchor: 'meeting' } },
      },
    ];
    s.onComplete.actorPlacements = [{ actor: 'guest', anchor: 'meeting' }];
    expect(validateCutscene(s, actions, refs)).toEqual([]);
    expect(preview(s, { kind: 'completion' }).actors.find((a) => a.id === 'guest')).toMatchObject({
      position: [168, 104],
      facing: [1, 0],
    });
    expect(preview(s, { kind: 'completion' }).segments).toEqual([]);
  });
  it('uses renamed metadata parameter mappings instead of API names', () => {
    const original = actions.find((a) => a.id === 'actors.spawn')!;
    const renamed = {
      ...original,
      id: 'custom.create',
      parameters: original.parameters.map((p) => ({
        ...p,
        name: ({ actor: 'role', definition: 'kind', position: 'point' } as Record<string, string>)[
          p.name
        ],
      })),
      preview: {
        version: 2,
        spatialState: 'described',
        effects: [
          {
            kind: 'spawnActor',
            actorParameter: 'role',
            definitionParameter: 'kind',
            positionParameter: 'point',
            facing: 'unknown',
          },
        ],
      },
    };
    const s = scene();
    s.onStart = [
      {
        id: 'new',
        action: renamed.id,
        arguments: { role: 'visitor', kind: definition, point: { x: 50, y: 60 } },
      },
    ];
    expect(
      previewCutscene(
        s,
        map,
        [],
        [...actions, renamed],
        { kind: 'setup' },
        [],
        16,
        resources,
      ).actors.find((a) => a.id === 'visitor'),
    ).toMatchObject({ definitionId: definition, position: [50, 60], facing: null });
  });
});
