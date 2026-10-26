import { resourceFileKey, resourceRegistry } from '../../lib/resourceRegistry';
import { qualifyResourceId } from '../../lib/resourceIds';
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
import { GuidedMapCreationDialog } from '../dialogs/GuidedMapCreationDialog';
import { CreateTilesetDialog } from '../screens/tileset/CreateTilesetDialog';
import { CreateDialogueDialog } from '../screens/dialogue/CreateDialogueDialog';

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
      const candidateId = qualifyResourceId(
        derived ? `dlg_${derived}` : nextDialogueId(state.dialogues.values()),
        state.project?.idPrefix,
      );
      const dialogueId = state.dialogues.has(candidateId)
        ? qualifyResourceId(nextDialogueId(state.dialogues.values()), state.project?.idPrefix)
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
        resourceRegistry.dialogue.folder,
        resourceFileKey('dialogue-runtime', dialogue.id),
        toRuntimeDialogue(dialogue),
      );
      await fileSystem.saveJson(
        resourceRegistry.dialogue.folder,
        resourceFileKey('dialogue-i18n', dialogue.id),
        buildI18nExport(dialogue),
      );
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
      kind={state.kind as 'character' | 'entity' | 'item' | 'cutscene'}
      folderPath={state.folderPath}
      onClose={onClose}
      onOpenDocument={onOpenDocument}
    />
  );
};
