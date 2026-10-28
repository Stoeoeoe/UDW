export interface CutsceneStep {
  id: string;
  action: string;
  arguments: Record<
    string,
    | string
    | number
    | boolean
    | { [key: string]: import('../lib/storyValues').StoryData }
    | null
    | import('../lib/mapPosition').PositionArgument
    | import('../lib/mapPosition').PathArgument
  >;
  /** Only control.if has paths. Paths contain ordinary action steps in this first version. */
  then?: CutsceneStep[];
  else?: CutsceneStep[];
  /** Parallel tracks run ordinary actions sequentially and join at the end of the block. */
  tracks?: CutsceneStep[][];
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
  onStart?: CutsceneStep[];
  onComplete: {
    steps: CutsceneStep[];
    characterPlacements: CompletionPlacement[];
  };
  sequence: CutsceneStep[];
}

export type CutsceneAction = import('../lib/scriptingManifest').ScriptingAction;

export interface CutsceneDiagnostic {
  phase?: 'setup' | 'sequence' | 'completion';
  path: string;
  message: string;
  stepId?: string;
}
