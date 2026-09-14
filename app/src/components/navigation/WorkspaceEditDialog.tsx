import React from 'react';
import { useToast } from '@chakra-ui/react';
import { WorkspaceDocument } from '../../types/workspace';
import { useEditorStore } from '../../store/useEditorStore';
import {
  getEditorResourceMetadataFlow,
  getEditorResourceMetadataFields,
  getEditorResourceMetadataInitialValues,
  getEditorResourceMetadataTitle,
  submitEditorResourceMetadata,
  createEditorResourceDocument,
} from '../../lib/editorResourceTypes';
import { saveDialogueImmediate } from '../../lib/saveManager';
import { buildI18nExport, toRuntimeDialogue } from '../screens/dialogue/dialogueUtils';
import { CreateDialogueDialog } from '../screens/dialogue/CreateDialogueDialog';
import { ResourceMetadataFormDialog } from '../common/ResourceMetadataFormDialog';
import { TilesetMetadataDialog } from '../tileset/TilesetMetadataDialog';
import { fileSystem } from '../../lib/fileSystem';

export type EditDialogState = { document: WorkspaceDocument } | null;

export const WorkspaceEditDialog: React.FC<{
  state: EditDialogState;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ state, onClose, onOpenDocument }) => {
  const toast = useToast();
  const metadataFlow = getEditorResourceMetadataFlow(state?.document);
  const tilesetId =
    metadataFlow === 'tileset' && state?.document.kind === 'tileset'
      ? state.document.tilesetId
      : null;
  const tileset = useEditorStore((s) => (tilesetId ? s.tilesets.get(tilesetId) : undefined));

  if (!state) return null;

  if (metadataFlow === 'location' && state.document.kind === 'location') {
    return (
      <OpenMapMetadataDialog
        document={state.document}
        onClose={onClose}
        onOpenDocument={onOpenDocument}
      />
    );
  }

  if (metadataFlow === 'tileset') {
    if (!tileset) return null;
    return <TilesetMetadataDialog isOpen onClose={onClose} tileset={tileset} />;
  }

  if (metadataFlow === 'dialogue' && state.document.kind === 'dialogue') {
    return (
      <DialogueMetadataDialog
        document={state.document}
        onClose={onClose}
        onOpenDocument={onOpenDocument}
      />
    );
  }

  if (
    (metadataFlow === 'actor' && state.document.kind === 'actor') ||
    (metadataFlow === 'entity' && state.document.kind === 'entity') ||
    (metadataFlow === 'item' && state.document.kind === 'item')
  ) {
    return <SimpleResourceMetadataDialog document={state.document} onClose={onClose} />;
  }

  toast({ title: 'Unsupported resource', status: 'warning' });
  return null;
};

const OpenMapMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'location' }>;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ document, onClose, onOpenDocument }) => {
  const onOpenDocumentRef = React.useRef(onOpenDocument);
  onOpenDocumentRef.current = onOpenDocument;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    onOpenDocumentRef.current(document, { pin: true });

    let cancelled = false;
    let attempts = 0;

    const openWhenReady = () => {
      if (cancelled) return;

      const currentMapId = useEditorStore.getState().currentMap?.id;
      if (currentMapId === document.mapId) {
        window.dispatchEvent(
          new CustomEvent('openMetadataDialog', { detail: { initialTab: 'base' } }),
        );
        onCloseRef.current();
        return;
      }

      attempts += 1;
      if (attempts >= 20) {
        onCloseRef.current();
        return;
      }
      window.setTimeout(openWhenReady, 30);
    };

    window.setTimeout(openWhenReady, 30);
    return () => {
      cancelled = true;
    };
  }, [document]);

  return null;
};

const DialogueMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'dialogue' }>;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ document, onClose, onOpenDocument }) => {
  const dialogue = useEditorStore((s) => s.dialogues.get(document.dialogueId));
  const projectDialogueTypes = useEditorStore((s) => s.project?.dialogueTypes);
  const dialogueTypes = projectDialogueTypes ?? [];
  const toast = useToast();

  if (!dialogue) return null;

  return (
    <CreateDialogueDialog
      isOpen
      onClose={onClose}
      mode="edit"
      initialValues={{
        name: dialogue.name,
        oneShot: dialogue.oneShot,
        dialogueTypeId: dialogue.dialogueTypeId ?? '',
      }}
      onApply={(values) => {
        const updated = {
          ...dialogue,
          name: values.name.trim(),
          oneShot: values.oneShot,
          dialogueTypeId: values.dialogueTypeId.trim() || undefined,
          updatedAt: new Date().toISOString(),
        };
        useEditorStore.setState((draft) => {
          draft.dialogues.set(updated.id, updated);
        });
        void saveDialogueImmediate(updated);
        void fileSystem
          .saveJson('dialogues', `${updated.id}.runtime.dialogue.json`, toRuntimeDialogue(updated))
          .then(() =>
            fileSystem.saveJson('dialogues', `${updated.id}.i18n.json`, buildI18nExport(updated)),
          )
          .then(() => {
            onOpenDocument(
              createEditorResourceDocument({
                type: 'dialogue',
                id: updated.id,
                name: updated.name,
              }),
              { pin: true },
            );
            onClose();
          })
          .catch((error) => {
            toast({
              title: 'Save dialogue failed',
              description: error instanceof Error ? error.message : 'Unknown error',
              status: 'error',
            });
          });
      }}
      dialogueTypes={dialogueTypes}
    />
  );
};

const SimpleResourceMetadataDialog: React.FC<{
  document: WorkspaceDocument;
  onClose: () => void;
}> = ({ document, onClose }) => {
  const [values, setValues] = React.useState<Record<string, unknown>>(
    () => getEditorResourceMetadataInitialValues(document) ?? {},
  );

  React.useEffect(() => {
    setValues(getEditorResourceMetadataInitialValues(document) ?? {});
  }, [document]);

  if (Object.keys(values).length === 0) return null;

  return (
    <ResourceMetadataFormDialog
      isOpen
      title={getEditorResourceMetadataTitle(document) ?? 'Edit Resource'}
      values={values}
      fields={getEditorResourceMetadataFields(document)}
      onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
      onClose={onClose}
      onSubmit={async () => {
        await submitEditorResourceMetadata(document, values);
        onClose();
      }}
    />
  );
};
