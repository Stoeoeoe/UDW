/**
 * Routine authoring rules shared by the store and the routine editor. Mirrors Unity's RoutineValidator, the
 * catalog checks Vulcanus can make itself (maps, anchors, characters, animations), and the planner's first-hit
 * choice. See docs/routine-editor.md.
 */
import type { Character, EntityInstance, Map as GameMap } from '../types/schema';
import type {
  Routine,
  RoutineChoice,
  RoutineEntry,
  RoutineGoal,
  RoutineList,
  RoutinePlace,
} from '../types/routine';
import { LOCAL_ID_PATTERN } from './resourceIds';
import { canReachMap } from './worldGraph';

/** Routines are named after their character. */
export function routineLabel(routine: Routine, characters: readonly Character[]): string {
  return (
    characters.find((character) => character.id === routine.character)?.name ?? routine.character
  );
}

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function minutesOf(time: string): number {
  return parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3), 10);
}

export function timeOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A day a planner can choose: a fixed entry or one member of a pool. */
export interface RoutineDayRef {
  list: RoutineList;
  entryIndex: number;
  /** Index into the entry's `pickOne`, or null for a fixed entry. */
  choiceIndex: number | null;
}

export function sameDayRef(a: RoutineDayRef | null, b: RoutineDayRef | null): boolean {
  return (
    !!a &&
    !!b &&
    a.list === b.list &&
    a.entryIndex === b.entryIndex &&
    a.choiceIndex === b.choiceIndex
  );
}

export function entriesOf(routine: Routine, list: RoutineList): RoutineEntry[] {
  return (list === 'overrides' ? routine.overrides : routine.variants) ?? [];
}

/** The day a reference points at, or null when it no longer exists. */
export function dayAt(
  routine: Routine,
  ref: RoutineDayRef,
): { entry: RoutineEntry; choice: RoutineChoice | null; goals: RoutineGoal[] } | null {
  const entry = entriesOf(routine, ref.list)[ref.entryIndex];
  if (!entry) return null;
  if (ref.choiceIndex === null)
    return entry.pickOne ? null : { entry, choice: null, goals: entry.goals ?? [] };
  const choice = entry.pickOne?.[ref.choiceIndex];
  return choice ? { entry, choice, goals: choice.goals } : null;
}

/** The entities placed on a map, from the map itself and from its entity layers. */
export function mapEntities(map: GameMap): EntityInstance[] {
  const byId = new Map<string, EntityInstance>();
  for (const entity of [...map.entities, ...map.layers.flatMap((layer) => layer.entities ?? [])])
    byId.set(entity.id, entity);
  return [...byId.values()];
}

/** What a goal's place is called in lists: the anchor, or the entity. */
export const placeName = (place: RoutinePlace) => place.entity ?? place.anchor ?? '';

export function resolvePlace(
  routine: Routine,
  destination: RoutineGoal['destination'],
): RoutinePlace {
  return destination === 'home' ? routine.home : destination;
}

const hasCondition = (condition: string | undefined) => !!condition?.trim();

/**
 * Index of the first variant that is always chosen when reached, or -1. A pool whose members all have
 * conditions can be skipped, so it is no fallback.
 */
export function fallbackIndex(variants: RoutineEntry[]): number {
  return variants.findIndex(
    (entry) =>
      !hasCondition(entry.condition) &&
      !(entry.pickOne && entry.pickOne.every((choice) => hasCondition(choice.condition))),
  );
}

/** Every distinct condition in the routine, in reading order, for the day preview. */
export function routineConditions(routine: Routine): string[] {
  const seen = new Set<string>();
  const add = (condition: string | undefined) => {
    const trimmed = condition?.trim();
    if (trimmed) seen.add(trimmed);
  };
  const addGoals = (goals: RoutineGoal[] | undefined) =>
    goals?.forEach((goal) => add(goal.condition));
  for (const entry of [...(routine.overrides ?? []), ...routine.variants]) {
    add(entry.condition);
    addGoals(entry.goals);
    entry.pickOne?.forEach((choice) => {
      add(choice.condition);
      addGoals(choice.goals);
    });
  }
  return [...seen];
}

/**
 * What Unity's planner would choose when exactly the conditions in `truths` hold. Pools report every matching
 * member, because the daily pick between them is random. Null when nothing matches (an invalid routine).
 */
export function previewDay(
  routine: Routine,
  truths: ReadonlySet<string>,
): { list: RoutineList; entryIndex: number; candidates: number[] | null } | null {
  const holds = (condition: string | undefined) =>
    !hasCondition(condition) || truths.has(condition!.trim());
  for (const list of ['overrides', 'variants'] as const) {
    const entries = entriesOf(routine, list);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!holds(entry.condition)) continue;
      if (!entry.pickOne) return { list, entryIndex: i, candidates: null };
      const matching = entry.pickOne.flatMap((choice, c) => (holds(choice.condition) ? [c] : []));
      if (matching.length) return { list, entryIndex: i, candidates: matching };
    }
  }
  return null;
}

/** Goals that run on a previewed day: those whose condition holds. */
export function goalRuns(goal: RoutineGoal, truths: ReadonlySet<string>): boolean {
  return !hasCondition(goal.condition) || truths.has(goal.condition!.trim());
}

export interface RoutineIssue {
  /** Where the issue is, for highlighting: the day, and the goal within it. */
  day?: RoutineDayRef;
  goalIndex?: number;
  message: string;
}

export interface RoutineReferences {
  maps: GameMap[];
  dialogueIds: ReadonlySet<string>;
  characterIds: ReadonlySet<string>;
  /** Animation IDs exported by Unity, or null when the Lua manifest is not loaded. */
  animationIds: ReadonlySet<string> | null;
  /** Other routines, to catch a second routine for one character. */
  otherRoutines: Routine[];
}

/** Everything that stops Unity from importing the routine or would fail its catalog refresh. */
export function validateRoutine(routine: Routine, references?: RoutineReferences): RoutineIssue[] {
  const issues: RoutineIssue[] = [];
  const checkPlace = (
    place: RoutinePlace,
    where: string,
    day?: RoutineDayRef,
    goalIndex?: number,
    allowEntity = false,
  ) => {
    if (!place.map || !!place.anchor === !!place.entity || (place.entity && !allowEntity)) {
      issues.push({
        day,
        goalIndex,
        message: `${where} needs a map and an anchor${allowEntity ? ' or an entity' : ''}.`,
      });
      return;
    }
    if (!references) return;
    const map = references.maps.find((entry) => entry.id === place.map);
    if (!map)
      issues.push({ day, goalIndex, message: `${where} uses the unknown map ${place.map}.` });
    else if (place.entity) {
      if (!mapEntities(map).some((entity) => entity.id === place.entity))
        issues.push({
          day,
          goalIndex,
          message: `${where} uses the entity ${place.entity}, which ${map.name} does not have.`,
        });
    } else if (!map.spatialPrimitives?.anchors?.some((anchor) => anchor.id === place.anchor))
      issues.push({
        day,
        goalIndex,
        message: `${where} uses the anchor ${place.anchor}, which ${map.name} does not have.`,
      });
  };

  if (references) {
    if (!references.characterIds.has(routine.character))
      issues.push({ message: `The character ${routine.character} does not exist.` });
    const twin = references.otherRoutines.find(
      (other) => other.id !== routine.id && other.character === routine.character,
    );
    if (twin) issues.push({ message: `${routine.character} already has the routine ${twin.id}.` });
  }
  checkPlace(routine.home, 'Home');
  const checkDialogue = (
    id: string | null | undefined,
    where: string,
    day?: RoutineDayRef,
    goalIndex?: number,
  ) => {
    if (id && references && !references.dialogueIds.has(id))
      issues.push({ day, goalIndex, message: `${where} uses the unknown dialogue ${id}.` });
  };
  checkDialogue(routine.dialogue, 'The start of the day');

  const checkGoals = (goals: RoutineGoal[], day: RoutineDayRef) => {
    const ids = new Set<string>();
    let previous = -1;
    // Each goal's map must be reachable through location links from where the character comes from.
    let from = routine.home;
    goals.forEach((goal, goalIndex) => {
      const to = resolvePlace(routine, goal.destination);
      // Unknown maps are reported on their own.
      const known = (mapId: string) => references?.maps.some((map) => map.id === mapId);
      if (
        references &&
        known(from.map) &&
        known(to.map) &&
        !canReachMap(references.maps, from.map, to.map)
      )
        issues.push({
          day,
          goalIndex,
          message: `${goal.id || `Goal ${goalIndex + 1}`} goes to ${to.map}, but no location links lead there from ${from.map}.`,
        });
      from = to;
    });
    goals.forEach((goal, goalIndex) => {
      const name = goal.id || `Goal ${goalIndex + 1}`;
      const at = (message: string) => issues.push({ day, goalIndex, message });
      if (!LOCAL_ID_PATTERN.test(goal.id))
        at(`${name} needs an ID of lowercase letters, digits, _ . or -.`);
      else if (ids.has(goal.id)) at(`The goal ID ${goal.id} is used twice in this day.`);
      ids.add(goal.id);
      if (!TIME_PATTERN.test(goal.departAt)) at(`${name} needs a departure time (HH:MM).`);
      else {
        const minutes = minutesOf(goal.departAt);
        if (minutes <= previous) at(`${name} must leave after the goal before it.`);
        previous = Math.max(previous, minutes);
      }
      if (goal.condition !== undefined && !goal.condition.trim())
        at(`${name} is only on some days but has no condition yet.`);
      if (goal.destination !== 'home') checkPlace(goal.destination, name, day, goalIndex, true);
      if (goal.destination !== 'home' && goal.destination.entity && goal.activity)
        at(`${name} sits at a slot, which supplies the animation: remove its activity.`);
      checkDialogue(goal.walkingDialogue, `${name} (walking)`, day, goalIndex);
      checkDialogue(goal.dialogue, name, day, goalIndex);
      if (goal.occupation !== undefined && !LOCAL_ID_PATTERN.test(goal.occupation))
        at(`${name} needs an occupation of lowercase letters, digits, _ . or -.`);
      if (goal.activity && !goal.activity.animation.trim())
        at(`${name} has an activity without an animation.`);
      else if (
        goal.activity &&
        references?.animationIds &&
        !references.animationIds.has(goal.activity.animation)
      )
        at(`${name} uses the unknown animation ${goal.activity.animation}.`);
    });
  };

  const entryIds = new Set<string>();
  const checkId = (id: string, day: RoutineDayRef, label: string) => {
    if (!LOCAL_ID_PATTERN.test(id))
      issues.push({ day, message: `${label} needs an ID of lowercase letters, digits, _ . or -.` });
    else if (entryIds.has(id))
      issues.push({ day, message: `The ID ${id} is used by more than one day.` });
    entryIds.add(id);
  };

  for (const list of ['overrides', 'variants'] as const) {
    const entries = entriesOf(routine, list);
    const fallback = list === 'variants' ? fallbackIndex(entries) : -1;
    entries.forEach((entry, entryIndex) => {
      const day: RoutineDayRef = { list, entryIndex, choiceIndex: null };
      checkId(entry.id, day, `Day ${entryIndex + 1}`);
      if (list === 'overrides' && !hasCondition(entry.condition))
        issues.push({
          day,
          message: `The override ${entry.id} needs a condition; without one it replaces every day.`,
        });
      if (fallback >= 0 && entryIndex > fallback)
        issues.push({
          day,
          message: `${entry.id} can never be chosen: ${entries[fallback].id} before it has no condition.`,
        });
      if (entry.pickOne) {
        if (!entry.pickOne.length)
          issues.push({ day, message: `The pool ${entry.id} has no members.` });
        entry.pickOne.forEach((choice, choiceIndex) => {
          const member: RoutineDayRef = { list, entryIndex, choiceIndex };
          checkId(choice.id, member, `Member ${choiceIndex + 1}`);
          if (choice.weight !== undefined && !(Number.isFinite(choice.weight) && choice.weight > 0))
            issues.push({ day: member, message: `${choice.id} needs a weight above 0.` });
          checkGoals(choice.goals, member);
        });
      } else checkGoals(entry.goals ?? [], day);
    });
    if (list === 'variants') {
      if (!entries.length) issues.push({ message: 'A routine needs at least one ordinary day.' });
      else if (fallback < 0)
        issues.push({
          message: 'One ordinary day needs no condition, so every day has a routine.',
        });
    }
  }
  return issues;
}

export interface GoalDialogues {
  /** The dialogue while walking to the goal, and whether the goal sets it or keeps the one before. */
  walking: GoalDialogue;
  /** The dialogue once arrived. */
  there: GoalDialogue;
}

/** `id` is null when there is none; `silent` when the routine explicitly has nothing to say. */
export interface GoalDialogue {
  id: string | null;
  silent: boolean;
  inherited: boolean;
}

/**
 * What talking to the character starts during each goal, like Unity's DayPlan.DialogueAt: the newest dialogue the
 * day has set so far, starting from the routine's own. Goals the preview skips set nothing and get null.
 */
export function goalDialogues(
  routine: Routine,
  goals: readonly RoutineGoal[],
  preview: ReadonlySet<string> | null,
): (GoalDialogues | null)[] {
  const phase = (
    set: string | null | undefined,
    before: { id: string | null; silent: boolean },
  ): GoalDialogue =>
    set === undefined
      ? { ...before, inherited: true }
      : { id: set, silent: set === null, inherited: false };
  let current: { id: string | null; silent: boolean } = {
    id: routine.dialogue ?? null,
    silent: routine.dialogue === null,
  };
  return goals.map((goal) => {
    if (preview && !goalRuns(goal, preview)) return null;
    const walking = phase(goal.walkingDialogue, current);
    const there = phase(goal.dialogue, walking);
    current = there;
    return { walking, there };
  });
}

/** A local ID not yet used by any day of the routine, such as `day-2`. */
export function unusedDayId(routine: Routine, base: string): string {
  const used = new Set(
    [...(routine.overrides ?? []), ...routine.variants].flatMap((entry) => [
      entry.id,
      ...(entry.pickOne ?? []).map((choice) => choice.id),
    ]),
  );
  return unusedId(used, base);
}

export function unusedId(used: ReadonlySet<string>, base: string): string {
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The routine file written for a character that has none yet. */
export function newRoutine(
  id: string,
  character: string,
  home: RoutinePlace,
  folderPath: string,
): Routine {
  return {
    formatVersion: 1,
    id,
    character,
    home,
    variants: [{ id: 'default', goals: [] }],
    folderPath,
  };
}
