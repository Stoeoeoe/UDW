import type { CutsceneData } from './cutscene';
import type { CutsceneGraphEdge } from './cutsceneGraph';

/** Authoring graph. Saving compiles it to the existing quest runtime fields. */
export interface QuestGraphNode {
  id: string;
  kind: 'entry' | 'exit' | 'failure' | 'step' | 'action' | 'lua';
  position: { x: number; y: number };
  stepId?: string;
  group?: boolean;
  comment?: string;
  action?: { method: string; arguments: Record<string, CutsceneData> };
  code?: string;
}
export interface QuestGraph {
  nodes: QuestGraphNode[];
  edges: CutsceneGraphEdge[];
}
