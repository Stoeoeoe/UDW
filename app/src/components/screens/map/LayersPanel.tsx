import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  VStack,
  IconButton,
  Collapse,
  useToast,
  useDisclosure,
} from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';
import { useEditorStore } from '../../../store/useEditorStore';
import { AddIcon, ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { Layer } from '../../../types/schema';
import { useLayerDragDrop } from '../../../hooks/useLayerDragDrop';
import { LayerItem } from './LayerItem';
import { LayerModal, LayerFormData } from './LayerModal';
import { LAYER_CATEGORIES, LayerCategoryConfig, kindToCategory } from './layerConstants';

// ─────────────────────────────────────────────────────────────────────────────
// Category section header with collapse toggle + add button
// ─────────────────────────────────────────────────────────────────────────────
interface CategoryHeaderProps {
  config: LayerCategoryConfig;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  onAdd: () => void;
  /** When true, the + add button is hidden (all kinds in this category are system-managed) */
  hideAdd?: boolean;
}

const CategoryHeader: React.FC<CategoryHeaderProps> = ({
  config,
  count,
  isOpen,
  onToggle,
  onAdd,
  hideAdd,
}) => (
  <Flex
    align="center"
    px="2"
    py="1"
    borderBottom="1px"
    borderColor="editor.border"
    bg="editor.headerBg"
    _hover={{ bg: 'whiteAlpha.50' }}
    cursor="pointer"
    onClick={onToggle}
    userSelect="none"
  >
    <Box color="gray.500" mr="1" flexShrink={0}>
      {isOpen ? <ChevronDownIcon boxSize={3} /> : <ChevronRightIcon boxSize={3} />}
    </Box>
    <Box w="6px" h="6px" borderRadius="full" bg={config.color} mr="2" flexShrink={0} />
    <Text
      flex={1}
      fontSize="9px"
      fontWeight="black"
      textTransform="uppercase"
      letterSpacing="widest"
      color="gray.500"
    >
      {config.label}
    </Text>
    {count > 0 && (
      <Text fontSize="9px" color="gray.600" mr="1">
        {count}
      </Text>
    )}
    {!hideAdd && (
      <IconButton
        aria-label={`Add ${config.label} layer`}
        icon={<AddIcon fontSize="8px" />}
        size="xs"
        variant="ghost"
        color="gray.600"
        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      />
    )}
  </Flex>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
export const LayersPanel: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleVisibility = useEditorStore((state) => state.toggleLayerVisibility);
  const addLayer = useEditorStore((state) => state.addLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const layerDefinitions = useEditorStore((state) => state.layerDefinitions);
  const setMode = useEditorStore((state) => state.setMode);
  const setSelectedLayerDefinition = useEditorStore((state) => state.setSelectedLayerDefinition);
  const toast = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
  const [modalInitialData, setModalInitialData] = useState<LayerFormData>({
    name: '',
    kind: 'visual',
    zOrder: 0,
    icon: '',
  });

  // Which category add-button was clicked (pre-fills the modal kind)
  const [addingToCategory, setAddingToCategory] = useState<LayerCategoryConfig | null>(null);

  // Collapse state per category (all open by default)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const {
    draggedLayerId,
    dropTargetId,
    dragNodeRef,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useLayerDragDrop();

  if (!currentMap) {
    return (
      <Box p="4" fontSize="xs" color="gray.500" fontStyle="italic" textAlign="center" mt="10">
        No active map.
      </Box>
    );
  }

  // Sorted top-to-bottom (highest zOrder first) for display
  const layers = [...currentMap.layers].sort((a, b) => b.zOrder - a.zOrder);

  const getLayerDefinition = (layer: Layer) => {
    if (layer.definitionId) {
      return layerDefinitions.find((d) => d.id === layer.definitionId) ?? null;
    }
    return null;
  };

  const handleGoToDefinition = (definitionId: string) => {
    setSelectedLayerDefinition(definitionId);
    setMode('layers');
  };

  const handleOpenAddModal = (categoryConfig?: LayerCategoryConfig) => {
    setEditingLayer(null);
    setAddingToCategory(categoryConfig ?? null);
    // Pre-select the first *addable* (non-system) kind in this category
    const addableKinds = categoryConfig
      ? categoryConfig.kinds.filter((k) => !categoryConfig.systemKinds?.includes(k))
      : [];
    const defaultKind = addableKinds.length > 0 ? addableKinds[0] : 'visual';
    setModalInitialData({
      name: '',
      kind: defaultKind,
      zOrder: currentMap.layers.length,
      icon: '',
    });
    onOpen();
  };

  const handleOpenEditModal = (layer: Layer) => {
    setEditingLayer(layer);
    setAddingToCategory(null);
    setModalInitialData({
      name: layer.name,
      kind: layer.kind,
      zOrder: layer.zOrder,
      icon: layer.icon || '',
    });
    onOpen();
  };

  const handleSave = (data: LayerFormData) => {
    if (!data.name.trim()) {
      toast({
        title: 'Please enter a layer name',
        status: 'warning',
        duration: 2000,
      });
      return;
    }

    if (editingLayer) {
      updateLayer(editingLayer.id, {
        name: data.name,
        kind: data.kind,
        zOrder: data.zOrder,
        icon: data.icon || undefined,
      });
      toast({ title: 'Layer updated', status: 'success', duration: 1500 });
    } else {
      const id = `layer-${Date.now()}`;
      const base: Layer = {
        id,
        name: data.name,
        kind: data.kind,
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: data.zOrder,
        icon: data.icon || undefined,
      };

      if (data.kind === 'entity') {
        base.entities = [];
      } else {
        base.data = Array(currentMap.height)
          .fill(null)
          .map(() => Array(currentMap.width).fill(null));
        if (data.kind === 'terrain') {
          base.terrainData = Array(currentMap.height)
            .fill(null)
            .map(() => Array(currentMap.width).fill(null));
        }
      }

      addLayer(base);
      selectLayer(id);
      toast({ title: 'Layer created', status: 'success', duration: 1500 });
    }

    onClose();
  };

  const handleDeleteLayer = (id: string, name: string) => {
    if (confirm(`Delete layer "${name}"?`)) {
      removeLayer(id);
      toast({ title: 'Layer removed', status: 'info', duration: 2000 });
    }
  };

  // Guard: only allow drops within the same category
  const handleDropGuarded = (e: React.DragEvent, targetLayerId: string, targetCategory: string) => {
    if (!draggedLayerId) return;
    const draggedLayer = currentMap.layers.find((l) => l.id === draggedLayerId);
    if (!draggedLayer) return;
    const draggedCat = kindToCategory(draggedLayer.kind);
    if (draggedCat !== targetCategory) return;
    handleDrop(e, targetLayerId);
  };

  return (
    <>
      <Flex direction="column" h="full" bg="editor.panelBg" color="gray.200">
        {/* Panel header */}
        <PanelHeader
          title="Layers"
          actions={
            <IconButton
              aria-label="Add Layer"
              icon={<AddIcon fontSize="10px" />}
              size="md"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={() => handleOpenAddModal()}
            />
          }
        />

        {/* Categorized layer list */}
        <Box flex={1} overflowY="auto">
          {LAYER_CATEGORIES.map((catConfig) => {
            const catLayers = layers.filter((l) => kindToCategory(l.kind) === catConfig.id);
            const isCollapsed = collapsedCategories.has(catConfig.id);
            // Hide + if all user-facing kinds in this category are system-managed
            const addableKinds = catConfig.kinds.filter((k) => !catConfig.systemKinds?.includes(k));
            const hideAdd = addableKinds.length === 0;

            return (
              <Box key={catConfig.id}>
                <CategoryHeader
                  config={catConfig}
                  count={catLayers.length}
                  isOpen={!isCollapsed}
                  onToggle={() => toggleCategory(catConfig.id)}
                  onAdd={() => handleOpenAddModal(catConfig)}
                  hideAdd={hideAdd}
                />
                <Collapse in={!isCollapsed} animateOpacity>
                  {catLayers.length === 0 ? (
                    <Box px="4" py="2">
                      <Text fontSize="10px" color="gray.700" fontStyle="italic">
                        No {catConfig.label.toLowerCase()} layers
                      </Text>
                    </Box>
                  ) : (
                    <VStack spacing={0} align="stretch" px={1} py={1}>
                      {catLayers.map((layer) => {
                        const definition = getLayerDefinition(layer);
                        const isFromDefinition = !!definition;
                        const isDragging = draggedLayerId === layer.id;
                        const isDropTarget = dropTargetId === layer.id;

                        return (
                          <LayerItem
                            key={layer.id}
                            layer={layer}
                            isSelected={layer.id === selectedLayerId}
                            isDragging={isDragging}
                            isDropTarget={isDropTarget}
                            isFromDefinition={isFromDefinition}
                            definition={definition}
                            onSelect={selectLayer}
                            onToggleVisibility={toggleVisibility}
                            onEdit={handleOpenEditModal}
                            onDelete={handleDeleteLayer}
                            onGoToDefinition={handleGoToDefinition}
                            onDragStart={!isFromDefinition ? handleDragStart : undefined}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e, targetId) => handleDropGuarded(e, targetId, catConfig.id)}
                            onDragEnd={handleDragEnd}
                            dragNodeRef={dragNodeRef}
                          />
                        );
                      })}
                    </VStack>
                  )}
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Flex>

      {/* Add/Edit Layer Modal */}
      <LayerModal
        key={editingLayer?.id ?? 'new'}
        isOpen={isOpen}
        onClose={onClose}
        onSave={handleSave}
        initialData={modalInitialData}
        isEditing={!!editingLayer}
        lockedKinds={
          addingToCategory
            ? addingToCategory.kinds.filter((k) => !addingToCategory.systemKinds?.includes(k))
            : undefined
        }
      />
    </>
  );
};

export default LayersPanel;
