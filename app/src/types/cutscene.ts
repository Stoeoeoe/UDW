export interface CutsceneStep {
  id: string;
  action: string;
  arguments: Record<
    string,
    | string
    | number
    | import('../lib/mapPosition').PositionArgument
    | import('../lib/mapPosition').PathArgument
  >;
}

/** Unity source contract. Display labels belong to editor state, never this object. */
export type CompletionPlacement = { character: string } & (
  | { anchor: string; position?: never }
  | { position: import('../lib/mapPosition').MapPosition | ''; anchor?: never }
);

export interface Cutscene {
  $schema: string;
  formatVersion: 2;
  id: string;
  mapId: string;
  allowSkip: boolean;
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
