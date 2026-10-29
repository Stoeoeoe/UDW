import type { CutsceneData, CutsceneStep, CutsceneVariable } from './cutscene';

export type CutscenePhase = 'onStart' | 'sequence' | 'completion';
export interface CutsceneGraphNode {
  id: string;
  kind:
    | 'entry'
    | 'exit'
    | 'action'
    | 'function'
    | 'variable'
    | 'position'
    | 'expression'
    | 'lua'
    | 'branch'
    | 'parallel'
    | 'join';
  method?: string;
  position: { x: number; y: number };
  step?: CutsceneStep;
  variable?: string;
  expression?: string;
  arguments?: Record<string, CutsceneData>;
  outputs?: { name: string; type: CutsceneVariable['type']; nullable?: boolean }[];
  resultVariables?: (string | null)[];
  /** The explicit matching convergence node; join nodes point back to their control. */
  pair?: string;
  tracks?: number;
}
export interface CutsceneGraphEdge {
  id: string;
  source: string;
  sourcePin: string;
  target: string;
  targetPin: string;
  kind: 'execution' | 'data';
}
export interface CutsceneGraph {
  nodes: CutsceneGraphNode[];
  edges: CutsceneGraphEdge[];
}
