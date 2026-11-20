import { describe, expect, it } from 'vitest';
import {
  fallbackIndex,
  goalDialogues,
  previewDay,
  routineConditions,
  validateRoutine,
  type RoutineReferences,
} from './routines';
import {
  addEntry,
  moveEntry,
  newGoal,
  removeDay,
  setDayGoals,
  withCondition,
} from './routineEditing';
import type { Routine, RoutineEntry } from '../types/routine';
import type { Map as GameMap } from '../types/schema';

const map = {
  id: 'base:map-1',
  name: 'Map 1',
  spatialPrimitives: {
    anchors: [
      { id: 'right-sie', name: 'right-sie', position: [16, 16], tags: [] },
      { id: 'fabia-destination', name: 'fabia-destination', position: [64, 16], tags: [] },
    ],
  },
} as unknown as GameMap;

const references: RoutineReferences = {
  maps: [map],
  dialogueIds: new Set(['base:fabia_greeting', 'base:selling']),
  characterIds: new Set(['base:fabia']),
  animationIds: new Set(['base:wave2']),
  otherRoutines: [],
};

/** Fabia's routine from the Unity project. */
function fabia(variants?: RoutineEntry[], overrides?: RoutineEntry[]): Routine {
  return {
    formatVersion: 1,
    id: 'base:fabia_routine',
    character: 'base:fabia',
    home: { map: 'base:map-1', anchor: 'right-sie' },
    ...(overrides ? { overrides } : {}),
    variants: variants ?? [
      {
        id: 'default',
        goals: [
          {
            id: 'visit',
            departAt: '06:10',
            destination: { map: 'base:map-1', anchor: 'fabia-destination' },
            activity: { animation: 'base:wave2' },
          },
          { id: 'back_home', departAt: '07:00', destination: 'home' },
        ],
      },
    ],
  };
}

const messages = (routine: Routine, refs: RoutineReferences | undefined = references) =>
  validateRoutine(routine, refs).map((issue) => issue.message);

describe('validateRoutine', () => {
  it('accepts Fabia’s routine', () => {
    expect(messages(fabia())).toEqual([]);
  });

  it('reports what Unity rejects: order, fallback, override conditions, IDs and weights', () => {
    const routine = fabia(
      [
        { id: 'rainy', condition: 'Weather.IsRaining()', goals: [] },
        {
          id: 'default',
          goals: [
            { id: 'a', departAt: '09:00', destination: 'home' },
            { id: 'a', departAt: '08:00', destination: 'home' },
          ],
        },
        { id: 'late', goals: [] },
        { id: 'pool', pickOne: [{ id: 'rainy', weight: 0, goals: [] }] },
      ],
      [{ id: 'festival', goals: [] }],
    );
    expect(messages(routine, undefined)).toEqual([
      'The override festival needs a condition; without one it replaces every day.',
      'The goal ID a is used twice in this day.',
      'a must leave after the goal before it.',
      'late can never be chosen: default before it has no condition.',
      'pool can never be chosen: default before it has no condition.',
      'The ID rainy is used by more than one day.',
      'rainy needs a weight above 0.',
    ]);
  });

  it('needs an ordinary day without a condition; a pool of conditional options is not one', () => {
    const routine = fabia([
      { id: 'summer', pickOne: [{ id: 'beach', condition: 'Story.Has("dry")', goals: [] }] },
    ]);
    expect(fallbackIndex(routine.variants)).toBe(-1);
    expect(messages(routine)).toEqual([
      'One ordinary day needs no condition, so every day has a routine.',
    ]);
  });

  it('checks maps, anchors, animations, characters and a second routine for the same character', () => {
    const routine = fabia();
    routine.home = { map: 'base:map-1', anchor: 'nowhere' };
    routine.variants[0].goals![0].activity = { animation: 'base:dance' };
    routine.variants[0].goals![1].destination = { map: 'base:cave', anchor: 'x' };
    expect(
      messages(routine, {
        ...references,
        characterIds: new Set(),
        otherRoutines: [{ ...fabia(), id: 'base:other' }],
      }),
    ).toEqual([
      'The character base:fabia does not exist.',
      'base:fabia already has the routine base:other.',
      'Home uses the anchor nowhere, which Map 1 does not have.',
      'visit uses the unknown animation base:dance.',
      'back_home uses the unknown map base:cave.',
    ]);
  });

  it('asks for a condition on a goal marked as only on some days', () => {
    const routine = fabia();
    routine.variants[0].goals![0].condition = ' ';
    expect(messages(routine)).toEqual(['visit is only on some days but has no condition yet.']);
  });
});

describe('previewDay', () => {
  const routine = fabia(
    [
      { id: 'rainy', condition: 'rain', goals: [] },
      {
        id: 'summer',
        pickOne: [
          { id: 'beach', condition: 'dry', goals: [] },
          { id: 'shop', goals: [] },
        ],
      },
      { id: 'default', goals: [] },
    ],
    [{ id: 'festival', condition: 'festival', goals: [] }],
  );

  it('picks the first match, overrides first, and lists the pool members that could be drawn', () => {
    expect(previewDay(routine, new Set(['rain', 'festival']))).toEqual({
      list: 'overrides',
      entryIndex: 0,
      candidates: null,
    });
    expect(previewDay(routine, new Set(['rain']))).toEqual({
      list: 'variants',
      entryIndex: 0,
      candidates: null,
    });
    expect(previewDay(routine, new Set(['dry']))).toEqual({
      list: 'variants',
      entryIndex: 1,
      candidates: [0, 1],
    });
    expect(previewDay(routine, new Set())).toEqual({
      list: 'variants',
      entryIndex: 1,
      candidates: [1],
    });
  });

  it('lists every distinct condition once', () => {
    expect(routineConditions(routine)).toEqual(['festival', 'rain', 'dry']);
  });
});

describe('routine editing', () => {
  it('inserts a new ordinary day before the fallback, so it can be reached once it has a condition', () => {
    const { routine, ref } = addEntry(fabia(), 'variants', false);
    expect(routine.variants.map((entry) => entry.id)).toEqual(['day', 'default']);
    expect(ref).toEqual({ list: 'variants', entryIndex: 0, choiceIndex: null });
    const withRain = {
      ...routine,
      variants: [withCondition(routine.variants[0], 'rain'), routine.variants[1]],
    };
    expect(messages(withRain)).toEqual([]);
  });

  it('creates a pool with one option, and removing the last override drops the key', () => {
    const pool = addEntry(fabia(), 'variants', true);
    expect(pool.routine.variants[0]).toEqual({
      id: 'pool',
      pickOne: [{ id: 'pool-option', goals: [] }],
    });
    const special = addEntry(fabia(), 'overrides', false);
    expect(special.routine.overrides).toHaveLength(1);
    expect(removeDay(special.routine, special.ref)).not.toHaveProperty('overrides');
  });

  it('moves days in evaluation order and clears blank conditions', () => {
    const routine = fabia([
      { id: 'a', condition: 'x', goals: [] },
      { id: 'b', goals: [] },
    ]);
    expect(moveEntry(routine, 'variants', 0, 1).variants.map((entry) => entry.id)).toEqual([
      'b',
      'a',
    ]);
    expect(moveEntry(routine, 'variants', 0, -1)).toBe(routine);
    expect(withCondition({ id: 'a', condition: 'x' }, '  ')).toEqual({ id: 'a' });
  });

  it('adds goals an hour after the last one with a fresh ID', () => {
    const routine = fabia();
    const goals = routine.variants[0].goals!;
    expect(newGoal(goals)).toEqual({ id: 'goal', departAt: '08:00', destination: 'home' });
    const next = setDayGoals(routine, { list: 'variants', entryIndex: 0, choiceIndex: null }, [
      ...goals,
      newGoal(goals),
    ]);
    expect(next.variants[0].goals).toHaveLength(3);
    expect(newGoal([])).toEqual({ id: 'goal', departAt: '08:00', destination: 'home' });
  });
});

describe('dialogues through the day', () => {
  it('keeps the newest dialogue until a goal sets another, like Unity', () => {
    const routine = fabia();
    routine.dialogue = 'base:fabia_greeting';
    const [visit, back] = routine.variants[0].goals!;
    visit.walkingDialogue = 'base:hurrying';
    visit.dialogue = 'base:selling';
    back.condition = 'tired';

    expect(goalDialogues(routine, [visit, back], null)).toEqual([
      {
        walking: { id: 'base:hurrying', silent: false, inherited: false },
        there: { id: 'base:selling', silent: false, inherited: false },
      },
      {
        walking: { id: 'base:selling', silent: false, inherited: true },
        there: { id: 'base:selling', silent: false, inherited: true },
      },
    ]);
    // A goal the previewed day skips sets nothing.
    expect(goalDialogues(routine, [visit, back], new Set())[1]).toBeNull();
    expect(
      goalDialogues({ ...routine, dialogue: undefined }, [back], null)[0]?.there.id,
    ).toBeNull();
  });

  it('treats null as nothing to say, which later goals keep until another is set', () => {
    const routine = fabia();
    routine.dialogue = 'base:fabia_greeting';
    const [visit, back] = routine.variants[0].goals!;
    visit.dialogue = null;
    const [first, second] = goalDialogues(routine, [visit, back], null);
    expect(first?.walking).toEqual({ id: 'base:fabia_greeting', silent: false, inherited: true });
    expect(first?.there).toEqual({ id: null, silent: true, inherited: false });
    expect(second?.walking).toEqual({ id: null, silent: true, inherited: true });
    expect(messages(routine)).toEqual([]);
  });

  it('accepts an occupation tag and rejects an invalid one', () => {
    const routine = fabia();
    routine.variants[0].goals![0].occupation = 'fishing';
    expect(messages(routine)).toEqual([]);
    routine.variants[0].goals![0].occupation = 'Fishing Now';
    expect(messages(routine)).toEqual([
      expect.stringContaining('needs an occupation of lowercase letters'),
    ]);
  });

  it('reports dialogues that do not exist', () => {
    const routine = fabia();
    routine.dialogue = 'base:missing';
    routine.variants[0].goals![0].walkingDialogue = 'base:gone';
    expect(messages(routine)).toEqual([
      'The start of the day uses the unknown dialogue base:missing.',
      'visit (walking) uses the unknown dialogue base:gone.',
    ]);
  });
});
