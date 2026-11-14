/** Pure edits on a routine document, used by the routine editor. Each returns a new routine. */
import type {
  Routine,
  RoutineChoice,
  RoutineEntry,
  RoutineGoal,
  RoutineList,
} from '../types/routine';
import {
  fallbackIndex,
  minutesOf,
  timeOf,
  TIME_PATTERN,
  unusedDayId,
  unusedId,
  type RoutineDayRef,
} from './routines';

/** A copy without one optional key, for fields the schema forbids leaving blank. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function withEntries(routine: Routine, list: RoutineList, entries: RoutineEntry[]): Routine {
  if (list === 'variants') return { ...routine, variants: entries };
  return entries.length ? { ...routine, overrides: entries } : without(routine, 'overrides');
}

const entriesOf = (routine: Routine, list: RoutineList) =>
  (list === 'overrides' ? routine.overrides : routine.variants) ?? [];

export function updateEntry(
  routine: Routine,
  list: RoutineList,
  index: number,
  update: (entry: RoutineEntry) => RoutineEntry,
): Routine {
  return withEntries(
    routine,
    list,
    entriesOf(routine, list).map((entry, i) => (i === index ? update(entry) : entry)),
  );
}

export function updateChoice(
  routine: Routine,
  ref: RoutineDayRef,
  update: (choice: RoutineChoice) => RoutineChoice,
): Routine {
  return updateEntry(routine, ref.list, ref.entryIndex, (entry) => ({
    ...entry,
    pickOne: entry.pickOne!.map((choice, c) => (c === ref.choiceIndex ? update(choice) : choice)),
  }));
}

/** Replaces the goals of a fixed day or pool member. */
export function setDayGoals(routine: Routine, ref: RoutineDayRef, goals: RoutineGoal[]): Routine {
  return ref.choiceIndex === null
    ? updateEntry(routine, ref.list, ref.entryIndex, (entry) => ({ ...entry, goals }))
    : updateChoice(routine, ref, (choice) => ({ ...choice, goals }));
}

/** Sets or clears an optional condition: blank text removes the key, as the schema requires. */
export function withCondition<T extends { condition?: string }>(target: T, condition: string): T {
  return condition.trim() ? { ...target, condition } : (without(target, 'condition') as T);
}

export function addEntry(
  routine: Routine,
  list: RoutineList,
  pool: boolean,
): { routine: Routine; ref: RoutineDayRef } {
  const entries = entriesOf(routine, list);
  const id = unusedDayId(routine, list === 'overrides' ? 'special-day' : pool ? 'pool' : 'day');
  // The member's ID must also differ from the new entry's own.
  const memberId = unusedDayId(
    { ...routine, variants: [...routine.variants, { id }] },
    `${id}-option`,
  );
  const entry: RoutineEntry = pool
    ? { id, pickOne: [{ id: memberId, goals: [] }] }
    : { id, goals: [] };
  // New ordinary days go before the fallback so they can be reached; they need a condition, which validation
  // asks for until the author writes one.
  const fallback = list === 'variants' ? fallbackIndex(entries) : -1;
  const index = fallback >= 0 ? fallback : entries.length;
  const next = [...entries.slice(0, index), entry, ...entries.slice(index)];
  return {
    routine: withEntries(routine, list, next),
    ref: { list, entryIndex: index, choiceIndex: pool ? 0 : null },
  };
}

export function addChoice(
  routine: Routine,
  list: RoutineList,
  entryIndex: number,
): { routine: Routine; ref: RoutineDayRef } {
  const entry = entriesOf(routine, list)[entryIndex];
  const id = unusedDayId(routine, `${entry.id}-option`);
  const choiceIndex = entry.pickOne!.length;
  return {
    routine: updateEntry(routine, list, entryIndex, (e) => ({
      ...e,
      pickOne: [...e.pickOne!, { id, goals: [] }],
    })),
    ref: { list, entryIndex, choiceIndex },
  };
}

export function removeDay(routine: Routine, ref: RoutineDayRef): Routine {
  if (ref.choiceIndex === null)
    return withEntries(
      routine,
      ref.list,
      entriesOf(routine, ref.list).filter((_, i) => i !== ref.entryIndex),
    );
  return updateEntry(routine, ref.list, ref.entryIndex, (entry) => ({
    ...entry,
    pickOne: entry.pickOne!.filter((_, c) => c !== ref.choiceIndex),
  }));
}

/** Moves an entry one place up (-1) or down (+1) in its list; first-hit order is the evaluation order. */
export function moveEntry(
  routine: Routine,
  list: RoutineList,
  index: number,
  delta: -1 | 1,
): Routine {
  const entries = [...entriesOf(routine, list)];
  const target = index + delta;
  if (target < 0 || target >= entries.length) return routine;
  [entries[index], entries[target]] = [entries[target], entries[index]];
  return withEntries(routine, list, entries);
}

/** A goal one hour after the last one (or at 08:00), heading home. */
export function newGoal(goals: RoutineGoal[]): RoutineGoal {
  const last = goals[goals.length - 1];
  const after = last && TIME_PATTERN.test(last.departAt) ? minutesOf(last.departAt) + 60 : 8 * 60;
  return {
    id: unusedId(new Set(goals.map((goal) => goal.id)), 'goal'),
    departAt: timeOf(Math.min(after, 23 * 60 + 59)),
    destination: 'home',
  };
}
