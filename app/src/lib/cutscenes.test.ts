import { describe, expect, it } from 'vitest';
import manifest from './__fixtures__/cutscene-bindings.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import storyAction from './__fixtures__/story-action.json';
import {
  createCutsceneStep,
  exportCutscene,
  mapCharacterInstances,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
  validateCutsceneTriggers,
} from './cutscenes';
import type { Cutscene } from '../types/cutscene';
import type { EntityType, Map as GameMap } from '../types/schema';

export const actions = readCutsceneActions(manifest);
export const npc = {
  id: 'base:host',
  displayName: 'Host',
  category: 'npc',
  properties: [],
  defaultSize: [1, 1],
  placeholderColor: 'blue',
} as EntityType;
export function fixtureMap(): GameMap {
  return {
    version: 1,
    id: 'base:map-1',
    name: 'Map',
    width: 20,
    height: 20,
    baseTilesetId: 'base:tiles',
    tilesetRefs: ['base:tiles'],
    layers: [],
    entities: [
      { id: 'cutscene-prototype-host-01', typeId: npc.id, position: [32, 48], properties: {} },
    ],
    spatialPrimitives: {
      anchors: [
        { id: 'prototype-meeting', name: 'Meeting', position: [64, 80], tags: [], facing: [0, 0] },
      ],
    },
  };
}
const refs = () => ({
  maps: [fixtureMap()],
  entityTypes: [npc],
  dialogueIds: ['prototype_greeting'],
});
const scene = (): Cutscene => parseCutscene(prototype);

describe('Unity cutscene contract', () => {
  it('blocks declared story type mismatches before saving while allowing undeclared keys', () => {
    const palette = readCutsceneActions({
      schemaVersion: 2,
      modules: [{ path: 'GameState.Story', methods: [storyAction] }],
    });
    const draft = scene();
    draft.onStart = [];
    draft.onComplete.steps = [];
    draft.sequence = [{ id: 'set', action: 'story.set', arguments: { key: 'count', value: 1.5 } }];
    expect(validateCutscene(draft, palette, refs())).toEqual([]);
    const declared = { ...refs(), storyValues: [{ key: 'count', type: 'long' as const }] };
    expect(() => exportCutscene(draft, palette, declared)).toThrow(
      'requires long as declared in Data',
    );
    draft.sequence[0].arguments.value = 'text';
    expect(() => exportCutscene(draft, palette, declared)).toThrow(
      'requires long as declared in Data',
    );
    draft.sequence[0].arguments.value = 4;
    expect(validateCutscene(draft, palette, declared)).toEqual([]);
  });
  it('exports story actions with all plain value kinds, including empty strings and nested objects', () => {
    const palette = readCutsceneActions({
      schemaVersion: 2,
      modules: [{ path: 'GameState.Story', methods: [storyAction] }],
    });
    const draft = scene();
    draft.onStart = [];
    draft.onComplete.steps = [];
    draft.sequence = [false, 'Ada', '', 3, 12.5, { stage: 2, details: { accepted: true } }].map(
      (value, index) => ({
        id: `value-${index}`,
        action: 'story.set',
        arguments: { key: `key-${index}`, value },
      }),
    );
    expect(validateCutscene(draft, palette, refs())).toEqual([]);
    expect(parseCutscene(exportCutscene(draft, palette, refs())).sequence).toEqual(draft.sequence);
    draft.sequence[0].arguments.value = null;
    expect(
      validateCutscene(draft, palette, refs()).some((issue) =>
        issue.message.includes('story object'),
      ),
    ).toBe(true);
  });
  it('reads the current Unity export, excluding ordinary synchronous calls and other contexts', () => {
    expect(actions.map((a) => a.id).sort()).toEqual([
      'characters.face',
      'characters.moveTo',
      'characters.playAnimation',
      'cutscene.wait',
      'dialogue.play',
    ]);
    expect(actions.find((a) => a.id === 'characters.moveTo')?.parameters[1]).toMatchObject({
      semanticType: 'anchorRef',
      picker: 'mapAnchor',
    });
    expect(() => readCutsceneActions({ ...manifest, schemaVersion: 3 })).toThrow('schemaVersion 2');
  });

  it('validates and deterministically re-exports the current authored prototype', () => {
    expect(validateCutscene(scene(), actions, refs())).toEqual([]);
    const changedOrder = scene();
    changedOrder.sequence[0].arguments = {
      destination: 'prototype-meeting',
      character: 'cutscene-prototype-host-01',
    };
    expect(JSON.stringify(exportCutscene(changedOrder, actions, refs()))).toBe(
      JSON.stringify(exportCutscene(scene(), actions, refs())),
    );
    expect(exportCutscene(scene(), actions, refs())).toEqual(prototype);
  });

  it('drives new actions from metadata without adding a fixed editor capability list', () => {
    const extended = structuredClone(manifest);
    const method = structuredClone(extended.modules[0].methods[0]);
    method.action = { ...method.action!, id: 'characters.wave', displayName: 'Wave' };
    extended.modules[0].methods.push(method);
    const palette = readCutsceneActions(extended);
    expect(palette.find((a) => a.id === 'characters.wave')?.displayName).toBe('Wave');
    const step = createCutsceneStep(palette.find((a) => a.id === 'characters.wave')!);
    expect(Object.keys(step.arguments)).toEqual(['character', 'target']);
  });

  it.each([
    [
      'unknown root',
      (s: Record<string, any>) => {
        s.completion = { outcome: 'finished' };
      },
    ],
    [
      'missing skip',
      (s: Record<string, any>) => {
        delete s.allowSkip;
      },
    ],
    [
      'missing completion steps',
      (s: Record<string, any>) => {
        delete s.onComplete.steps;
      },
    ],
    [
      'unknown beat field',
      (s: Record<string, any>) => {
        s.sequence[0].duration = 5;
      },
    ],
    [
      'duplicate step ID',
      (s: Record<string, any>) => {
        s.sequence[1].id = s.sequence[0].id;
      },
    ],
  ])('rejects %s instead of repairing source', (_name, change) => {
    const raw = structuredClone(prototype);
    change(raw);
    expect(() => parseCutscene(raw)).toThrow();
  });

  it('reports a broken later reference before any export can write', () => {
    const broken = scene();
    broken.sequence[2].arguments.dialogue = 'missing';
    expect(validateCutscene(broken, actions, refs())).toContainEqual(
      expect.objectContaining({ stepId: 'talk', message: 'Missing dialogueRef: missing' }),
    );
    expect(() => exportCutscene(broken, actions, refs())).toThrow('talk');
  });

  it('rejects blank required string arguments through the action signature before export', () => {
    const broken = scene();
    broken.sequence[0].arguments.character = ' ';
    expect(
      validateCutscene(broken, actions, refs()).some(
        (issue) => issue.message === 'Must not be blank',
      ),
    ).toBe(true);
    expect(() => exportCutscene(broken, actions, refs())).toThrow('Must not be blank');
  });

  it('rejects unsupported actions, arguments, semantic pairs and parameter types', () => {
    const broken = scene();
    broken.sequence[0].arguments.speed = 'fast';
    expect(
      validateCutscene(broken, actions, refs()).some((d) => d.message === 'Unknown argument'),
    ).toBe(true);
    broken.sequence[0].action = 'cutscene.setOutcome';
    expect(
      validateCutscene(broken, actions, refs()).some((d) =>
        d.message.includes('Unsupported cutscene action'),
      ),
    ).toBe(true);
    const changed = structuredClone(actions);
    changed[0].parameters[0].picker = 'characterDefinition';
    expect(
      validateCutscene(scene(), changed, refs()).some((d) =>
        d.message.includes('Unsupported picker'),
      ),
    ).toBe(true);
    changed[0].parameters[0].type = 'table';
    expect(
      validateCutscene(scene(), changed, refs()).some((d) =>
        d.message.includes('Unsupported parameter type'),
      ),
    ).toBe(true);
  });

  it('picks NPC placement IDs across root and layer entities, excluding props', () => {
    const map = fixtureMap();
    map.layers.push({
      id: 'characters',
      name: 'Characters',
      kind: 'entity',
      visible: true,
      opacity: 1,
      zOrder: 0,
      entities: [...map.entities],
    });
    map.entities.push({ id: 'chest', typeId: 'base:chest', position: [0, 0], properties: {} });
    expect(mapCharacterInstances(map, [npc]).map((e) => e.id)).toEqual([
      'cutscene-prototype-host-01',
    ]);
    const unchanged = scene();
    map.entities[0].label = 'A new display name';
    map.entities[0].position = [99, 100];
    map.spatialPrimitives!.anchors![0].name = 'A renamed anchor';
    expect(validateCutscene(unchanged, actions, { ...refs(), maps: [map] })).toEqual([]);
  });

  it('allows endpoint-only characters and rejects duplicate or missing endpoint references', () => {
    const map = fixtureMap();
    map.entities.push({ ...map.entities[0], id: 'another-host' });
    const s = scene();
    s.onComplete.characterPlacements.push({
      character: 'another-host',
      anchor: 'prototype-meeting',
    });
    expect(validateCutscene(s, actions, { ...refs(), maps: [map] })).toEqual([]);
    s.onComplete.characterPlacements.push({ character: 'another-host', anchor: 'absent' });
    const errors = validateCutscene(s, actions, { ...refs(), maps: [map] });
    expect(errors.some((e) => e.message.includes('Duplicate endpoint'))).toBe(true);
    expect(errors.some((e) => e.message.includes('Missing anchor'))).toBe(true);
  });

  it('preserves string contents for Unity escaping and omits editor metadata', () => {
    const s = scene();
    const special = 'quote" slash\\ newline\n tab\t control\u0001';
    s.sequence[2].arguments.dialogue = special;
    const result = exportCutscene(s, actions, { ...refs(), dialogueIds: [special] });
    expect(JSON.parse(JSON.stringify(result)).sequence[2].arguments.dialogue).toBe(special);
    expect(Object.keys(result).sort()).toEqual(
      ['$schema', 'formatVersion', 'id', 'mapId', 'allowSkip', 'onComplete', 'sequence'].sort(),
    );
  });

  it('requires same-map cutscene triggers and excludes location links while retaining geometry', () => {
    const map = fixtureMap();
    map.spatialPrimitives!.triggers = [
      {
        id: 'intro',
        type: 'cutscene',
        cutsceneId: scene().id,
        shape: 'polygon',
        position: [0, 0],
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      },
    ];
    const geometry = structuredClone(map.spatialPrimitives!.triggers[0]);
    expect(validateCutsceneTriggers(map, [scene()])).toEqual([]);
    expect(validateCutsceneTriggers(map, [])).toHaveLength(1);
    expect(validateCutsceneTriggers(map, [{ ...scene(), mapId: 'another-map' }])).toHaveLength(1);
    map.locationLinks = [
      { id: 'link', triggerId: 'intro', targetMapId: map.id, targetAnchorId: 'prototype-meeting' },
    ];
    expect(validateCutsceneTriggers(map, [scene()])[0]).toContain('location link');
    expect(map.spatialPrimitives!.triggers[0]).toEqual(geometry);
  });
});
