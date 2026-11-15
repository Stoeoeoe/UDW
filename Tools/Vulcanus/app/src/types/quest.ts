export interface QuestObjectiveBase {
  id: string;
  text: string;
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
  steps: QuestStep[];
  folderPath?: string;
}
export interface QuestI18n {
  questId: string;
  messages: { msgKey: string; text: string }[];
}
