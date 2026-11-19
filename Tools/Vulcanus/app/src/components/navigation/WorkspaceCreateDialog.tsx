import React from 'react';
import { useToast } from '@chakra-ui/react';
import { WorkspaceDocument, WorkspaceTreeNode } from '../../types/workspace';
import { CreateNewResourceDialog } from './WorkspaceContextMenu';
import {
  getEditorResourceCreateFlow,
  createEditorResourceDocument,
} from '../../lib/editorResourceTypes';
import { useEditorStore } from '../../store/useEditorStore';
import type { MetadataDraft } from '../screens/dialogue/dialogueUtils';
import { GuidedMapCreationDialog } from '../dialogs/GuidedMapCreationDialog';
import { CreateTilesetDialog } from '../screens/tileset/CreateTilesetDialog';
import { CreateDialogueDialog } from '../screens/dialogue/CreateDialogueDialog';
import { createDialogue } from '../screens/dialogue/createDialogue';
import { CreateQuestDialog } from '../screens/quest/CreateQuestDialog';
import { CreateRoutineDialog } from '../screens/routine/CreateRoutineDialog';
import { ImportCueDialog } from '../screens/music/ImportCueDialog';

export type CreateDialogState = {
  kind: NonNullable<WorkspaceTreeNode['resourceKind']>;
  folderPath: string;
} | null;

export const WorkspaceCreateDialog: React.FC<{
  state: CreateDialogState;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ state, onClose, onOpenDocument }) => {
  const toast = useToast();
  const projectDialogueTypes = useEditorStore((s) => s.project?.dialogueTypes);
  const dialogueTypes = projectDialogueTypes ?? [];

  const handleCreateDialogue = React.useCallback(
    async (values: MetadataDraft, folderPath: string) => {
      const dialogue = await createDialogue(values, folderPath);
      useEditorStore.setState((draft) => {
        draft.selectedDialogueId = dialogue.id;
        draft.selectedDialogueNodeId = dialogue.startNodeId;
      });
      onOpenDocument(
        createEditorResourceDocument({ type: 'dialogue', id: dialogue.id, name: dialogue.name }),
        { pin: true },
      );
      onClose();
    },
    [onClose, onOpenDocument],
  );

  if (!state) return null;

  const createFlow = getEditorResourceCreateFlow(state.kind);

  if (createFlow === 'location') {
    return (
      <GuidedMapCreationDialog
        isOpen
        onClose={onClose}
        folderPath={state.folderPath}
        onCreatedMapId={(mapId) => {
          const map = useEditorStore.getState().maps.find((entry) => entry.id === mapId);
          if (!map) return;
          onOpenDocument(
            createEditorResourceDocument({ type: 'location', id: map.id, name: map.name }),
            { pin: true },
          );
        }}
      />
    );
  }

  if (createFlow === 'tileset') {
    return (
      <CreateTilesetDialog
        isOpen
        onClose={onClose}
        folderPath={state.folderPath}
        onCreatedTilesetId={(tilesetId) => {
          const tileset = useEditorStore.getState().tilesets.get(tilesetId);
          if (!tileset) return;
          onOpenDocument(
            createEditorResourceDocument({ type: 'tileset', id: tileset.id, name: tileset.name }),
            { pin: true },
          );
        }}
      />
    );
  }

  if (createFlow === 'quest') {
    return (
      <CreateQuestDialog
        folderPath={state.folderPath}
        onClose={onClose}
        onCreated={(id, name) =>
          onOpenDocument(createEditorResourceDocument({ type: 'quest', id, name }), { pin: true })
        }
      />
    );
  }
  if (createFlow === 'routine') {
    return (
      <CreateRoutineDialog
        folderPath={state.folderPath}
        onClose={onClose}
        onCreated={(id, name) =>
          onOpenDocument(createEditorResourceDocument({ type: 'routine', id, name }), { pin: true })
        }
      />
    );
  }

  if (createFlow === 'music') {
    return (
      <ImportCueDialog
        isOpen
        onClose={onClose}
        onImported={(cueId) => {
          onOpenDocument(
            createEditorResourceDocument({ type: 'music', id: cueId, name: cueId }),
            { pin: true },
          );
          onClose();
        }}
      />
    );
  }

  if (createFlow === 'dialogue') {
    return (
      <CreateDialogueDialog
        isOpen
        onClose={onClose}
        mode="create"
        initialValues={{ name: '', oneShot: false, dialogueTypeId: '' }}
        onApply={(values) => {
          void handleCreateDialogue(values, state.folderPath).catch((error) => {
            toast({
              title: 'Create dialogue failed',
              description: error instanceof Error ? error.message : 'Unknown error',
              status: 'error',
            });
          });
        }}
        dialogueTypes={dialogueTypes}
      />
    );
  }

  return (
    <CreateNewResourceDialog
      kind={state.kind as 'character' | 'entity' | 'item' | 'shop' | 'cutscene'}
      folderPath={state.folderPath}
      onClose={onClose}
      onOpenDocument={onOpenDocument}
    />
  );
};
