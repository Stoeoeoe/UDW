export type CutsceneData =
  | string
  | number
  | boolean
  | null
  | { [key: string]: CutsceneData }
  | CutsceneData[];
export interface CutsceneStep {
  id: string;
  action: string;
  arguments: Record<string, CutsceneData>;
  /** Only control.if has paths. Paths contain ordinary action steps in this first version. */
  then?: CutsceneStep[];
  else?: CutsceneStep[];
  /** Parallel tracks run ordinary actions sequentially and join at the end of the block. */
  tracks?: CutsceneStep[][];
  argumentVariables?: Record<string, string>;
  resultVariables?: (string | null)[];
}

export const CUTSCENE_CONDITION_ACTION = 'control.if';
export const isConditionalStep = (step: CutsceneStep) => step.action === CUTSCENE_CONDITION_ACTION;
export const CUTSCENE_PARALLEL_ACTION = 'control.parallel';
export const isParallelStep = (step: CutsceneStep) => step.action === CUTSCENE_PARALLEL_ACTION;

/** Unity source contract. Display labels belong to editor state, never this object. */
export type CompletionFacing = 'preserve' | 'North' | 'East' | 'South' | 'West';
export type CompletionPlacement = { character: string; facing?: CompletionFacing } & (
  | { anchor: string; position?: never }
  | { position: import('../lib/mapPosition').MapPosition | ''; anchor?: never }
);

export interface CutsceneTransition {
  enabled: boolean;
}

export const DEFAULT_CUTSCENE_TRANSITION: Readonly<CutsceneTransition> = {
  enabled: true,
};

export interface Cutscene {
  $schema: string;
  formatVersion: 2;
  id: string;
  mapId: string;
  allowSkip: boolean;
  transition?: CutsceneTransition;
  variables?: CutsceneVariable[];
  onStart?: CutsceneStep[];
  onComplete: {
    steps: CutsceneStep[];
    characterPlacements: CompletionPlacement[];
  };
  sequence: CutsceneStep[];
}

export interface CutsceneVariable {
  name: string;
  type: 'boolean' | 'number' | 'string' | 'position' | 'path' | 'table' | 'storyValue';
  initialValue: unknown;
  nullable?: boolean;
}

export type CutsceneAction = import('../lib/scriptingManifest').ScriptingAction;

export interface CutsceneDiagnostic {
  phase?: 'setup' | 'sequence' | 'completion';
  path: string;
  message: string;
  stepId?: string;
}
