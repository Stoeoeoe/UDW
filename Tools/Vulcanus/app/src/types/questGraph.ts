import type { CutsceneData, CutsceneVariable } from './cutscene';
import type { CutsceneGraphEdge } from './cutsceneGraph';

/** Authoring graph. Saving compiles it to the existing quest runtime fields. */
export interface QuestGraphNode {
  id: string;
  kind:
    | 'entry'
    | 'exit'
    | 'failure'
    | 'step'
    | 'action'
    | 'lua'
    | 'branch'
    | 'function'
    | 'expression';
  position: { x: number; y: number };
  stepId?: string;
  group?: boolean;
  comment?: string;
  action?: { method: string; arguments: Record<string, CutsceneData> };
  /** Lua: the script. Branch: the condition. */
  code?: string;
  /** Function: the read-only Lua call, such as `GameState.Story.Has`. */
  method?: string;
  /** Function and Branch: the inputs that are not wired; a Branch has `condition`. */
  arguments?: Record<string, CutsceneData>;
  /** Expression: one read-only Lua expression and its single typed output. */
  expression?: string;
  outputs?: { name: string; type: CutsceneVariable['type']; nullable?: boolean }[];
}
export interface QuestGraph {
  nodes: QuestGraphNode[];
  edges: CutsceneGraphEdge[];
}
