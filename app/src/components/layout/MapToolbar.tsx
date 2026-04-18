import React from 'react';
import { HStack, Button, ButtonGroup, Tooltip } from '@chakra-ui/react';
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
  FiLayers,
  FiRefreshCw,
  FiRotateCcw,
  FiRotateCw,
  FiBox,
  FiPenTool,
  FiPlay,
} from 'react-icons/fi';
import { FaMountain } from 'react-icons/fa';
import {
  redoEditorChange,
  undoEditorChange,
  useEditorHistory,
  useEditorStore,
} from '../../store/useEditorStore';
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
  collision: [
    { id: 'stamp', icon: FiEdit2, label: 'Paint (B)', group: 'collision' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'collision' },
    { id: 'fill', icon: FiDroplet, label: 'Fill (G)', group: 'collision' },
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

  const selectedLayer = currentMap?.layers.find((l) => l.id === selectedLayerId);
  const tools = selectedLayer
    ? (TOOLS_BY_KIND[selectedLayer.kind] ?? FALLBACK_TOOLS)
    : FALLBACK_TOOLS;

  const showSnapToggle = selectedLayer?.kind === 'entity' || selectedLayer?.kind === 'navigation';

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
  const showTerrainOverlay = useEditorStore((state) => state.showTerrainOverlay);
  const setShowTerrainOverlay = useEditorStore((state) => state.setShowTerrainOverlay);
  const show3DLayerView = useEditorStore((state) => state.show3DLayerView);
  const setShow3DLayerView = useEditorStore((state) => state.setShow3DLayerView);
  const showMapTestMode = useEditorStore((state) => state.showMapTestMode);
  const setShowMapTestMode = useEditorStore((state) => state.setShowMapTestMode);
  const reloadTerrainLayers = useEditorStore((state) => state.reloadTerrainLayers);
  const { canUndo, canRedo } = useEditorHistory((state) => ({
    canUndo: state.pastStates.length > 0,
    canRedo: state.futureStates.length > 0,
  }));

  return (
    <HStack spacing={2}>
      <Tooltip label="Undo (Ctrl+Z)" fontSize="xs">
        <Button
          size="xs"
          variant="outline"
          onClick={undoEditorChange}
          isDisabled={!canUndo}
          aria-label="Undo"
        >
          <FiRotateCcw />
        </Button>
      </Tooltip>

      <Tooltip label="Redo (Ctrl+Y)" fontSize="xs">
        <Button
          size="xs"
          variant="outline"
          onClick={redoEditorChange}
          isDisabled={!canRedo}
          aria-label="Redo"
        >
          <FiRotateCw />
        </Button>
      </Tooltip>

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
    </HStack>
  );
};
