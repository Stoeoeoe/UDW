import React, { useState } from 'react';
import { Button, Text, VStack, useDisclosure, useToast } from '@chakra-ui/react';
import { FiFilm } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel } from '../common/ListPanel';
import { EmptyScreen } from '../common/EmptyScreen';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { CutsceneDetail } from './CutsceneDetail';
import { CutsceneGraphEditor } from './CutsceneGraphEditor';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { createEditorResourceDocument } from '../../../lib/editorResourceTypes';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';

export const CutsceneEditor: React.FC<{ cutsceneId?: string }> = ({ cutsceneId }) => {
  const [graphMode, setGraphMode] = useState(false);
  const scenes = useEditorStore((s) => s.cutscenes);
  const selectedId = useEditorStore((s) => s.selectedCutsceneId);
  const labels = useEditorStore((s) => s.cutsceneLabels);
  const project = useEditorStore((s) => s.project);
  const manifestError = useScriptingManifestStore(
    (s) =>
      s.error ??
      (!s.manifest ? 'Configure the Lua manifest location in Scripting > Lua Manifest.' : null),
  );
  const loadError = useEditorStore((s) => s.cutsceneLoadError);
  const toast = useToast();
  const create = useDisclosure();
  const scene = scenes.find((s) => s.id === (cutsceneId ?? selectedId));
  const report = (error: unknown) =>
    toast({
      title: 'Cutscene error',
      description: error instanceof Error ? error.message : String(error),
      status: 'error',
      isClosable: true,
    });
  const controls = (
    <VStack p={3} align="stretch">
      <Text textStyle="helperText">{loadError ?? manifestError}</Text>
      {loadError && (
        <Button
          size="sm"
          onClick={async () => {
            try {
              await useEditorStore.getState().loadCutscenes();
            } catch (e) {
              report(e);
            }
          }}
        >
          Reload corrected sources
        </Button>
      )}
    </VStack>
  );

  return (
    <>
      {scene && (graphMode || (scene.graphs && Object.keys(scene.graphs).length > 0)) ? (
        <CutsceneGraphEditor
          key={scene.id}
          scene={scene}
          onList={() => setGraphMode(false)}
          notice={loadError || manifestError ? controls : undefined}
        />
      ) : scene ? (
        <CutsceneDetail
          key={scene.id}
          scene={scene}
          onGraph={() => setGraphMode(true)}
          notice={loadError || manifestError ? controls : undefined}
          leftPanel={
            cutsceneId ? undefined : (
              <ListPanel
                title="Cutscenes"
                enableSearch
                items={scenes.map((s) => ({
                  id: s.id,
                  label: labels[s.id] || s.id,
                  sublabel: s.mapId,
                }))}
                selectedId={selectedId}
                onSelect={(id) => useEditorStore.setState({ selectedCutsceneId: id })}
                onAdd={create.onOpen}
              />
            )
          }
        />
      ) : (
        <ResizableEditorLayout
          header={{ title: 'Cutscenes' }}
          content={
            <VStack h="full" align="stretch">
              {(loadError || manifestError) && controls}
              <EmptyScreen
                icon={<FiFilm />}
                title="No cutscene selected"
                description="Create a cutscene, select its map, then add action steps."
                buttonLabel="Create Cutscene"
                onCreate={create.onOpen}
              />
            </VStack>
          }
        />
      )}
      <CreateItemDialog
        isOpen={create.isOpen}
        title="New Cutscene"
        itemType="Cutscene"
        idPrefix={project?.idPrefix ?? 'base'}
        existingIds={scenes.map((s) => s.id)}
        onClose={create.onClose}
        onSubmit={({ id, name }) => {
          const createdId = useEditorStore.getState().createCutscene(id, name);
          useWorkspaceStore
            .getState()
            .openDocument(createEditorResourceDocument({ type: 'cutscene', id: createdId, name }), {
              pin: true,
            });
          create.onClose();
        }}
      />
    </>
  );
};
