import React from 'react';
import { HStack } from '@chakra-ui/react';
import {
  FiMousePointer,
  FiEdit2,
  FiShield,
  FiArrowDown,
  FiBox,
  FiNavigation,
} from 'react-icons/fi';
import Toolbar, { ToolItem, ToolbarShell, ToolbarToggleButton } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';

export const TilesetToolbar: React.FC = () => {
  const tilesetToolMode = useEditorStore((state) => state.tilesetToolMode);
  const setTilesetToolMode = useEditorStore((state) => state.setTilesetToolMode);
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const showTilesetCollisionOverlay = useEditorStore((state) => state.showTilesetCollisionOverlay);
  const setShowTilesetCollisionOverlay = useEditorStore(
    (state) => state.setShowTilesetCollisionOverlay,
  );
  const showTilesetSortPivotOverlay = useEditorStore((state) => state.showTilesetSortPivotOverlay);
  const setShowTilesetSortPivotOverlay = useEditorStore(
    (state) => state.setShowTilesetSortPivotOverlay,
  );

  const showTilesetNavigationCostOverlay = useEditorStore(
    (state) => state.showTilesetNavigationCostOverlay,
  );
  const setShowTilesetNavigationCostOverlay = useEditorStore(
    (state) => state.setShowTilesetNavigationCostOverlay,
  );

  const TOOLS: ToolItem[] = [
    { id: 'select', icon: FiMousePointer, label: 'Select', group: 'main' },
    { id: 'objects', icon: FiBox, label: 'Objects', group: 'main' },
    { id: 'terrain', icon: FiEdit2, label: 'Terrain Paint', group: 'main' },
  ];

  // Only show the terrain tool if the project has at least one terrain type
  const visibleTools =
    terrainTypes && terrainTypes.length > 0 ? TOOLS : TOOLS.filter((t) => t.id !== 'terrain');

  return (
    <HStack spacing={2}>
      <Toolbar
        items={visibleTools}
        activeId={tilesetToolMode}
        onActivate={(id) => setTilesetToolMode(id as 'select' | 'terrain' | 'objects')}
      />
      <ToolbarShell>
        <ToolbarToggleButton
          label={
            showTilesetCollisionOverlay ? 'Hide collision overlays' : 'Show collision overlays'
          }
          icon={<FiShield />}
          colorScheme="orange"
          isActive={showTilesetCollisionOverlay}
          onClick={() => setShowTilesetCollisionOverlay(!showTilesetCollisionOverlay)}
        />
        <ToolbarToggleButton
          label={
            showTilesetSortPivotOverlay ? 'Hide sort pivot overlay' : 'Show sort pivot overlay'
          }
          icon={<FiArrowDown />}
          colorScheme="cyan"
          isActive={showTilesetSortPivotOverlay}
          onClick={() => setShowTilesetSortPivotOverlay(!showTilesetSortPivotOverlay)}
        />
        <ToolbarToggleButton
          label={
            showTilesetNavigationCostOverlay
              ? 'Hide navigation cost overlay'
              : 'Show navigation cost overlay'
          }
          icon={<FiNavigation />}
          colorScheme="green"
          isActive={showTilesetNavigationCostOverlay}
          onClick={() => setShowTilesetNavigationCostOverlay(!showTilesetNavigationCostOverlay)}
        />
      </ToolbarShell>
    </HStack>
  );
};
