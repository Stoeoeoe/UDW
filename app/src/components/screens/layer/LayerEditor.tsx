import React, { useState } from 'react';
import {
  VStack,
  Box,
  HStack,
  Text,
  Input,
  Button,
  Circle,
  Flex,
  IconButton,
  Tooltip,
  Select,
  useToast,
} from '@chakra-ui/react';
import { EditIcon, DeleteIcon } from '@chakra-ui/icons';
import { ListPanel, ListPanelItem, InspectorPanel, EmptyScreen } from '../common';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { useEditorStore } from '../../../store/useEditorStore';
import { LayerType } from '../../../types/schema';
import { BsTree, BsBuilding, BsWater, BsLayersHalf, BsStack } from 'react-icons/bs';

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

  const sorted = [...layerDefinitions].sort((a, b) => a.zIndex - b.zIndex);
  const selected = layerDefinitions.find((d) => d.id === selectedLayerDefinitionId) ?? null;

  const [editName, setEditName] = useState(selected?.name ?? '');
  const [editId, setEditId] = useState(selected?.id ?? '');
  const [editColor, setEditColor] = useState(selected?.color ?? '#3182ce');
  const [editType, setEditType] = useState<LayerType>(selected?.type ?? 'tile');
  const [editZIndex, setEditZIndex] = useState(selected?.zIndex ?? 0);
  const [editDescription, setEditDescription] = useState(selected?.description ?? '');
  const [editIcon, setEditIcon] = useState(selected?.icon ?? '');

  React.useEffect(() => {
    setEditName(selected?.name ?? '');
    setEditId(selected?.id ?? '');
    setEditColor(selected?.color ?? '#3182ce');
    setEditType(selected?.type ?? 'tile');
    setEditZIndex(selected?.zIndex ?? 0);
    setEditDescription(selected?.description ?? '');
    setEditIcon(selected?.icon ?? '');
  }, [selected]);

  const handleAdd = () => {
    const id = `layer-${Date.now()}`;
    const nextZIndex =
      layerDefinitions.length > 0 ? Math.max(...layerDefinitions.map((d) => d.zIndex)) + 1 : 0;
    addLayerDefinition({
      id,
      name: 'New Layer',
      type: 'tile',
      color: '#3182ce',
      zIndex: nextZIndex,
    });
    setSelectedLayerDefinition(id);
    toast({ title: 'Layer definition created', status: 'success', duration: 1500 });
  };

  const handleSave = () => {
    if (!selected) return;
    if (editId !== selected.id) {
      deleteLayerDefinition(selected.id);
      addLayerDefinition({
        id: editId,
        name: editName,
        type: editType,
        color: editColor,
        zIndex: editZIndex,
        icon: editIcon || undefined,
        description: editDescription || undefined,
      });
      setSelectedLayerDefinition(editId);
    } else {
      updateLayerDefinition(selected.id, {
        name: editName,
        type: editType,
        color: editColor,
        zIndex: editZIndex,
        icon: editIcon || undefined,
        description: editDescription || undefined,
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
      renderItem={(item, isSelected) => {
        const def = layerDefinitions.find((d) => d.id === item.id)!;
        return (
          <Box
            px={3}
            py={2}
            rounded="md"
            cursor="pointer"
            bg={isSelected ? 'blue.900' : 'transparent'}
            border="1px"
            borderColor={isSelected ? 'blue.500' : 'transparent'}
            _hover={{ bg: isSelected ? 'blue.900' : 'whiteAlpha.50' }}
            transition="all 0.1s"
            role="group"
            onClick={() => setSelectedLayerDefinition(item.id)}
          >
            <Flex align="center" justify="space-between">
              <HStack spacing={2} flex={1} minW={0}>
                <LayerDefIcon icon={def.icon} color={def.color} />
                <VStack align="start" spacing={0} flex={1} minW={0}>
                  <Text
                    fontSize="xs"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    color={isSelected ? 'white' : 'gray.200'}
                    noOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel && (
                    <Text fontSize="10px" color="gray.500">
                      {item.sublabel}
                    </Text>
                  )}
                </VStack>
              </HStack>
              <Flex align="center" gap={1} opacity={0} _groupHover={{ opacity: 1 }}>
                <Tooltip label="Edit" placement="right" hasArrow>
                  <IconButton
                    aria-label="Edit layer definition"
                    icon={<EditIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLayerDefinition(item.id);
                    }}
                  />
                </Tooltip>
                <Tooltip label="Delete" placement="right" hasArrow>
                  <IconButton
                    aria-label="Delete layer definition"
                    icon={<DeleteIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(def.id, def.name);
                    }}
                  />
                </Tooltip>
              </Flex>
            </Flex>
          </Box>
        );
      }}
    />
  );

  const rightPanel = (
    <InspectorPanel
      title={selected?.name ?? 'Layer'}
      subtitle={selected?.id}
      emptyState={<Text color="gray.500">No layer selected</Text>}
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
              value={editId}
              onChange={(e) => setEditId(e.target.value)}
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
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
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
              value={editType}
              onChange={(e) => setEditType(e.target.value as LayerType)}
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
              value={editZIndex}
              onChange={(e) => setEditZIndex(parseInt(e.target.value, 10) || 0)}
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
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
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
              value={editIcon}
              onChange={(e) => setEditIcon(e.target.value)}
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
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
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
  );
};

export default LayerEditor;
