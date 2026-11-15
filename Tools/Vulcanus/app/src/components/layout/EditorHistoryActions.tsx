import React from 'react';
import { HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { FiCornerUpLeft, FiCornerUpRight } from 'react-icons/fi';
import {
  runEditorHistoryCommand,
  useEditorHistory,
  useEditorStore,
  type EditorStore,
} from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { WorkspaceDocument } from '../../types/workspace';

function documentHistoryDepth(
  state: EditorStore,
  document: WorkspaceDocument | undefined,
  direction: 'past' | 'future',
): number {
  switch (document?.kind) {
    case 'quest':
      return (
        (direction === 'past' ? state.questPast : state.questFuture)[document.questId]?.length ?? 0
      );
    case 'shop':
      return (
        (direction === 'past' ? state.shopPast : state.shopFuture)[document.shopId]?.length ?? 0
      );
    case 'routine':
      return (
        (direction === 'past' ? state.routinePast : state.routineFuture)[document.routineId]
          ?.length ?? 0
      );
    case 'cutscene':
      return (
        (direction === 'past' ? state.cutscenePast : state.cutsceneFuture)[document.cutsceneId]
          ?.length ?? 0
      );
    default:
      return 0;
  }
}

/** One command location for the active document; unsupported histories are visibly disabled. */
export function EditorHistoryActions() {
  const document = useWorkspaceStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.document,
  );
  const past = useEditorStore((s) => documentHistoryDepth(s, document, 'past'));
  const future = useEditorStore((s) => documentHistoryDepth(s, document, 'future'));
  const mapUndo = useEditorHistory((s) => s.pastStates.length > 0);
  const mapRedo = useEditorHistory((s) => s.futureStates.length > 0);
  return (
    <HStack spacing={1} aria-label="Document history">
      <Tooltip label="Undo (Ctrl/Cmd+Z)">
        <IconButton
          aria-label="Undo"
          size="sm"
          variant="ghost"
          icon={<FiCornerUpLeft />}
          isDisabled={document?.kind === 'location' ? !mapUndo : !past}
          onClick={() => runEditorHistoryCommand('undo')}
        />
      </Tooltip>
      <Tooltip label="Redo (Ctrl/Cmd+Shift+Z)">
        <IconButton
          aria-label="Redo"
          size="sm"
          variant="ghost"
          icon={<FiCornerUpRight />}
          isDisabled={document?.kind === 'location' ? !mapRedo : !future}
          onClick={() => runEditorHistoryCommand('redo')}
        />
      </Tooltip>
    </HStack>
  );
}
