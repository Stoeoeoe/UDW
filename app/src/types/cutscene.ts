export interface CutsceneStep {
  id: string;
  action: string;
  arguments: Record<string, string | number | import('../lib/mapPosition').PositionArgument>;
}

/** Unity source contract. Display labels belong to editor state, never this object. */
export interface Cutscene {
  $schema: string;
  formatVersion: 2;
  id: string;
  mapId: string;
  allowSkip: boolean;
  onStart?: CutsceneStep[];
  onComplete: {
    steps: CutsceneStep[];
    actorPlacements: { actor: string; anchor: string }[];
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
