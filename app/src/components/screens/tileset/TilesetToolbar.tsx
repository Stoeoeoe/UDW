import React from 'react';
import { HStack, Button, Tooltip } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2, FiShield } from 'react-icons/fi';
import Toolbar, { ToolItem } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';

export const TilesetToolbar: React.FC = () => {
  const tilesetToolMode = useEditorStore((state) => state.tilesetToolMode);
  const setTilesetToolMode = useEditorStore((state) => state.setTilesetToolMode);
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const showTilesetCollisionOverlay = useEditorStore((state) => state.showTilesetCollisionOverlay);
  const setShowTilesetCollisionOverlay = useEditorStore(
    (state) => state.setShowTilesetCollisionOverlay,
  );

  const TOOLS: ToolItem[] = [
    { id: 'select', icon: FiMousePointer, label: 'Select', group: 'main' },
    { id: 'terrain', icon: FiEdit2, label: 'Terrain Paint', group: 'main' },
  ];

  // Only show the terrain tool if the project has at least one terrain type
  const visibleTools =
    terrainTypes && terrainTypes.length > 0 ? TOOLS : TOOLS.filter((t) => t.id !== 'terrain');

  return (
    <HStack spacing={4}>
      <Toolbar
        items={visibleTools}
        activeId={tilesetToolMode}
        onActivate={(id) => setTilesetToolMode(id as 'select' | 'terrain')}
      />
      <Tooltip
        label={showTilesetCollisionOverlay ? 'Hide collision overlays' : 'Show collision overlays'}
        fontSize="xs"
      >
        <Button
          size="xs"
          variant={showTilesetCollisionOverlay ? 'solid' : 'outline'}
          colorScheme="orange"
          aria-label="Toggle tileset collision overlays"
          onClick={() => setShowTilesetCollisionOverlay(!showTilesetCollisionOverlay)}
        >
          <FiShield />
        </Button>
      </Tooltip>
    </HStack>
  );
};
