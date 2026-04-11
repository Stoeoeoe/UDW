import React from 'react';
import {
  VStack,
  Box,
  HStack,
  Text,
  Input,
  Button,
  Circle,
  Spacer,
  useToast,
  useDisclosure,
} from '@chakra-ui/react';
import {
  ListPanel,
  ListPanelItem,
  InspectorPanel,
  EmptyScreen,
  EntityFormDialog,
  useEntityFormDraft,
} from '../common';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorModal } from '../../common/EditorModal';

type TerrainDraft = {
  id: string;
  displayName: string;
  color: string;
};

const EMPTY_TERRAIN_DRAFT: TerrainDraft = {
  id: '',
  displayName: '',
  color: '#3182ce',
};

const terrainToDraft = (terrain: {
  id: string;
  displayName: string;
  color: string;
}): TerrainDraft => ({
  id: terrain.id,
  displayName: terrain.displayName,
  color: terrain.color,
});

export const TerrainEditor: React.FC = () => {
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const selectedTerrainId = useEditorStore((state) => state.selectedTerrainId);
  const setSelectedTerrain = useEditorStore((state) => state.setSelectedTerrain);
  const addTerrainType = useEditorStore((state) => state.addTerrainType);
  const updateTerrainType = useEditorStore((state) => state.updateTerrainType);
  const deleteTerrainType = useEditorStore((state) => state.deleteTerrainType);

  const toast = useToast();
  const createModal = useDisclosure();
  const [newTerrainName, setNewTerrainName] = React.useState('');
  const [newTerrainColor, setNewTerrainColor] = React.useState('#3182ce');

  const items: ListPanelItem[] = terrainTypes.map((t) => ({
    id: t.id,
    label: t.displayName,
    sublabel: t.id,
    icon: <Circle size="10px" bg={t.color} />,
  }));

  const selected = terrainTypes.find((t) => t.id === selectedTerrainId) || null;

  const { draft, patchDraft } = useEntityFormDraft(selected, terrainToDraft, EMPTY_TERRAIN_DRAFT);

  const handleAdd = () => {
    createModal.onOpen();
  };

  const handleCreateTerrain = () => {
    const displayName = newTerrainName.trim() || 'New Terrain';
    const slug = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    let id = slug || `terrain-${Date.now()}`;
    let suffix = 2;
    while (terrainTypes.some((entry) => entry.id === id)) {
      id = `${slug || 'terrain'}-${suffix++}`;
    }

    addTerrainType({ id, displayName, color: newTerrainColor });
    setSelectedTerrain(id);
    setNewTerrainName('');
    setNewTerrainColor('#3182ce');
    createModal.onClose();
    toast({ title: 'Terrain created', status: 'success', duration: 1500 });
  };

  const handleSave = () => {
    if (!selected) return;
    // If ID changed, delete+recreate (simple approach)
    if (draft.id !== selected.id) {
      deleteTerrainType(selected.id);
      addTerrainType({ id: draft.id, displayName: draft.displayName, color: draft.color });
      setSelectedTerrain(draft.id);
    } else {
      updateTerrainType(selected.id, { displayName: draft.displayName, color: draft.color });
    }
    toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
  };

  const deleteTerrain = (id: string, displayName: string) => {
    if (!confirm(`Delete terrain "${displayName}"?`)) return;
    deleteTerrainType(id);
    setSelectedTerrain(null);
    toast({ title: 'Terrain deleted', status: 'info', duration: 1200 });
  };

  const leftPanel = (
    <ListPanel
      title="Terrain Types"
      items={items}
      selectedId={selectedTerrainId}
      onSelect={(id) => setSelectedTerrain(id)}
      onAdd={handleAdd}
      autoSelectFirst={true}
      emptyMessage="No terrain types defined"
      onEditItem={(item) => setSelectedTerrain(item.id)}
      onDeleteItem={(item) => {
        const terrain = terrainTypes.find((entry) => entry.id === item.id);
        if (!terrain) return;
        deleteTerrain(terrain.id, terrain.displayName);
      }}
      deleteActionLabel="Delete terrain"
    />
  );

  const rightPanel = (
    <InspectorPanel
      title={selected?.displayName || 'Terrain'}
      subtitle={selected?.id}
      emptyState={
        <Box>
          <Text color="gray.500">No terrain selected</Text>
        </Box>
      }
      onDelete={selected ? () => deleteTerrain(selected.id, selected.displayName) : undefined}
      deleteLabel="Delete Terrain"
    >
      {selected && (
        <VStack align="stretch" spacing={3}>
          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              ID
            </Text>
            <Input
              value={draft.id}
              onChange={(e) => patchDraft({ id: e.target.value })}
              bg="gray.950"
            />
          </Box>

          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Display Name
            </Text>
            <Input
              value={draft.displayName}
              onChange={(e) => patchDraft({ displayName: e.target.value })}
              bg="gray.950"
            />
          </Box>

          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Color
            </Text>
            <HStack>
              <Input
                type="color"
                value={draft.color}
                onChange={(e) => patchDraft({ color: e.target.value })}
                w="16"
                h="10"
                p={0}
              />
              <Spacer />
              <Button colorScheme="blue" size="sm" onClick={handleSave}>
                Save
              </Button>
            </HStack>
          </Box>
        </VStack>
      )}
    </InspectorPanel>
  );

  const content = selected ? (
    <VStack spacing={6} align="center" justify="center" h="full">
      <Circle size="120px" bg={selected.color} boxShadow="0 6px 18px rgba(0,0,0,0.6)" />
      <VStack spacing={1}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          {selected.displayName}
        </Text>
        <Text fontSize="sm" color="gray.400">
          {selected.id}
        </Text>
      </VStack>
      <Text color="gray.500" maxW="480px" textAlign="center">
        This terrain color is used by autotile tools and the tileset Wang editor for corner
        painting.
      </Text>
    </VStack>
  ) : (
    <EmptyScreen
      icon="🟦"
      title="No Terrains"
      description="Create terrain types to use in autotiling and labeling."
      buttonLabel="Create Terrain"
      onCreate={handleAdd}
    />
  );

  return (
    <>
      <ResizableEditorLayout
        header={{ title: 'Terrain', subtitle: `${terrainTypes.length} types` }}
        content={content}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        leftPanelDefaultSize={20}
        rightPanelDefaultSize={25}
      />

      <EditorModal isOpen={createModal.isOpen} onClose={createModal.onClose} size="sm">
        <EntityFormDialog
          title="Create Terrain"
          onCancel={createModal.onClose}
          onSubmit={handleCreateTerrain}
          submitLabel="Create Terrain"
          isSubmitDisabled={!newTerrainName.trim()}
          minWidth="380px"
        >
          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Display Name
            </Text>
            <Input
              value={newTerrainName}
              onChange={(e) => setNewTerrainName(e.target.value)}
              size="sm"
              bg="gray.950"
            />
          </Box>
          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Color
            </Text>
            <Input
              type="color"
              value={newTerrainColor}
              onChange={(e) => setNewTerrainColor(e.target.value)}
              w="full"
              h="8"
              p={0}
            />
          </Box>
        </EntityFormDialog>
      </EditorModal>
    </>
  );
};

export default TerrainEditor;
