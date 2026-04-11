import React from 'react';
import {
  VStack,
  Box,
  HStack,
  Text,
  Input,
  Button,
  Circle,
  Select,
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
import { LayerType } from '../../../types/schema';
import { BsTree, BsBuilding, BsWater, BsLayersHalf, BsStack } from 'react-icons/bs';
import { EditorModal } from '../../common/EditorModal';

type LayerDefinitionDraft = {
  id: string;
  name: string;
  color: string;
  type: LayerType;
  zIndex: number;
  description: string;
  icon: string;
};

const EMPTY_LAYER_DRAFT: LayerDefinitionDraft = {
  id: '',
  name: '',
  color: '#3182ce',
  type: 'tile',
  zIndex: 0,
  description: '',
  icon: '',
};

const layerDefinitionToDraft = (layer: {
  id: string;
  name: string;
  color: string;
  type: LayerType;
  zIndex: number;
  description?: string;
  icon?: string;
}): LayerDefinitionDraft => ({
  id: layer.id,
  name: layer.name,
  color: layer.color,
  type: layer.type,
  zIndex: layer.zIndex,
  description: layer.description ?? '',
  icon: layer.icon ?? '',
});

const layerIconComponents: Record<string, React.FC<{ size?: number }>> = {
  tree: BsTree,
  building: BsBuilding,
  water: BsWater,
  ground: BsLayersHalf,
  overlay: BsStack,
};

const LayerDefIcon: React.FC<{ icon?: string; color: string; size?: number }> = ({
  icon,
  color,
  size = 10,
}) => {
  if (!icon || !layerIconComponents[icon]) {
    return <Circle size={`${size}px`} bg={color} />;
  }
  const IconComponent = layerIconComponents[icon];
  return (
    <Box color={color}>
      <IconComponent size={size} />
    </Box>
  );
};

const LAYER_TYPE_OPTIONS: { value: LayerType; label: string }[] = [
  { value: 'terrain', label: 'Terrain' },
  { value: 'tile', label: 'Tile' },
  { value: 'entity', label: 'Entity' },
];

const AVAILABLE_ICONS = [
  { value: '', label: 'None' },
  { value: 'tree', label: '🌳 Tree' },
  { value: 'building', label: '🏢 Building' },
  { value: 'water', label: '🌊 Water' },
  { value: 'ground', label: '📊 Ground' },
  { value: 'overlay', label: '📐 Overlay' },
];

export const LayerEditor: React.FC = () => {
  const layerDefinitions = useEditorStore((state) => state.layerDefinitions);
  const selectedLayerDefinitionId = useEditorStore((state) => state.selectedLayerDefinitionId);
  const setSelectedLayerDefinition = useEditorStore((state) => state.setSelectedLayerDefinition);
  const addLayerDefinition = useEditorStore((state) => state.addLayerDefinition);
  const updateLayerDefinition = useEditorStore((state) => state.updateLayerDefinition);
  const deleteLayerDefinition = useEditorStore((state) => state.deleteLayerDefinition);

  const toast = useToast();
  const createModal = useDisclosure();

  const [newLayerName, setNewLayerName] = React.useState('');
  const [newLayerType, setNewLayerType] = React.useState<LayerType>('tile');
  const [newLayerColor, setNewLayerColor] = React.useState('#3182ce');
  const [newLayerIcon, setNewLayerIcon] = React.useState('');

  const sorted = [...layerDefinitions].sort((a, b) => a.zIndex - b.zIndex);
  const selected = layerDefinitions.find((d) => d.id === selectedLayerDefinitionId) ?? null;

  const { draft, patchDraft } = useEntityFormDraft(
    selected,
    layerDefinitionToDraft,
    EMPTY_LAYER_DRAFT,
  );

  const handleAdd = () => {
    createModal.onOpen();
  };

  const handleCreateLayer = () => {
    const normalizedName = newLayerName.trim() || 'New Layer';
    const slug = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    let id = slug || `layer-${Date.now()}`;
    let suffix = 2;
    while (layerDefinitions.some((d) => d.id === id)) {
      id = `${slug || 'layer'}-${suffix++}`;
    }

    const nextZIndex =
      layerDefinitions.length > 0 ? Math.max(...layerDefinitions.map((d) => d.zIndex)) + 1 : 0;
    addLayerDefinition({
      id,
      name: normalizedName,
      type: newLayerType,
      color: newLayerColor,
      icon: newLayerIcon || undefined,
      zIndex: nextZIndex,
    });
    setSelectedLayerDefinition(id);
    setNewLayerName('');
    setNewLayerType('tile');
    setNewLayerColor('#3182ce');
    setNewLayerIcon('');
    createModal.onClose();
    toast({ title: 'Layer definition created', status: 'success', duration: 1500 });
  };

  const handleSave = () => {
    if (!selected) return;
    if (draft.id !== selected.id) {
      deleteLayerDefinition(selected.id);
      addLayerDefinition({
        id: draft.id,
        name: draft.name,
        type: draft.type,
        color: draft.color,
        zIndex: draft.zIndex,
        icon: draft.icon || undefined,
        description: draft.description || undefined,
      });
      setSelectedLayerDefinition(draft.id);
    } else {
      updateLayerDefinition(selected.id, {
        name: draft.name,
        type: draft.type,
        color: draft.color,
        zIndex: draft.zIndex,
        icon: draft.icon || undefined,
        description: draft.description || undefined,
      });
    }
    toast({ title: 'Layer definition saved', status: 'success', duration: 1200 });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete layer definition "${name}"?`)) return;
    deleteLayerDefinition(id);
    setSelectedLayerDefinition(null);
    toast({ title: 'Layer definition deleted', status: 'info', duration: 1200 });
  };

  const items: ListPanelItem[] = sorted.map((def) => ({
    id: def.id,
    label: def.name,
    sublabel: `Z: ${def.zIndex} • ${def.type}`,
    icon: <LayerDefIcon icon={def.icon} color={def.color} />,
  }));

  const leftPanel = (
    <ListPanel
      title="Layer Definitions"
      items={items}
      selectedId={selectedLayerDefinitionId}
      onSelect={setSelectedLayerDefinition}
      onAdd={handleAdd}
      autoSelectFirst
      emptyMessage="No layer definitions"
      onDeleteItem={(item) => {
        const def = layerDefinitions.find((entry) => entry.id === item.id);
        if (!def) return;
        handleDelete(def.id, def.name);
      }}
      deleteActionLabel="Delete layer"
    />
  );

  const rightPanel = (
    <InspectorPanel
      title={selected?.name ?? 'Layer'}
      subtitle={selected?.id}
      emptyState={<Text color="gray.500">No layer selected</Text>}
      onDelete={selected ? () => handleDelete(selected.id, selected.name) : undefined}
      deleteLabel="Delete Layer"
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
              size="sm"
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
              Name
            </Text>
            <Input
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              bg="gray.950"
              size="sm"
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
              Type
            </Text>
            <Select
              value={draft.type}
              onChange={(e) => patchDraft({ type: e.target.value as LayerType })}
              bg="gray.950"
              size="sm"
            >
              {LAYER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Box>

          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Z-Index
            </Text>
            <Input
              type="number"
              value={draft.zIndex}
              onChange={(e) => patchDraft({ zIndex: parseInt(e.target.value, 10) || 0 })}
              bg="gray.950"
              size="sm"
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
              Description
            </Text>
            <Input
              value={draft.description}
              onChange={(e) => patchDraft({ description: e.target.value })}
              bg="gray.950"
              size="sm"
              placeholder="Optional"
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
              Icon
            </Text>
            <Select
              value={draft.icon}
              onChange={(e) => patchDraft({ icon: e.target.value })}
              bg="gray.950"
              size="sm"
            >
              {AVAILABLE_ICONS.map((icon) => (
                <option key={icon.value} value={icon.value}>
                  {icon.label}
                </option>
              ))}
            </Select>
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
              value={draft.color}
              onChange={(e) => patchDraft({ color: e.target.value })}
              w="full"
              h="8"
              p={0}
              border="none"
              cursor="pointer"
            />
          </Box>

          <Button colorScheme="blue" size="sm" onClick={handleSave} mt={1}>
            Save Changes
          </Button>
        </VStack>
      )}
    </InspectorPanel>
  );

  const content = selected ? (
    <VStack spacing={6} align="center" justify="center" h="full">
      <Circle size="120px" bg={selected.color} boxShadow="0 6px 18px rgba(0,0,0,0.6)">
        <LayerDefIcon icon={selected.icon} color="white" size={40} />
      </Circle>
      <VStack spacing={1}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          {selected.name}
        </Text>
        <Text fontSize="sm" color="gray.400">
          {selected.id}
        </Text>
        <HStack spacing={2} mt={2}>
          <Box px={2} py={1} bg="gray.800" rounded="md">
            <Text fontSize="xs" color="gray.300">
              Type: {selected.type}
            </Text>
          </Box>
          <Box px={2} py={1} bg="gray.800" rounded="md">
            <Text fontSize="xs" color="gray.300">
              Z-Index: {selected.zIndex}
            </Text>
          </Box>
        </HStack>
        {selected.description && (
          <Text fontSize="xs" color="gray.500" mt={2} maxW="400px" textAlign="center">
            {selected.description}
          </Text>
        )}
      </VStack>
      <Text color="gray.600" fontSize="xs" maxW="480px" textAlign="center">
        This layer definition is automatically created in all new maps.
      </Text>
    </VStack>
  ) : (
    <EmptyScreen
      icon="📚"
      title="No Layer Definitions"
      description="Create layer definitions to establish default layers for all maps in your project."
      buttonLabel="Create Layer"
      onCreate={handleAdd}
    />
  );

  return (
    <>
      <ResizableEditorLayout
        header={
          selected
            ? {
                title: selected.name,
                subtitle: `${selected.type} • Z-Index: ${selected.zIndex}`,
              }
            : undefined
        }
        content={content}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        leftPanelDefaultSize={20}
        rightPanelDefaultSize={25}
      />

      <EditorModal isOpen={createModal.isOpen} onClose={createModal.onClose} size="sm">
        <EntityFormDialog
          title="Create Layer"
          onCancel={createModal.onClose}
          onSubmit={handleCreateLayer}
          submitLabel="Create Layer"
          isSubmitDisabled={!newLayerName.trim()}
          minWidth="420px"
        >
          <Box>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              color="gray.500"
              mb={1}
            >
              Name
            </Text>
            <Input
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              size="sm"
              bg="gray.950"
            />
          </Box>
          <HStack spacing={3}>
            <Box flex={1}>
              <Text
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                color="gray.500"
                mb={1}
              >
                Type
              </Text>
              <Select
                value={newLayerType}
                onChange={(e) => setNewLayerType(e.target.value as LayerType)}
                size="sm"
                bg="gray.950"
              >
                {LAYER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Box>
            <Box flex={1}>
              <Text
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                color="gray.500"
                mb={1}
              >
                Icon
              </Text>
              <Select
                value={newLayerIcon}
                onChange={(e) => setNewLayerIcon(e.target.value)}
                size="sm"
                bg="gray.950"
              >
                {AVAILABLE_ICONS.map((icon) => (
                  <option key={icon.value} value={icon.value}>
                    {icon.label}
                  </option>
                ))}
              </Select>
            </Box>
          </HStack>
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
              value={newLayerColor}
              onChange={(e) => setNewLayerColor(e.target.value)}
              w="full"
              h="8"
              p={0}
              border="none"
              cursor="pointer"
            />
          </Box>
        </EntityFormDialog>
      </EditorModal>
    </>
  );
};

export default LayerEditor;
