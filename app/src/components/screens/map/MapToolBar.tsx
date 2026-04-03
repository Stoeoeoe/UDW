import React from 'react';
import { HStack, Button, ButtonGroup, Tooltip } from '@chakra-ui/react';
import {
  FiMousePointer,
  FiEdit2,
  FiSlash,
  FiDroplet,
  FiUser,
  FiCircle,
  FiSquare,
  FiTarget,
  FiShuffle,
  FiMove,
  FiTrash2,
  FiGrid,
  FiMaximize,
} from 'react-icons/fi';
import Toolbar, { ToolItem } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';
import { ToolType } from '../../../types/editor';
import { LayerKind } from '../../../types/schema';

/** Tools visible per layer kind */
const TOOLS_BY_KIND: Record<LayerKind, ToolItem[]> = {
  visual: [
    { id: 'select', icon: FiMousePointer, label: 'Select (V)', group: 'tiles' },
    { id: 'stamp', icon: FiEdit2, label: 'Stamp (B)', group: 'tiles' },
    { id: 'random', icon: FiShuffle, label: 'Random (R)', group: 'tiles' },
    { id: 'erase', icon: FiSlash, label: 'Erase (E)', group: 'tiles' },
    { id: 'fill', icon: FiDroplet, label: 'Bucket Fill (G)', group: 'tiles' },
  ],
  collision: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'collision' },
    { id: 'erase', icon: FiSlash, label: 'Erase (E)', group: 'collision' },
    { id: 'fill', icon: FiDroplet, label: 'Fill (G)', group: 'collision' },
  ],
  navigation: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'navigation' },
    { id: 'erase', icon: FiSlash, label: 'Erase (E)', group: 'navigation' },
    { id: 'fill', icon: FiDroplet, label: 'Fill (G)', group: 'navigation' },
  ],
  metadata: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'metadata' },
    { id: 'erase', icon: FiSlash, label: 'Erase (E)', group: 'metadata' },
  ],
  entity: [
    {
      id: 'entityPlace',
      icon: FiUser,
      label: 'Place Entity (N)',
      group: 'entities',
    },
    {
      id: 'entitySelect',
      icon: FiMove,
      label: 'Move Entity (M)',
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

/** Fallback when no layer / unknown kind */
const GENERIC_TOOLS: ToolItem[] = [
  { id: 'select', icon: FiMousePointer, label: 'Select (V)', group: 'generic' },
];

export const MapToolbar: React.FC = () => {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const drawMode = useEditorStore((state) => state.drawMode);
  const setDrawMode = useEditorStore((state) => state.setDrawMode);
  const entitySnapMode = useEditorStore((state) => state.entitySnapMode);
  const setEntitySnapMode = useEditorStore((state) => state.setEntitySnapMode);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const currentMap = useEditorStore((state) => state.currentMap);

  const selectedLayer = currentMap?.layers.find((l) => l.id === selectedLayerId);
  const tools = selectedLayer
    ? (TOOLS_BY_KIND[selectedLayer.kind] ?? GENERIC_TOOLS)
    : GENERIC_TOOLS;

  const onActivate = (id?: string) => {
    if (!id) return;
    setActiveTool(id as ToolType);
  };

  const showDrawModes =
    ['stamp', 'random', 'erase'].includes(activeTool) && selectedLayer?.kind !== 'entity';
  const showSnapToggle =
    selectedLayer?.kind === 'entity' && ['entityPlace', 'entitySelect'].includes(activeTool);

  return (
    <HStack spacing={4}>
      <Toolbar items={tools} activeId={activeTool} onActivate={onActivate} />

      {showDrawModes && (
        <HStack
          bg="gray.900"
          p="1"
          rounded="xl"
          border="1px"
          borderColor="gray.800"
          spacing="1"
          boxShadow="lg"
        >
          <Button
            aria-label="Point"
            onClick={() => setDrawMode('point')}
            size="xs"
            variant={drawMode === 'point' ? 'solid' : 'ghost'}
            colorScheme="blue"
          >
            <FiTarget />
          </Button>
          <Button
            aria-label="Rect"
            onClick={() => setDrawMode('rect')}
            size="xs"
            variant={drawMode === 'rect' ? 'solid' : 'ghost'}
            colorScheme="blue"
          >
            <FiSquare />
          </Button>
          <Button
            aria-label="Circle"
            onClick={() => setDrawMode('circle')}
            size="xs"
            variant={drawMode === 'circle' ? 'solid' : 'ghost'}
            colorScheme="blue"
          >
            <FiCircle />
          </Button>
        </HStack>
      )}

      {showSnapToggle && (
        <ButtonGroup size="xs" isAttached variant="outline" colorScheme="purple">
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
