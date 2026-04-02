import React from 'react';
import { HStack, Button, ButtonGroup, Tooltip } from '@chakra-ui/react';
import {
  FiEdit2,
  FiTrash2,
  FiUser,
  FiShuffle,
  FiDroplet,
  FiGrid,
  FiMaximize,
  FiMousePointer,
} from 'react-icons/fi';
import { FaMountain } from 'react-icons/fa';
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';
import { LayerKind } from '../../types/schema';
import { Toolbar, ToolItem } from '../common/Toolbar';

/** Tools shown per layer kind */
const TOOLS_BY_KIND: Record<LayerKind, ToolItem[]> = {
  visual: [
    { id: 'stamp', icon: FiEdit2, label: 'Stamp (B)', group: 'tiles' },
    {
      id: 'terrain',
      icon: FaMountain,
      label: 'Terrain Brush (T)',
      group: 'tiles',
    },
    { id: 'random', icon: FiShuffle, label: 'Random (R)', group: 'tiles' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'tiles' },
    { id: 'fill', icon: FiDroplet, label: 'Bucket Fill (G)', group: 'tiles' },
  ],
  collision: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'collision' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'collision' },
    { id: 'fill', icon: FiDroplet, label: 'Fill (G)', group: 'collision' },
  ],
  navigation: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'navigation' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'navigation' },
    { id: 'fill', icon: FiDroplet, label: 'Fill (G)', group: 'navigation' },
  ],
  metadata: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'metadata' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'metadata' },
  ],
  entity: [
    {
      id: 'entitySelect',
      icon: FiMousePointer,
      label: 'Select / Move (M)',
      group: 'entities',
    },
    {
      id: 'entityPlace',
      icon: FiUser,
      label: 'Place Entity (N)',
      group: 'entities',
    },
    {
      id: 'entityDelete',
      icon: FiTrash2,
      label: 'Delete Entity (X)',
      group: 'entities',
    },
  ],
};

const FALLBACK_TOOLS: ToolItem[] = [
  { id: 'stamp', icon: FiEdit2, label: 'Stamp (B)', group: 'tiles' },
];

export const MapToolbar: React.FC = () => {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const entitySnapMode = useEditorStore((state) => state.entitySnapMode);
  const setEntitySnapMode = useEditorStore((state) => state.setEntitySnapMode);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const currentMap = useEditorStore((state) => state.currentMap);

  const selectedLayer = currentMap?.layers.find(
    (l) => l.id === selectedLayerId,
  );
  const tools = selectedLayer
    ? (TOOLS_BY_KIND[selectedLayer.kind] ?? FALLBACK_TOOLS)
    : FALLBACK_TOOLS;

  const showSnapToggle =
    selectedLayer?.kind === 'entity' &&
    (activeTool === 'entityPlace' || activeTool === 'entitySelect');

  return (
    <HStack spacing={4}>
      <Toolbar
        items={tools}
        activeId={activeTool}
        onActivate={(id) => setActiveTool(id as ToolType)}
      />

      {showSnapToggle && (
        <ButtonGroup size="xs" isAttached variant="outline">
          <Tooltip label="Snap to grid" fontSize="xs">
            <Button
              bg={entitySnapMode === 'grid' ? 'purple.600' : 'transparent'}
              color={entitySnapMode === 'grid' ? 'white' : 'gray.400'}
              borderColor="gray.700"
              _hover={{
                bg: entitySnapMode === 'grid' ? 'purple.500' : 'gray.800',
              }}
              onClick={() => setEntitySnapMode('grid')}
            >
              <FiGrid />
            </Button>
          </Tooltip>
          <Tooltip label="Pixel perfect" fontSize="xs">
            <Button
              bg={entitySnapMode === 'pixel' ? 'purple.600' : 'transparent'}
              color={entitySnapMode === 'pixel' ? 'white' : 'gray.400'}
              borderColor="gray.700"
              _hover={{
                bg: entitySnapMode === 'pixel' ? 'purple.500' : 'gray.800',
              }}
              onClick={() => setEntitySnapMode('pixel')}
            >
              <FiMaximize />
            </Button>
          </Tooltip>
        </ButtonGroup>
      )}
    </HStack>
  );
};
