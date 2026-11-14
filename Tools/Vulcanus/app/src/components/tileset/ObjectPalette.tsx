import React from 'react';
import { Box, Flex, HStack, Select, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import PanelHeader from '../common/PanelHeader';
import { CaptionText } from '../common/Typography.tsx';
import { useEditorStore } from '../../store/useEditorStore';
import {
  buildPatternFromObjectDefinition,
  getTileIndicesForObjectDefinition,
} from '../../lib/tilesetObjects';
import type { Tileset, TilesetObjectDefinition } from '../../types/schema';

const PREVIEW_SCALE = 1.25;

function selectObjectDefinition(
  tileset: Tileset,
  objectDefinition: TilesetObjectDefinition,
  setSelectedObjectDefinition: (id: string | null) => void,
  setSelectedTile: (index: number | null) => void,
  setSelectedTiles: (indices: number[]) => void,
  setSampledPattern: ReturnType<typeof useEditorStore.getState>['setSampledPattern'],
) {
  const pattern = buildPatternFromObjectDefinition(objectDefinition);
  if (!pattern) {
    return;
  }

  setSelectedTile(null);
  setSelectedTiles(getTileIndicesForObjectDefinition(objectDefinition, tileset));
  setSampledPattern({
    tilesetId: tileset.id,
    pattern: pattern.pattern,
    width: pattern.width,
    height: pattern.height,
  });
  setSelectedObjectDefinition(objectDefinition.id);
}

const ObjectPreviewCanvas: React.FC<{
  tileset: Tileset;
  objectDefinition: TilesetObjectDefinition;
  tileSize: number;
  sprite?: HTMLImageElement;
}> = ({ tileset, objectDefinition, tileSize, sprite }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const bounds = React.useMemo(() => {
    if (objectDefinition.tiles.length === 0) {
      return { width: tileSize, height: tileSize };
    }
    const maxX = Math.max(...objectDefinition.tiles.map((tile) => tile.x));
    const maxY = Math.max(...objectDefinition.tiles.map((tile) => tile.y));
    return {
      width: (maxX + 1) * tileSize,
      height: (maxY + 1) * tileSize,
    };
  }, [objectDefinition.tiles, tileSize]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaledWidth = Math.ceil(bounds.width * PREVIEW_SCALE);
    const scaledHeight = Math.ceil(bounds.height * PREVIEW_SCALE);
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    ctx.clearRect(0, 0, scaledWidth, scaledHeight);
    ctx.imageSmoothingEnabled = false;

    if (!sprite) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      ctx.strokeStyle = '#4b5563';
      ctx.strokeRect(0.5, 0.5, scaledWidth - 1, scaledHeight - 1);
      return;
    }

    for (const tile of objectDefinition.tiles) {
      const sourceX = (tile.tileIndex % tileset.columns) * tileSize;
      const sourceY = Math.floor(tile.tileIndex / tileset.columns) * tileSize;
      ctx.drawImage(
        sprite,
        sourceX,
        sourceY,
        tileSize,
        tileSize,
        tile.x * tileSize * PREVIEW_SCALE,
        tile.y * tileSize * PREVIEW_SCALE,
        tileSize * PREVIEW_SCALE,
        tileSize * PREVIEW_SCALE,
      );
    }
  }, [bounds.height, bounds.width, objectDefinition, sprite, tileSize, tileset.columns]);

  return (
    <Box
      bg="editorCanvasBg"
      borderRadius="sm"
      px={1.5}
      py={1.5}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <canvas
        ref={canvasRef}
        className="image-pixelated"
        width={Math.ceil(bounds.width * PREVIEW_SCALE)}
        height={Math.ceil(bounds.height * PREVIEW_SCALE)}
      />
    </Box>
  );
};

export const ObjectPalette: React.FC = () => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const selectedObjectDefinitionId = useEditorStore((state) => state.selectedObjectDefinitionId);
  const setSelectedObjectDefinition = useEditorStore((state) => state.setSelectedObjectDefinition);
  const setSampledPattern = useEditorStore((state) => state.setSampledPattern);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const setSelectedTile = useEditorStore((state) => state.setSelectedTile);
  const tileSize = useEditorStore((state) => state.project?.tileSize ?? 16);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);

  const activeTileset = React.useMemo(
    () => tilesets.find((tileset) => tileset.id === activeTilesetId) ?? tilesets[0] ?? null,
    [activeTilesetId, tilesets],
  );

  const objectDefinitions = activeTileset?.objects ?? [];
  const selectedObjectDefinition =
    objectDefinitions.find(
      (objectDefinition) => objectDefinition.id === selectedObjectDefinitionId,
    ) ?? null;

  React.useEffect(() => {
    if (!activeTilesetId && activeTileset) {
      setActiveTileset(activeTileset.id);
    }
  }, [activeTileset, activeTilesetId, setActiveTileset]);

  if (tilesets.length === 0) {
    return (
      <Flex h="full" align="center" justify="center" p={4} textAlign="center">
        <Text fontSize="xs" color="gray.600">
          No tilesets available. Import one in the Tilesets tab first.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      <PanelHeader
        left={
          <HStack spacing={2}>
            <Select
              size="xs"
              variant="filled"
              bg="editorCanvasBg"
              borderColor="editorFieldBorder"
              _hover={{ bg: 'editorShellBorder' }}
              value={activeTileset?.id ?? ''}
              onChange={(event) => setActiveTileset(event.target.value)}
              color="green.300"
              fontSize="10px"
              fontWeight="bold"
              h="6"
              maxW="180px"
            >
              {tilesets.map((tileset) => (
                <option key={tileset.id} value={tileset.id}>
                  {tileset.name.toUpperCase()}
                </option>
              ))}
            </Select>
          </HStack>
        }
        actions={
          selectedObjectDefinition ? (
            <Text fontSize="9px" fontWeight="black" color="green.400" textTransform="uppercase">
              {selectedObjectDefinition.name}
            </Text>
          ) : null
        }
      />

      <Box px={3} py={2} borderBottom="1px" borderColor="editorShellBorder" bg="editorPanelBg">
        <CaptionText color="gray.500">
          Select a reusable object, then stamp it into the map as a single placed instance.
        </CaptionText>
      </Box>

      <Box flex={1} overflowY="auto" px={3} py={3}>
        {activeTileset && objectDefinitions.length > 0 ? (
          <Wrap spacing={2.5} align="flex-end">
            {objectDefinitions.map((objectDefinition) => {
              const isSelected = objectDefinition.id === selectedObjectDefinitionId;
              return (
                <WrapItem key={objectDefinition.id} alignSelf="flex-end">
                  <Box
                    as="button"
                    type="button"
                    textAlign="left"
                    onClick={() =>
                      selectObjectDefinition(
                        activeTileset,
                        objectDefinition,
                        setSelectedObjectDefinition,
                        setSelectedTile,
                        setSelectedTiles,
                        setSampledPattern,
                      )
                    }
                    borderRadius="md"
                    border="1px"
                    borderColor={isSelected ? 'green.400' : 'whiteAlpha.100'}
                    bg="transparent"
                    px={2}
                    py={2}
                    minW="112px"
                    maxW="148px"
                    _hover={{ borderColor: isSelected ? 'green.300' : 'whiteAlpha.300' }}
                    transition="border-color 0.1s ease"
                  >
                    <VStack spacing={1.5} align="stretch">
                      <ObjectPreviewCanvas
                        tileset={activeTileset}
                        objectDefinition={objectDefinition}
                        tileSize={tileSize}
                        sprite={loadedSprites.get(activeTileset.spriteSheet)}
                      />

                      <VStack spacing={0.25} align="stretch">
                        <Text fontSize="10px" fontWeight="bold" color="gray.100" noOfLines={1}>
                          {objectDefinition.name}
                        </Text>
                        <CaptionText color="gray.500" noOfLines={1}>
                          {objectDefinition.id}
                        </CaptionText>
                      </VStack>
                    </VStack>
                  </Box>
                </WrapItem>
              );
            })}
          </Wrap>
        ) : (
          <Flex h="full" align="center" justify="center" p={4} textAlign="center">
            <VStack spacing={2}>
              <Text fontSize="xs" color="gray.500" fontWeight="bold">
                No objects in this tileset yet
              </Text>
              <CaptionText color="gray.600">
                Create objects in the Tileset Editor first, then place them from here.
              </CaptionText>
            </VStack>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default ObjectPalette;
