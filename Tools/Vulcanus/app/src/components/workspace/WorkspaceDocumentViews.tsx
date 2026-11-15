import { QuestEditor } from '../screens/quest/QuestEditor';
import React from 'react';
import { CutsceneEditor } from '../screens/cutscene/CutsceneEditor';
import { EmptyScreen } from '../screens/common/EmptyScreen';
import {
  CharacterEditor,
  DialogueEditor,
  EntityEditor,
  ItemEditor,
  ShopEditor,
  RoutineEditor,
  MapEditor,
  TilesetEditor,
  ScriptingApiBrowser,
  SettingsEditor,
} from '../screens';
import { ConfigurationEditor } from '../screens/settings/ConfigurationEditor';
import { DataEditor } from '../screens/data/DataEditor';
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
    case 'characters':
      return <CharacterEditor />;
    case 'items':
      return <ItemEditor />;
    case 'cutscene':
      return <CutsceneEditor cutsceneId={tab.document.cutsceneId} />;
    case 'cutscenes':
      return <CutsceneEditor />;
    case 'dialogues':
      return <DialogueEditor />;
    case 'scripting':
      return <ScriptingApiBrowser />;
    case 'data':
      return <DataEditor />;
    case 'character':
      return <CharacterResourceDocument characterId={tab.document.characterId} />;
    case 'entity':
      return <EntityResourceDocument entityTypeId={tab.document.entityTypeId} />;
    case 'item':
      return <ItemResourceDocument itemId={tab.document.itemId} />;
    case 'shop':
      return <ShopResourceDocument shopId={tab.document.shopId} />;
    case 'quest':
      return <QuestEditor questId={tab.document.questId} />;
    case 'routine':
      return <RoutineEditor routineId={tab.document.routineId} />;
    case 'dialogue':
      return <DialogueResourceDocument dialogueId={tab.document.dialogueId} />;
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

const CharacterResourceDocument: React.FC<{ characterId: string }> = ({ characterId }) => {
  const setSelectedCharacter = useEditorStore((state) => state.setSelectedCharacter);
  React.useEffect(() => {
    setSelectedCharacter(characterId);
  }, [characterId, setSelectedCharacter]);
  return <CharacterEditor />;
};

const EntityResourceDocument: React.FC<{ entityTypeId: string }> = ({ entityTypeId }) => {
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  React.useEffect(() => {
    setSelectedEntityType(entityTypeId);
  }, [entityTypeId, setSelectedEntityType]);
  return <EntityEditor />;
};

const ShopResourceDocument: React.FC<{ shopId: string }> = ({ shopId }) => {
  const setSelectedShop = useEditorStore((state) => state.setSelectedShop);
  React.useEffect(() => {
    setSelectedShop(shopId);
  }, [shopId, setSelectedShop]);
  return <ShopEditor />;
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
