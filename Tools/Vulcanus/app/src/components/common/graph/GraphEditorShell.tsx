import './GraphEditor.css';
import '@xyflow/react/dist/style.css';
import type { ReactNode } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { GraphEditorToolbar } from './GraphEditorToolbar';
import { GraphNodePicker, type GraphChoice } from './GraphNodePicker';
import type { useGraphEditor } from './useGraphEditor';

/** One toolbar, focus boundary, context picker and canvas surface for both graph editors. */
export function GraphEditorShell<T extends GraphChoice>({
  editor,
  choices,
  onInsert,
  canPaste,
  children,
}: {
  editor: ReturnType<typeof useGraphEditor>;
  choices: T[];
  onInsert: (choice: T) => void;
  canPaste: boolean;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" h="full" minH={0}>
      <GraphEditorToolbar
        disabled={editor.disabled}
        selection={editor.hasEditableSelection}
        canPaste={canPaste}
        run={editor.command}
      />
      <Box ref={editor.root} {...editor.rootProps} className="cutscene-graph-canvas" flex={1}>
        {children}
        {editor.picker && (
          <GraphNodePicker
            key={`${editor.picker.x}:${editor.picker.y}:${editor.picker.from?.nodeId ?? ''}`}
            x={editor.picker.x}
            y={editor.picker.y}
            choices={choices}
            onInsert={onInsert}
            onClose={() => editor.setPicker(undefined)}
          />
        )}
      </Box>
    </Flex>
  );
}
