import { Box, Text } from '@chakra-ui/react';
import {
  FiPlus,
  FiTrash2,
  FiCopy,
  FiClipboard,
  FiGrid,
  FiMaximize,
  FiHelpCircle,
} from 'react-icons/fi';
import { ToolbarShell, ToolbarToggleButton } from '../Toolbar';

export type GraphCommand =
  | 'add'
  | 'delete'
  | 'copy'
  | 'duplicate'
  | 'paste'
  | 'layout'
  | 'fit'
  | 'undo'
  | 'redo';

export function GraphEditorToolbar({
  disabled,
  selection,
  canPaste,
  run,
}: {
  disabled: boolean;
  selection: boolean;
  canPaste: boolean;
  run: (command: GraphCommand) => void;
}) {
  return (
    <ToolbarShell
      role="toolbar"
      aria-label="Graph tools"
      rounded="none"
      boxShadow="none"
      borderWidth="0 0 1px"
      flexShrink={0}
      px={3}
    >
      <ToolbarToggleButton
        label="Add node"
        icon={<FiPlus />}
        isDisabled={disabled}
        onClick={() => run('add')}
      />
      <Box w="1px" h={4} bg="editorBorderSubtle" mx={1} />
      <ToolbarToggleButton
        label="Duplicate selection (Ctrl/Cmd+D)"
        icon={<FiCopy />}
        isDisabled={disabled || !selection}
        onClick={() => run('duplicate')}
      />
      <ToolbarToggleButton
        label="Paste (Ctrl/Cmd+V)"
        icon={<FiClipboard />}
        isDisabled={disabled || !canPaste}
        onClick={() => run('paste')}
      />
      <ToolbarToggleButton
        label="Delete selection"
        icon={<FiTrash2 />}
        colorScheme="red"
        isDisabled={disabled || !selection}
        onClick={() => run('delete')}
      />
      <Box w="1px" h={4} bg="editorBorderSubtle" mx={1} />
      <ToolbarToggleButton
        label="Auto layout"
        icon={<FiGrid />}
        isDisabled={disabled}
        onClick={() => run('layout')}
      />
      <ToolbarToggleButton label="Fit view (F)" icon={<FiMaximize />} onClick={() => run('fit')} />
      <Text fontSize="10px" color="editorMutedText" ml={2} flex={1} minW={0} noOfLines={1}>
        Drop an action onto an execution wire to insert it
      </Text>
      <ToolbarToggleButton
        label="Shortcuts: Ctrl/Cmd+A select all · C/V copy/paste · D duplicate · Z undo · Shift+Z redo · Delete remove · F fit · Shift+L layout · Shift+drag select · Escape clear"
        icon={<FiHelpCircle />}
      />
    </ToolbarShell>
  );
}
