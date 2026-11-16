import { createContext } from 'react';
import type { Cutscene, CutsceneAction } from '../../../types/cutscene';
import type { CutsceneGraphNode } from '../../../types/cutsceneGraph';
import type { ScriptingResources } from '../../../lib/scriptingManifest';
import type { LuaArgumentReferences } from '../../../lib/luaBindings';

export const GraphEditingContext = createContext<{
  scene: Pick<Cutscene, 'id' | 'variables'>;
  actions: CutsceneAction[];
  resources: ScriptingResources;
  phase: 'setup' | 'sequence' | 'completion';
  /** Immediate quest calls use literal parameters, without transient cutscene data wiring. */
  executionOnly?: boolean;
  /** The context Lua is checked in; cutscene by default. */
  luaContext?: string;
  characterReferences: { id: string; name: string }[];
  argumentReferences: LuaArgumentReferences;
  change: (id: string, change: (node: CutsceneGraphNode) => void) => void;
  spatial: (id: string, parameter: string, type: 'position' | 'path') => void;
}>({} as never);
