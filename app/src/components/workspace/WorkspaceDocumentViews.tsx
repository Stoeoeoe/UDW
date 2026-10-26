import React from 'react';
import { CutsceneEditor } from '../screens/cutscene/CutsceneEditor';
import { EmptyScreen } from '../screens/common/EmptyScreen';
import {
  ActorEditor,
  DialogueEditor,
  EntityEditor,
  ItemEditor,
  MapEditor,
  TilesetEditor,
  VariableEditor,
  SettingsEditor,
} from '../screens';
import { ConfigurationEditor } from '../screens/settings/ConfigurationEditor';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { WorkspaceTab } from '../../types/workspace';

export const ActiveWorkspaceDocument: React.FC<{ tab: WorkspaceTab | null }> = ({ tab }) => {
  if (!tab) {
    return (
      <EmptyScreen
        icon="🗂️"
        title="No Document Open"
        description="Choose a location, tileset, settings page, or configuration screen from the explorer."
      />
    );
  }

  switch (tab.document.kind) {
    case 'location':
      return <MapEditor />;
    case 'tileset':
      return <TilesetEditor />;
    case 'settings':
      return <SettingsEditor />;
    case 'configuration':
      return <ConfigurationWorkspaceDocument document={tab.document} />;
    case 'entities':
      return <EntityEditor />;
    case 'actors':
      return <ActorEditor />;
    case 'items':
      return <ItemEditor />;
    case 'cutscene':
      return <CutsceneEditor cutsceneId={tab.document.cutsceneId} />;
    case 'cutscenes':
      return <CutsceneEditor />;
    case 'dialogues':
      return <DialogueEditor />;
    case 'scripting':
      return <VariableEditor />;
    case 'actor':
      return <ActorResourceDocument actorId={tab.document.actorId} />;
    case 'entity':
      return <EntityResourceDocument entityTypeId={tab.document.entityTypeId} />;
    case 'item':
      return <ItemResourceDocument itemId={tab.document.itemId} />;
    case 'dialogue':
      return <DialogueResourceDocument dialogueId={tab.document.dialogueId} />;
    case 'variable':
      return <VariableEditor />;
    default:
      return null;
  }
};

const ConfigurationWorkspaceDocument: React.FC<{
  document: Extract<WorkspaceTab['document'], { kind: 'configuration' }>;
}> = ({ document }) => {
  const openDocument = useWorkspaceStore((state) => state.openDocument);

  const handleConfigurationTabChange = React.useCallback(
    (configTab: NonNullable<typeof document.configTab>) => {
      if ((document.configTab ?? 'terrain') === configTab) return;
      openDocument({ ...document, configTab });
    },
    [document, openDocument],
  );

  return (
    <ConfigurationEditor
      initialTab={document.configTab ?? 'terrain'}
      onTabChange={handleConfigurationTabChange}
    />
  );
};

const ActorResourceDocument: React.FC<{ actorId: string }> = ({ actorId }) => {
  const setSelectedActor = useEditorStore((state) => state.setSelectedActor);
  React.useEffect(() => {
    setSelectedActor(actorId);
  }, [actorId, setSelectedActor]);
  return <ActorEditor />;
};

const EntityResourceDocument: React.FC<{ entityTypeId: string }> = ({ entityTypeId }) => {
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  React.useEffect(() => {
    setSelectedEntityType(entityTypeId);
  }, [entityTypeId, setSelectedEntityType]);
  return <EntityEditor />;
};

const ItemResourceDocument: React.FC<{ itemId: string }> = ({ itemId }) => {
  const setSelectedItem = useEditorStore((state) => state.setSelectedItem);
  React.useEffect(() => {
    setSelectedItem(itemId);
  }, [itemId, setSelectedItem]);
  return <ItemEditor />;
};

const DialogueResourceDocument: React.FC<{ dialogueId: string }> = ({ dialogueId }) => {
  React.useEffect(() => {
    useEditorStore.setState((state) => {
      state.selectedDialogueId = dialogueId;
      state.selectedDialogueNodeId = null;
    });
  }, [dialogueId]);
  return <DialogueEditor />;
};
