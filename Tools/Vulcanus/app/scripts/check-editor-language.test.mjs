import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEditorSource, checkWorkspaceEntry } from './check-editor-language.mjs';

test('graph editors share their shell and interaction controller', () => {
  const filename = 'src/components/screens/quest/QuestGraphCanvas.tsx';
  assert.equal(checkEditorSource(filename, '<Canvas onPaneContextMenu={handler} />').length, 3);
  assert.deepEqual(
    checkEditorSource(
      filename,
      'import {GraphEditorShell} from "../../common/graph/GraphEditorShell"; import {useGraphEditor} from "../../common/graph/useGraphEditor"; const view = <GraphEditorShell><GraphCanvas {...editor.canvasProps}/></GraphEditorShell>;',
    ),
    [],
  );
});

test('shared cards accept content but reject visual overrides, aliases and spreads', () => {
  assert.deepEqual(
    checkEditorSource(
      'src/components/screens/quest/QuestEditor.tsx',
      '<SequenceCard selected={true} label="Step">Bring wine</SequenceCard>',
    ),
    [],
  );
  assert.equal(
    checkEditorSource(
      'screens/QuestEditor.tsx',
      'import {SequenceCard as Card} from "../../common/SequenceEditor"; const view = <Card bg="pink" {...props} />;',
    ).length,
    2,
  );
});
test('editors cannot add local history controls or decorative surface gradients', () => {
  assert.equal(
    checkEditorSource(
      'screens/QuestEditor.tsx',
      '<><Button aria-label="Undo"/><Button>Redo</Button><Box bgGradient="pink" /></>',
    ).length,
    3,
  );
});
test('the workspace owns the mandatory frame and keeps its document body private', () => {
  assert.deepEqual(
    checkWorkspaceEntry(
      'const view = <EditorDocumentFrame><WorkspaceDocumentContent tab={tab}/></EditorDocumentFrame>;',
    ),
    [],
  );
  assert.equal(
    checkWorkspaceEntry(
      'export const WorkspaceDocumentContent = () => null; const view = <Box><WorkspaceDocumentContent /></Box>;',
    ).length,
    2,
  );
  assert.equal(
    checkEditorSource('src/components/screens/quest/QuestEditor.tsx', '<EditorDocumentFrame />')
      .length,
    1,
  );
});
