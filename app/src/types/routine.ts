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
  overrides?: RoutineEntry[];
  variants: RoutineEntry[];
  folderPath?: string;
}

export type RoutineList = 'overrides' | 'variants';
