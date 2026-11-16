export interface QuestObjectiveBase {
  id: string;
  text: string;
  /** Meeting this objective completes the step at once and continues at this step ID, or `end`. */
  next?: string;
}
export type QuestObjective = QuestObjectiveBase &
  (
    | { kind: 'talk'; character: string; dialogue?: string }
    | { kind: 'deliver'; character: string; item: string; count: number; dialogue?: string }
    | { kind: 'have'; item: string; count: number }
    | { kind: 'reach'; map: string; trigger?: string }
    | { kind: 'condition'; condition: string }
  );
export interface QuestStep {
  id: string;
  journal: string;
  objectives: QuestObjective[];
  deadline?: { days: number; at?: string };
  failWhen?: string;
  onComplete?: string;
  /** Where the quest continues when no branching objective completes the step: a step ID or `end`. */
  next?: string;
  /** Checked in order when the step completes without a branching objective; the first that holds decides. */
  nextIf?: { condition: string; next: string }[];
}
export type QuestSeason = 'spring' | 'summer' | 'autumn' | 'winter';
/** A moment at which a quest is considered for starting by itself. */
export type QuestStartMoment =
  | { on: 'gameStart' }
  | { on: 'newDay' }
  | { on: 'newSeason'; season?: QuestSeason }
  | { on: 'everyTenMinutes' }
  | { on: 'divineFavour'; deity?: string; atLeast?: number }
  | { on: 'locationChanged'; map?: string };
export interface QuestStart {
  /** The quest starts at any of these moments if it never has and the condition holds. */
  when: QuestStartMoment[];
  /** Read-only Lua expression. Without it the moment alone starts the quest. */
  condition?: string;
}
export interface Quest {
  $schema?: string;
  formatVersion: 1;
  id: string;
  title: string;
  description: string;
  giver?: string;
  onStart?: string;
  onComplete?: string;
  onFail?: string;
  start?: QuestStart;
  steps: QuestStep[];
  folderPath?: string;
  /** Editor source; compiled into steps and lifecycle Lua when saved. */
  editorGraph?: import('./questGraph').QuestGraph;
}
export interface QuestI18n {
  questId: string;
  messages: { msgKey: string; text: string }[];
}
