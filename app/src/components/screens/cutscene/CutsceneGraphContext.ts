import { createContext } from 'react';
import type { Cutscene, CutsceneAction } from '../../../types/cutscene';
import type { CutsceneGraphNode } from '../../../types/cutsceneGraph';
import type { ScriptingResources } from '../../../lib/scriptingManifest';
import type { LuaArgumentReferences } from '../../../lib/luaBindings';

export const GraphEditingContext = createContext<{
  scene: Cutscene;
  actions: CutsceneAction[];
  resources: ScriptingResources;
  phase: 'setup' | 'sequence' | 'completion';
  characterReferences: { id: string; name: string }[];
  argumentReferences: LuaArgumentReferences;
  change: (id: string, change: (node: CutsceneGraphNode) => void) => void;
  spatial: (id: string, parameter: string, type: 'position' | 'path') => void;
}>({} as never);
