import React from 'react';
import { HStack } from '@chakra-ui/react';
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
  FiLink,
  FiMapPin,
} from 'react-icons/fi';
import Toolbar, { ToolItem, ToolbarShell, ToolbarToggleButton } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';
import { ToolType } from '../../../types/editor';
import { LayerKind } from '../../../types/schema';

/** Tools visible per layer kind — excludes the global select which is always shown separately */
const TOOLS_BY_KIND: Partial<Record<LayerKind, ToolItem[]>> = {
  terrain: [
    { id: 'terrain', icon: FiEdit2, label: 'Paint Terrain (B)', group: 'terrain' },
    { id: 'erase', icon: FiSlash, label: 'Erase (E)', group: 'terrain' },
  ],
  visual: [
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
    { id: 'entityPlace', icon: FiUser, label: 'Place Entity (N)', group: 'entities' },
    { id: 'entitySelect', icon: FiMove, label: 'Move Entity (M)', group: 'entities' },
    { id: 'entityDelete', icon: FiTrash2, label: 'Delete Entity (X)', group: 'entities' },
  ],
  anchor: [
    { id: 'anchorPlace', icon: FiMapPin, label: 'Place Anchor (N)', group: 'anchors' },
    { id: 'anchorSelect', icon: FiMove, label: 'Move Anchor (M)', group: 'anchors' },
    { id: 'anchorDelete', icon: FiTrash2, label: 'Delete Anchor (X)', group: 'anchors' },
  ],
  locationlink: [
    { id: 'linkPlace', icon: FiLink, label: 'Place Link (N)', group: 'links' },
    { id: 'linkSelect', icon: FiMove, label: 'Select / Move (M)', group: 'links' },
    { id: 'linkDelete', icon: FiTrash2, label: 'Delete Link (X)', group: 'links' },
  ],
};

/** The global select tool — always visible, leftmost */
const GLOBAL_SELECT_TOOL: ToolItem = {
  id: 'select',
  icon: FiMousePointer,
  label: 'Select Anything (V)',
  group: 'global',
};

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
  const layerTools = selectedLayer ? (TOOLS_BY_KIND[selectedLayer.kind] ?? []) : [];

  const onActivate = (id?: string) => {
    if (!id) return;
    setActiveTool(id as ToolType);
  };

  const showDrawModes =
    (['stamp', 'random', 'erase'].includes(activeTool) && selectedLayer?.kind !== 'entity') ||
    (activeTool === 'terrain' && selectedLayer?.kind === 'terrain');

  const showSnapToggle =
    (selectedLayer?.kind === 'entity' && ['entitySelect', 'entityPlace'].includes(activeTool)) ||
    (selectedLayer?.kind === 'anchor' && ['anchorSelect', 'anchorPlace'].includes(activeTool)) ||
    (selectedLayer?.kind === 'locationlink' && ['linkSelect', 'linkPlace'].includes(activeTool));

  return (
    <HStack spacing={2}>
      <Toolbar
        items={[GLOBAL_SELECT_TOOL]}
        activeId={activeTool}
        onActivate={onActivate}
        shellProps={{ borderColor: activeTool === 'select' ? 'blue.600' : 'gray.800' }}
      />

      {/* Layer-specific tools */}
      {layerTools.length > 0 && (
        <Toolbar items={layerTools} activeId={activeTool} onActivate={onActivate} />
      )}

      {/* Draw mode selector */}
      {showDrawModes && (
        <ToolbarShell>
          <ToolbarToggleButton
            label="Point"
            icon={<FiTarget />}
            isActive={drawMode === 'point'}
            onClick={() => setDrawMode('point')}
          />
          <ToolbarToggleButton
            label="Rect"
            icon={<FiSquare />}
            isActive={drawMode === 'rect'}
            onClick={() => setDrawMode('rect')}
          />
          <ToolbarToggleButton
            label="Circle"
            icon={<FiCircle />}
            isActive={drawMode === 'circle'}
            onClick={() => setDrawMode('circle')}
          />
        </ToolbarShell>
      )}

      {/* Snap toggle */}
      {showSnapToggle && (
        <ToolbarShell>
          <ToolbarToggleButton
            label="Snap to grid"
            icon={<FiGrid />}
            colorScheme="purple"
            isActive={entitySnapMode === 'grid'}
            onClick={() => setEntitySnapMode('grid')}
          />
          <ToolbarToggleButton
            label="Pixel perfect"
            icon={<FiMaximize />}
            colorScheme="purple"
            isActive={entitySnapMode === 'pixel'}
            onClick={() => setEntitySnapMode('pixel')}
          />
        </ToolbarShell>
      )}
    </HStack>
  );
};
