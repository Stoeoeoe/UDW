import React from 'react';
import { useToast } from '@chakra-ui/react';
import { WorkspaceDocument, WorkspaceTreeNode } from '../../types/workspace';
import { CreateNewResourceDialog } from './WorkspaceContextMenu';
import {
  getEditorResourceCreateFlow,
  createEditorResourceDocument,
} from '../../lib/editorResourceTypes';
import { fileSystem } from '../../lib/fileSystem';
import { useEditorStore } from '../../store/useEditorStore';
import { saveDialogueImmediate } from '../../lib/saveManager';
import {
  buildI18nExport,
  createEmptyDialogue,
  nextDialogueId,
  slugify,
  toRuntimeDialogue,
  type MetadataDraft,
} from '../screens/dialogue/dialogueUtils';
import { MapCreator } from '../dialogs/MapCreator';
import { CreateTilesetDialog } from '../screens/tileset/CreateTilesetDialog';
import { CreateDialogueDialog } from '../screens/dialogue/CreateDialogueDialog';
import { EditorModal } from '../common/EditorModal';

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
      const state = useEditorStore.getState();
      const derived = slugify(values.name);
      const candidateId = derived ? `dlg_${derived}` : nextDialogueId(state.dialogues.values());
      const dialogueId = state.dialogues.has(candidateId)
        ? nextDialogueId(state.dialogues.values())
        : candidateId;
      const dialogue = createEmptyDialogue(
        dialogueId,
        values.name.trim(),
        values.oneShot,
        values.dialogueTypeId,
      );
      dialogue.folderPath = folderPath || undefined;

      useEditorStore.setState((draft) => {
        draft.dialogues.set(dialogue.id, dialogue);
        draft.selectedDialogueId = dialogue.id;
        draft.selectedDialogueNodeId = dialogue.startNodeId;
      });

      await saveDialogueImmediate(dialogue);
      await fileSystem.saveJson(
        'dialogues',
        `${dialogue.id}.runtime.dialogue.json`,
        toRuntimeDialogue(dialogue),
      );
      await fileSystem.saveJson('dialogues', `${dialogue.id}.i18n.json`, buildI18nExport(dialogue));
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
      <EditorModal isOpen onClose={onClose}>
        <MapCreator
          onCreate={onClose}
          onCancel={onClose}
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
      </EditorModal>
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
      kind={state.kind as 'actor' | 'entity' | 'item'}
      folderPath={state.folderPath}
      onClose={onClose}
      onOpenDocument={onOpenDocument}
    />
  );
};
