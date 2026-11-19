/** An NPC's daily routine (*.routine.json). See schemas/routine.schema.json. */

export interface RoutinePlace {
  map: string;
  anchor: string;
}

export interface RoutineGoal {
  id: string;
  /** Time of day the character sets off, HH:MM. */
  departAt: string;
  condition?: string;
  destination: 'home' | RoutinePlace;
  activity?: { animation: string };
  /** Dialogue while walking here; absent keeps the dialogue in effect before, null means nothing to say. */
  walkingDialogue?: string | null;
  /** Dialogue once arrived; absent keeps the dialogue in effect before, null means nothing to say. */
  dialogue?: string | null;
}

export interface RoutineChoice {
  id: string;
  condition?: string;
  /** Relative chance; 1 when absent. */
  weight?: number;
  goals: RoutineGoal[];
}

/** Either fixed `goals` or a `pickOne` pool, never both. */
export interface RoutineEntry {
  id: string;
  condition?: string;
  goals?: RoutineGoal[];
  pickOne?: RoutineChoice[];
}

export interface Routine {
  formatVersion: 1;
  id: string;
  character: string;
  home: RoutinePlace;
  /**
   * Dialogue at the start of each day, until a goal sets another. Absent leaves the character's own dialogues; null
   * means nothing to say, which also silences them.
   */
  dialogue?: string | null;
  overrides?: RoutineEntry[];
  variants: RoutineEntry[];
  folderPath?: string;
}

export type RoutineList = 'overrides' | 'variants';
