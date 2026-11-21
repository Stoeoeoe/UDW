import React from 'react';
import {
  HStack,
  Button,
  ButtonGroup,
  Tooltip,
  NumberInput,
  NumberInputField,
  Text,
} from '@chakra-ui/react';
import {
  FiEdit2,
  FiTrash2,
  FiUser,
  FiLink,
  FiShuffle,
  FiDroplet,
  FiGrid,
  FiMaximize,
  FiMousePointer,
  FiShield,
  FiNavigation,
  FiLayers,
  FiRefreshCw,
  FiBox,
  FiPenTool,
  FiPlay,
  FiCircle,
  FiMaximize2,
  FiMinimize2,
  FiWind,
  FiXCircle,
  FiHome,
} from 'react-icons/fi';
import { FaMountain } from 'react-icons/fa';
import { useEditorStore } from '../../store/useEditorStore';
import { getEffectiveToolLayerKind } from '../../store/storeHelpers';
import { ToolType } from '../../types/editor';
import { LayerKind } from '../../types/schema';
import { Toolbar, ToolItem } from '../common/Toolbar';

/** Tools shown per layer kind */
const TOOLS_BY_KIND: Record<LayerKind, ToolItem[]> = {
  terrain: [
    { id: 'terrain', icon: FaMountain, label: 'Paint Terrain (B)', group: 'terrain' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'terrain' },
  ],
  visual: [
    { id: 'stamp', icon: FiEdit2, label: 'Stamp (B)', group: 'tiles' },
    { id: 'random', icon: FiShuffle, label: 'Random (R)', group: 'tiles' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'tiles' },
    { id: 'fill', icon: FiDroplet, label: 'Bucket Fill (G)', group: 'tiles' },
  ],
  object: [
    {
      id: 'objectSelect',
      icon: FiMousePointer,
      label: 'Select / Move Object (M)',
      group: 'objects',
    },
    { id: 'objectPlace', icon: FiEdit2, label: 'Place Object (N)', group: 'objects' },
    { id: 'objectDelete', icon: FiTrash2, label: 'Delete Object (X)', group: 'objects' },
  ],
  building: [
    {
      id: 'buildingSelect',
      icon: FiMousePointer,
      label: 'Select / Move Building (M)',
      group: 'buildings',
    },
    { id: 'buildingPlace', icon: FiHome, label: 'Place Building (N)', group: 'buildings' },
  ],
  collision: [
    { id: 'collisionSelect', icon: FiMousePointer, label: 'Select / Move (V)', group: 'collision' },
    { id: 'collisionRect', icon: FiMaximize, label: 'Draw Rectangle (T)', group: 'collision' },
    { id: 'collisionPolygon', icon: FiPenTool, label: 'Draw Polygon', group: 'collision' },
    { id: 'collisionCircle', icon: FiCircle, label: 'Draw Circle', group: 'collision' },
  ],
  navigation: [
    { id: 'select', icon: FiMousePointer, label: 'Select (V)', group: 'nav' },
    { id: 'anchorPlace', icon: FiUser, label: 'Place Anchor (A)', group: 'nav' },
    { id: 'triggerPlace', icon: FiMaximize, label: 'Draw Trigger (T)', group: 'nav' },
    { id: 'triggerPolygon', icon: FiPenTool, label: 'Draw Polygon Trigger', group: 'nav' },
    { id: 'linkPlace', icon: FiLink, label: 'Link (N) — click a trigger', group: 'nav' },
  ],
  metadata: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'metadata' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'metadata' },
  ],
  water: [
    { id: 'waterBrush', icon: FiEdit2, label: 'Paint Water (B)', group: 'water' },
    { id: 'waterErase', icon: FiTrash2, label: 'Erase Water (E)', group: 'water' },
    { id: 'waterFlow', icon: FiWind, label: 'Draw Current (F)', group: 'water-flow' },
    { id: 'waterFlowErase', icon: FiXCircle, label: 'Remove Current', group: 'water-flow' },
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
  const waterBrushRadius = useEditorStore((state) => state.waterBrushRadius);
  const setWaterBrushRadius = useEditorStore((state) => state.setWaterBrushRadius);
  const waterFlowStrokeWidth = useEditorStore((state) => state.waterFlowStrokeWidth);
  const setWaterFlowStrokeWidth = useEditorStore((state) => state.setWaterFlowStrokeWidth);
  const waterFlowSpeed = useEditorStore((state) => state.waterFlowSpeed);
  const setWaterFlowSpeed = useEditorStore((state) => state.setWaterFlowSpeed);

  const selectedLayer = currentMap?.layers.find((l) => l.id === selectedLayerId);
  const effectiveKind = selectedLayer ? getEffectiveToolLayerKind(selectedLayer) : null;
  const tools = effectiveKind ? (TOOLS_BY_KIND[effectiveKind] ?? FALLBACK_TOOLS) : FALLBACK_TOOLS;

  const showSnapToggle =
    selectedLayer?.kind === 'entity' ||
    selectedLayer?.kind === 'navigation' ||
    selectedLayer?.kind === 'collision' ||
    effectiveKind === 'object';

  return (
    <HStack spacing={4}>
      <Toolbar
        items={tools}
        activeId={activeTool}
        onActivate={(id) => setActiveTool(id as ToolType)}
      />

      {selectedLayer?.kind === 'water' &&
        (activeTool === 'waterBrush' || activeTool === 'waterErase') && (
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400">
              Brush radius (px)
            </Text>
            <NumberInput
              size="xs"
              w="16"
              min={0}
              max={64}
              value={waterBrushRadius}
              onChange={(_, value) => setWaterBrushRadius(Number.isNaN(value) ? 0 : value)}
            >
              <NumberInputField />
            </NumberInput>
          </HStack>
        )}

      {selectedLayer?.kind === 'water' && activeTool === 'waterFlow' && (
        <HStack spacing={2}>
          <Text fontSize="xs" color="gray.400">
            Reach (px)
          </Text>
          <NumberInput
            size="xs"
            w="16"
            min={2}
            max={128}
            value={waterFlowStrokeWidth}
            onChange={(_, value) => setWaterFlowStrokeWidth(Number.isNaN(value) ? 2 : value)}
          >
            <NumberInputField />
          </NumberInput>
          <Text fontSize="xs" color="gray.400">
            Speed
          </Text>
          <NumberInput
            size="xs"
            w="16"
            min={0.1}
            max={4}
            step={0.1}
            value={waterFlowSpeed}
            onChange={(_, value) => setWaterFlowSpeed(Number.isNaN(value) ? 1 : value)}
          >
            <NumberInputField />
          </NumberInput>
        </HStack>
      )}

      {showSnapToggle && (
        <ButtonGroup size="xs" isAttached variant="outline">
          <Tooltip label="Snap to grid" fontSize="xs">
            <Button
              bg={entitySnapMode === 'grid' ? 'purple.600' : 'transparent'}
              color={entitySnapMode === 'grid' ? 'white' : 'gray.400'}
              borderColor="editorBorderLight"
              _hover={{ bg: entitySnapMode === 'grid' ? 'purple.500' : 'gray.800' }}
              onClick={() => setEntitySnapMode('grid')}
            >
              <FiGrid />
            </Button>
          </Tooltip>
          <Tooltip label="Pixel perfect" fontSize="xs">
            <Button
              bg={entitySnapMode === 'pixel' ? 'purple.600' : 'transparent'}
              color={entitySnapMode === 'pixel' ? 'white' : 'gray.400'}
              borderColor="editorBorderLight"
              _hover={{ bg: entitySnapMode === 'pixel' ? 'purple.500' : 'gray.800' }}
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

export const MapToolbarActions: React.FC = () => {
  const showCollisionOverlay = useEditorStore((state) => state.showCollisionOverlay);
  const setShowCollisionOverlay = useEditorStore((state) => state.setShowCollisionOverlay);
  const showNavigationCostOverlay = useEditorStore((state) => state.showNavigationCostOverlay);
  const setShowNavigationCostOverlay = useEditorStore(
    (state) => state.setShowNavigationCostOverlay,
  );
  const showTerrainOverlay = useEditorStore((state) => state.showTerrainOverlay);
  const setShowTerrainOverlay = useEditorStore((state) => state.setShowTerrainOverlay);
  const show3DLayerView = useEditorStore((state) => state.show3DLayerView);
  const setShow3DLayerView = useEditorStore((state) => state.setShow3DLayerView);
  const showMapTestMode = useEditorStore((state) => state.showMapTestMode);
  const setShowMapTestMode = useEditorStore((state) => state.setShowMapTestMode);
  const mapFullscreen = useEditorStore((state) => state.mapFullscreen);
  const setMapFullscreen = useEditorStore((state) => state.setMapFullscreen);
  const reloadTerrainLayers = useEditorStore((state) => state.reloadTerrainLayers);

  return (
    <HStack spacing={2}>
      <Tooltip
        label={showCollisionOverlay ? 'Hide collision overlay' : 'Show collision overlay'}
        fontSize="xs"
      >
        <Button
          size="xs"
          variant={showCollisionOverlay ? 'solid' : 'outline'}
          colorScheme="orange"
          onClick={() => setShowCollisionOverlay(!showCollisionOverlay)}
          aria-label="Toggle collision overlay"
        >
          <FiShield />
        </Button>
      </Tooltip>

      <Tooltip
        label={
          showNavigationCostOverlay
            ? 'Hide navigation cost overlay'
            : 'Show navigation cost overlay'
        }
        fontSize="xs"
      >
        <Button
          size="xs"
          variant={showNavigationCostOverlay ? 'solid' : 'outline'}
          colorScheme="teal"
          onClick={() => setShowNavigationCostOverlay(!showNavigationCostOverlay)}
          aria-label="Toggle navigation cost overlay"
        >
          <FiNavigation />
        </Button>
      </Tooltip>

      <Tooltip label="Reload terrain layers" fontSize="xs">
        <Button
          size="xs"
          variant="outline"
          colorScheme="green"
          onClick={reloadTerrainLayers}
          aria-label="Reload terrain layers"
        >
          <FiRefreshCw />
        </Button>
      </Tooltip>

      <Tooltip
        label={showTerrainOverlay ? 'Hide terrain overlay' : 'Show terrain overlay'}
        fontSize="xs"
      >
        <Button
          size="xs"
          variant={showTerrainOverlay ? 'solid' : 'outline'}
          colorScheme="green"
          onClick={() => {
            setShowTerrainOverlay(!showTerrainOverlay);
            if (!showTerrainOverlay) setShow3DLayerView(false);
            if (!showTerrainOverlay) setShowMapTestMode(false);
          }}
          aria-label="Toggle terrain overlay"
        >
          <FiLayers />
        </Button>
      </Tooltip>

      <Tooltip label={show3DLayerView ? 'Exit 3D layer view' : 'Show 3D layer view'} fontSize="xs">
        <Button
          size="xs"
          variant={show3DLayerView ? 'solid' : 'outline'}
          colorScheme="purple"
          onClick={() => {
            const next = !show3DLayerView;
            setShow3DLayerView(next);
            if (next) {
              setShowMapTestMode(false);
              setShowCollisionOverlay(false);
              setShowTerrainOverlay(false);
            }
          }}
          aria-label="Toggle 3D layer view"
        >
          <FiBox />
        </Button>
      </Tooltip>

      <Tooltip label={showMapTestMode ? 'Exit map test mode' : 'Enter map test mode'} fontSize="xs">
        <Button
          size="xs"
          variant={showMapTestMode ? 'solid' : 'outline'}
          colorScheme="teal"
          onClick={() => {
            const next = !showMapTestMode;
            setShowMapTestMode(next);
            if (next) {
              setShow3DLayerView(false);
              setShowCollisionOverlay(false);
              setShowTerrainOverlay(false);
            }
          }}
          aria-label="Toggle map test mode"
        >
          <FiPlay />
        </Button>
      </Tooltip>

      <Tooltip
        label={mapFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map (Ctrl+Shift+F)'}
        fontSize="xs"
      >
        <Button
          size="xs"
          variant={mapFullscreen ? 'solid' : 'outline'}
          colorScheme="blue"
          onClick={() => setMapFullscreen(!mapFullscreen)}
          aria-label={mapFullscreen ? 'Exit fullscreen map' : 'Fullscreen map'}
        >
          {mapFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
        </Button>
      </Tooltip>
    </HStack>
  );
};
