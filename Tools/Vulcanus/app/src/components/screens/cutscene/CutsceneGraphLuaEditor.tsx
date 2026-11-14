import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import { LuaScriptEditor, type LuaScriptEditorProps } from '../scripting/LuaScriptEditor';

// Ship the editor and worker with Vulcanus; graph authoring must work offline.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export default function CutsceneGraphLuaEditor(props: LuaScriptEditorProps) {
  return (
    <LuaScriptEditor
      fixedOverflowWidgets={false}
      {...props}
    />
  );
}
