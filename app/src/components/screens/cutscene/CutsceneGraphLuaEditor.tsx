import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { LuaScriptEditor, type LuaScriptEditorProps } from '../scripting/LuaScriptEditor';
import { useEditorStore } from '../../../store/useEditorStore';

// Ship the editor and worker with Vulcanus; graph authoring must work offline.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export default function CutsceneGraphLuaEditor(props: LuaScriptEditorProps) {
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  return (
    <LuaScriptEditor
      fixedOverflowWidgets={false}
      gameVariables={gameVariables}
      scriptTables={scriptTables}
      scriptFunctions={scriptFunctions}
      scriptNamespaces={scriptNamespaces}
      {...props}
    />
  );
}
