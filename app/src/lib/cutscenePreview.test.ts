import { describe, expect, it } from 'vitest';
import { previewCutscene } from './cutscenePreview';
import { readCutsceneActions } from './cutscenes';
import type { Cutscene, CutsceneAction, CutsceneStep } from '../types/cutscene';
import type { EntityType, Map as GameMap } from '../types/schema';
import bindings from './__fixtures__/cutscene-bindings.json';

const npc = { id: 'base:npc', category: 'npc', displayName: 'Host' } as EntityType;
const map = () =>
  ({
    id: 'base:map',
    entities: [
      { id: 'host', typeId: npc.id, position: [16, 32], properties: {} },
      { id: 'guest', typeId: npc.id, position: [80, 32], properties: {} },
    ],
    layers: [],
    spatialPrimitives: {
      anchors: [
        { id: 'meeting', name: 'Meeting', position: [64, 32], facing: [0, -1] },
        { id: 'gate', name: 'Gate', position: [96, 64], facing: [0, 0] },
      ],
    },
  }) as unknown as GameMap;
const step = (id: string, action: string, args: Record<string, string>): CutsceneStep => ({
  id,
  action,
  arguments: args,
});
const scene = (sequence: CutsceneStep[]): Cutscene => ({
  $schema: '',
  formatVersion: 2,
  id: 'base:intro',
  mapId: 'base:map',
  allowSkip: true,
  sequence,
  onComplete: { steps: [], characterPlacements: [] },
});
const actions = readCutsceneActions(bindings);
const sequence = [
  step('move', 'characters.moveTo', { character: 'host', destination: 'meeting' }),
  step('face', 'characters.face', { character: 'host', target: 'guest' }),
  step('talk', 'dialogue.play', { dialogue: 'greeting' }),
];
const run = (source: Cutscene, id: string, api = actions) =>
  previewCutscene(source, map(), [npc], api, { kind: 'step', id }, ['greeting']);
const character = (result: ReturnType<typeof run>, id = 'host') =>
  result.characters.find((a) => a.id === id)!;

describe('manifest-driven cutscene preview', () => {
  it('previews independent parallel routes without inventing synchronized positions and merges at the join', () => {
    const block: CutsceneStep = {
      id: 'parallel',
      action: 'control.parallel',
      arguments: {},
      tracks: [
        [step('host-move', 'characters.moveTo', { character: 'host', destination: 'meeting' })],
        [step('guest-move', 'characters.moveTo', { character: 'guest', destination: 'gate' })],
      ],
    };
    const source = scene([
      block,
      step('after', 'characters.face', { character: 'host', target: 'guest' }),
    ]);
    const initial = JSON.stringify(source);
    const parallel = run(source, 'parallel');
    expect(parallel.segments.map((segment) => segment.from)).toEqual([
      [16, 32],
      [80, 32],
    ]);
    expect(character(parallel).position).toBeNull();
    expect(character(parallel, 'guest').position).toBeNull();
    const child = run(source, 'host-move');
    expect(character(child).position).toEqual([64, 32]);
    expect(character(child, 'guest').position).toBeNull();
    const joined = run(source, 'after');
    expect(character(joined).position).toEqual([64, 32]);
    expect(character(joined, 'guest').position).toEqual([96, 64]);
    expect(character(joined).facing).not.toBeNull();
    expect(JSON.stringify(source)).toBe(initial);
  });
  it('folds only through the selected step, preserving authored inputs and previous snapshots', () => {
    const source = scene(sequence),
      world = map();
    const before = JSON.stringify({ source, world });
    const moved = previewCutscene(source, world, [npc], actions, { kind: 'step', id: 'move' }, [
      'greeting',
    ]);
    expect(character(moved).position).toEqual([64, 32]);
    expect(character(moved).facing).toBeNull(); // The anchor's facing is not a movement guarantee.
    expect(moved.segments).toEqual([
      {
        stepId: 'move',
        number: 1,
        characterId: 'host',
        kind: 'move',
        from: [16, 32],
        to: [64, 32],
      },
    ]);
    const faced = run(source, 'face');
    expect(character(faced).position).toEqual([64, 32]);
    expect(character(faced).facing).toEqual([1, 0]);
    expect(character(faced, 'guest').position).toEqual([80, 32]);
    expect(faced.segments[1].kind).toBe('face');
    expect(moved.segments).toHaveLength(1);
    expect(run(source, 'move')).toEqual(moved);
    expect(JSON.stringify({ source, world })).toBe(before);
  });

  it('uses declared mappings for unrelated action IDs and differently named/reordered arguments', () => {
    const custom: CutsceneAction = {
      ...actions.find((a) => a.id === 'characters.moveTo')!,
      id: 'anything.relocate',
      parameters: [
        { name: 'where', type: 'string', semanticType: 'anchorRef', picker: 'mapAnchor' },
        { name: 'who', type: 'string', semanticType: 'characterRef', picker: 'mapCharacter' },
      ],
      preview: {
        version: 1,
        spatialState: 'described',
        effects: [
          {
            kind: 'moveCharacterToAnchor',
            characterParameter: 'who',
            anchorParameter: 'where',
            facing: 'unknown',
          },
        ],
      },
    };
    const result = run(
      scene([step('custom', custom.id, { where: 'meeting', who: 'host' })]),
      'custom',
      [custom],
    );
    expect(character(result).position).toEqual([64, 32]);
    expect(result.segments).toHaveLength(1);
  });

  it('applies multiple declared effects in array order', () => {
    const composite: CutsceneAction = {
      ...actions[0],
      id: 'custom.composite',
      parameters: [
        ...actions.find((a) => a.id === 'characters.moveTo')!.parameters,
        { name: 'target', type: 'string', semanticType: 'characterRef', picker: 'mapCharacter' },
      ],
      preview: {
        version: 1,
        spatialState: 'described',
        effects: [
          {
            kind: 'moveCharacterToAnchor',
            characterParameter: 'character',
            anchorParameter: 'destination',
            facing: 'unknown',
          },
          {
            kind: 'faceCharacterTowardCharacter',
            characterParameter: 'character',
            targetCharacterParameter: 'target',
          },
        ],
      },
    };
    const result = run(
      scene([
        step('both', composite.id, { character: 'host', destination: 'meeting', target: 'guest' }),
      ]),
      'both',
      [composite],
    );
    expect(character(result).facing).toEqual([1, 0]);
    expect(result.segments.map((s) => s.kind)).toEqual(['move', 'face']);
  });

  it('preserves spatial state across numeric timing actions with declared empty effects', () => {
    const source = scene([
      sequence[0],
      sequence[1],
      { id: 'pause', action: 'cutscene.wait', arguments: { seconds: 0.5 } },
    ]);
    const before = run(source, 'face'),
      after = run(source, 'pause');
    expect(after.characters).toEqual(before.characters);
    expect(after.segments).toEqual(before.segments);
    expect(after.notices).toEqual([]);
  });

  it('shows the dialogue cue but invalidates spatial certainty while retaining historical arrows', () => {
    const result = run(scene(sequence), 'talk');
    expect(result.cues).toEqual([{ stepId: 'talk', dialogueId: 'greeting' }]);
    expect(result.characters.every((a) => a.position === null && a.facing === null)).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.notices.some((n) => n.message.includes('history only'))).toBe(true);
  });

  it.each([
    undefined,
    { version: 3, spatialState: 'described', effects: [] },
    { version: 1, spatialState: 'described', effects: [{ kind: 'futureEffect' }] },
    {
      version: 1,
      spatialState: 'described',
      effects: [
        {
          kind: 'moveCharacterToAnchor',
          characterParameter: 'missing',
          anchorParameter: 'destination',
          facing: 'unknown',
        },
      ],
    },
    {
      version: 1,
      spatialState: 'described',
      effects: [
        {
          kind: 'moveCharacterToAnchor',
          characterParameter: 'destination',
          anchorParameter: 'character',
          facing: 'unknown',
        },
      ],
    },
    {
      version: 1,
      spatialState: 'described',
      effects: [
        { kind: 'showDialogue', dialogueParameter: 'character', characterParameter: 'character' },
      ],
    },
  ])(
    'treats unsupported/malformed preview metadata as unavailable rather than unchanged: %j',
    (preview) => {
      const unsupported: CutsceneAction = {
        ...actions.find((a) => a.id === 'characters.moveTo')!,
        preview,
      };
      const result = run(scene([sequence[0]]), 'move', [unsupported]);
      expect(character(result).position).toBeNull();
      expect(result.segments).toEqual([]);
      expect(result.notices[0].message).toContain('no supported preview declaration');
    },
  );

  it('distinguishes explicit spatial no-op and recovers only the known endpoint after an unknown action', () => {
    const noop = {
      ...actions[0],
      id: 'custom.noop',
      preview: { version: 1, spatialState: 'described', effects: [] },
    };
    const unknown = { ...actions[0], id: 'custom.opaque', preview: undefined };
    const source = scene([
      sequence[0],
      step('noop', noop.id, {}),
      step('opaque', unknown.id, {}),
      step('recover', 'characters.moveTo', { character: 'host', destination: 'gate' }),
    ]);
    expect(character(run(source, 'noop', [...actions, noop, unknown])).position).toEqual([64, 32]);
    const result = run(source, 'recover', [...actions, noop, unknown]);
    expect(character(result).position).toEqual([96, 64]);
    expect(character(result, 'guest').position).toBeNull();
    expect(result.segments).toHaveLength(1); // No fabricated recovery arrow or origin.
    expect(result.notices.some((n) => n.message.includes('destination only'))).toBe(true);
  });

  it('never invents a player start or a facing vector for unknown/coincident positions', () => {
    const source = scene([
      step('playerMove', 'characters.moveTo', { character: 'player', destination: 'meeting' }),
      step('face', 'characters.face', { character: 'host', target: 'player' }),
    ]);
    expect(
      character(
        run(
          scene([step('unknownFace', 'characters.face', { character: 'host', target: 'player' })]),
          'unknownFace',
        ),
      ).facing,
    ).toBeNull();
    const result = run(source, 'playerMove');
    expect(character(result, 'player').position).toEqual([64, 32]);
    expect(result.segments).toEqual([]);
    source.sequence.push(
      step('coincidentMove', 'characters.moveTo', { character: 'host', destination: 'meeting' }),
      step('coincidentFace', 'characters.face', { character: 'host', target: 'player' }),
    );
    expect(character(run(source, 'coincidentFace')).facing).toBeNull();
  });

  it('reports missing references without retaining a false character endpoint', () => {
    const source = scene([
      step('bad', 'characters.moveTo', { character: 'host', destination: 'deleted' }),
    ]);
    const result = run(source, 'bad');
    expect(character(result).position).toBeNull();
    expect(result.notices[0].message).toContain('missing anchor deleted');
    const missingCharacter = run(
      scene([step('bad', 'characters.moveTo', { character: 'deleted', destination: 'meeting' })]),
      'bad',
    );
    expect(missingCharacter.notices[0].message).toContain('missing character deleted');
    const missingDialogue = run(
      scene([step('bad', 'dialogue.play', { dialogue: 'deleted' })]),
      'bad',
    );
    expect(missingDialogue.cues).toEqual([]);
    expect(missingDialogue.notices[0].message).toContain('deleted');
  });

  it('keeps original and completion views separate from the last sequence position', () => {
    const source = scene(sequence);
    const initial = previewCutscene(source, map(), [npc], actions, { kind: 'scene' }, []);
    expect(character(initial).position).toEqual([16, 32]);
    expect(initial.segments).toEqual([]);
    source.onComplete.characterPlacements = [{ character: 'guest', anchor: 'meeting' }];
    const final = previewCutscene(source, map(), [npc], actions, { kind: 'completion' }, []);
    expect(character(final).position).toEqual([16, 32]);
    expect(character(final, 'guest').position).toEqual([64, 32]);
    expect(character(final, 'guest').facing).toEqual([0, -1]);
    expect(final.segments).toEqual([]);
    const opaque = {
      ...actions[0],
      id: 'test.completionOpaque',
      phases: ['completion'] as const,
      preview: { version: 1, spatialState: 'unknown', effects: [] },
    };
    source.onComplete.steps = [{ id: 'opaque-completion', action: opaque.id, arguments: {} }];
    const opaqueFinal = previewCutscene(
      source,
      map(),
      [npc],
      [...actions, { ...opaque, phases: ['completion'] }],
      { kind: 'completion' },
      [],
    );
    expect(character(opaqueFinal).position).toBeNull();
    expect(opaqueFinal.notices[0].message).toContain('Spatial state is unknown');
  });
});
