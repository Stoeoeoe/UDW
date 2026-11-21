import React, { useState, type MouseEvent } from 'react';
import { Box, Flex, Text, VStack, Collapse, useToast, useDisclosure } from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';
import { GhostIconButton } from '../../common/IconButtons';
import { useEditorStore } from '../../../store/useEditorStore';
import { AddIcon, ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { Layer } from '../../../types/schema';
import { useLayerDragDrop } from '../../../hooks/useLayerDragDrop';
import { LayerItem } from './LayerItem';
import { LayerModal, LayerFormData } from './LayerModal';
import { createEmptyWaterMask } from '../../../lib/waterMask';
import { createWaterBody, getWaterTypeOptions } from '../../../lib/waterBodies';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { LAYER_CATEGORIES, LayerCategoryConfig, kindToCategory } from './layerConstants';
import { CaptionText, SectionLabel } from '../../../components/common/Typography.tsx';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';

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
    borderColor="editorShellBorder"
    bg="editorSectionBg"
    _hover={{ bg: 'whiteAlpha.50' }}
    cursor="pointer"
    onClick={onToggle}
    userSelect="none"
  >
    <Box color="gray.500" mr="1" flexShrink={0}>
      {isOpen ? <ChevronDownIcon boxSize={3} /> : <ChevronRightIcon boxSize={3} />}
    </Box>
    <Box w="6px" h="6px" borderRadius="full" bg={config.color} mr="2" flexShrink={0} />
    <SectionLabel textStyle="panelLabel" flex={1}>
      {config.label}
    </SectionLabel>
    {count > 0 && (
      <Text fontSize="9px" color="gray.600" mr="1">
        {count}
      </Text>
    )}
    {!hideAdd && (
      <GhostIconButton
        aria-label={`Add ${config.label} layer`}
        icon={<AddIcon fontSize="8px" />}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
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
  const setSelectedLayerDefinition = useEditorStore((state) => state.setSelectedLayerDefinition);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const toast = useToast();
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const waterTypes = getWaterTypeOptions(tileMetadataDefinitions);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
  const [modalInitialData, setModalInitialData] = useState<LayerFormData>({
    name: '',
    kind: 'visual',
    zOrder: 0,
    icon: '',
    sortingLayer: 'ground',
  });

  // Which category add-button was clicked (pre-fills the modal kind)
  const [addingToCategory, setAddingToCategory] = useState<LayerCategoryConfig | null>(null);

  // Key incremented on every modal open to force useForm reinitialization
  const [modalKey, setModalKey] = useState(0);

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
    openDocument({
      kind: 'configuration',
      label: 'Configuration',
      saveUnitId: 'configuration',
      configTab: 'layers',
    });
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
      sortingLayer: 'ground',
    });
    setModalKey((k) => k + 1);
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
      sortingLayer: layer.sortingLayer ?? 'ground',
    });
    setModalKey((k) => k + 1);
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
      const nextLayerShape =
        data.kind === 'building'
          ? {
              data: undefined,
              terrainData: undefined,
              entities: undefined,
              objectInstances: undefined,
              buildings: editingLayer.buildings ?? [],
            }
          : data.kind === 'water'
          ? {
              data: undefined,
              terrainData: undefined,
              entities: undefined,
              objectInstances: undefined,
              waterBodies: editingLayer.waterBodies ?? [],
              waterMask:
                editingLayer.kind === 'water' && editingLayer.waterMask
                  ? editingLayer.waterMask
                  : createEmptyWaterMask(
                      currentMap.width * projectTileSize,
                      currentMap.height * projectTileSize,
                    ),
            }
          : data.kind === 'entity'
          ? {
              entities: editingLayer.entities ?? [],
              data: undefined,
              terrainData: undefined,
              objectInstances: undefined,
            }
          : data.kind === 'terrain'
            ? {
                data:
                  editingLayer.kind === 'terrain' && editingLayer.data
                    ? editingLayer.data
                    : Array(currentMap.height)
                        .fill(null)
                        .map(() => Array(currentMap.width).fill(null)),
                terrainData:
                  editingLayer.kind === 'terrain' && editingLayer.terrainData
                    ? editingLayer.terrainData
                    : Array(currentMap.height)
                        .fill(null)
                        .map(() => Array(currentMap.width).fill(null)),
                entities: undefined,
                objectInstances: undefined,
              }
            : data.kind === 'object'
              ? {
                  data: undefined,
                  terrainData: undefined,
                  entities: undefined,
                  objectInstances: editingLayer.objectInstances ?? [],
                }
              : {
                  data:
                    editingLayer.kind === 'visual' && editingLayer.data
                      ? editingLayer.data
                      : Array(currentMap.height)
                          .fill(null)
                          .map(() => Array(currentMap.width).fill(null)),
                  terrainData: undefined,
                  entities: undefined,
                  objectInstances: undefined,
                };

      updateLayer(editingLayer.id, {
        name: data.name,
        kind: data.kind,
        zOrder: data.zOrder,
        icon: data.icon || undefined,
        sortingLayer: data.sortingLayer,
        ...nextLayerShape,
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
        sortingLayer: data.sortingLayer,
      };

      if (data.kind === 'water') {
        // A new water layer starts with one body to paint with; more are added in the water panel.
        base.waterBodies = [createWaterBody(`water-${Date.now()}`, 'Water 1', waterTypes[0] ?? '')];
        base.waterMask = createEmptyWaterMask(
          currentMap.width * projectTileSize,
          currentMap.height * projectTileSize,
        );
      } else if (data.kind === 'entity') {
        base.entities = [];
      } else if (data.kind === 'object') {
        base.objectInstances = [];
      } else if (data.kind === 'building') {
        base.buildings = [];
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
      <Flex direction="column" h="full" bg="editorPanelBg" color="gray.200">
        {/* Panel header */}
        <PanelHeader
          title="Layers"
          actions={
            <GhostIconButton
              aria-label="Add Layer"
              icon={<AddIcon fontSize="10px" />}
              color="gray.400"
              size="md"
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
                      <CaptionText color="gray.600" fontStyle="italic">
                        No {catConfig.label.toLowerCase()} layers
                      </CaptionText>
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
        key={modalKey}
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
