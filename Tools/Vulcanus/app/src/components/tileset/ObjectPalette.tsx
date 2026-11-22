import React from 'react';
import { Box, Flex, Input, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import PanelHeader from '../common/PanelHeader';
import { CaptionText } from '../common/Typography.tsx';
import { useEditorStore } from '../../store/useEditorStore';
import { objectSize } from '../../lib/objects';
import type { Tileset } from '../../types/schema';
import type { ObjectDefinition } from '../../types/object';

const PREVIEW_SCALE = 1.25;

const ObjectPreviewCanvas: React.FC<{
  tileset: Tileset;
  object: ObjectDefinition;
  tileSize: number;
  sprite?: HTMLImageElement;
}> = ({ tileset, object, tileSize, sprite }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const size = objectSize(object.tiles);
  const width = Math.ceil(Math.max(1, size.width) * tileSize * PREVIEW_SCALE);
  const height = Math.ceil(Math.max(1, size.height) * tileSize * PREVIEW_SCALE);

  React.useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    if (!sprite) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const scaled = tileSize * PREVIEW_SCALE;
    for (const tile of object.tiles) {
      ctx.drawImage(
        sprite,
        (tile.tileIndex % tileset.columns) * tileSize,
        Math.floor(tile.tileIndex / tileset.columns) * tileSize,
        tileSize,
        tileSize,
        tile.x * scaled,
        tile.y * scaled,
        scaled,
        scaled,
      );
    }
  }, [height, object.tiles, sprite, tileSize, tileset.columns, width]);

  return (
    <Box bg="editorCanvasBg" borderRadius="sm" p={1.5} display="flex" justifyContent="center">
      <canvas ref={canvasRef} className="image-pixelated" width={width} height={height} />
    </Box>
  );
};

/** The project's objects, to choose one to place on the selected object layer. */
export const ObjectPalette: React.FC = () => {
  const objects = useEditorStore((state) => state.objects);
  const tilesets = useEditorStore((state) => state.tilesets);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const setSelectedObject = useEditorStore((state) => state.setSelectedObject);
  const tileSize = useEditorStore((state) => state.project?.tileSize ?? 16);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const [search, setSearch] = React.useState('');

  const query = search.trim().toLowerCase();
  const shown = objects
    .filter(
      (object) =>
        object.tiles.length > 0 &&
        (!query ||
          object.name.toLowerCase().includes(query) ||
          (object.folderPath ?? '').toLowerCase().includes(query) ||
          (object.tags ?? []).some((tag) => tag.toLowerCase().includes(query))),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const selected = objects.find((object) => object.id === selectedObjectId);

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      <PanelHeader
        left={
          <Input
            size="xs"
            maxW="220px"
            placeholder="Search objects, folders, tags"
            aria-label="Search objects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
        actions={
          selected ? (
            <Text fontSize="9px" fontWeight="black" color="green.400" textTransform="uppercase">
              {selected.name}
            </Text>
          ) : null
        }
      />

      <Box flex={1} overflowY="auto" px={3} py={3}>
        {shown.length > 0 ? (
          <Wrap spacing={2.5} align="flex-end">
            {shown.map((object) => {
              const tileset = tilesets.get(object.tilesetId);
              const isSelected = object.id === selectedObjectId;
              return (
                <WrapItem key={object.id} alignSelf="flex-end">
                  <Box
                    as="button"
                    type="button"
                    textAlign="left"
                    onClick={() => setSelectedObject(object.id)}
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
                      {tileset && (
                        <ObjectPreviewCanvas
                          tileset={tileset}
                          object={object}
                          tileSize={tileSize}
                          sprite={loadedSprites.get(tileset.spriteSheet)}
                        />
                      )}
                      <VStack spacing={0.25} align="stretch">
                        <Text fontSize="10px" fontWeight="bold" color="gray.100" noOfLines={1}>
                          {object.name}
                        </Text>
                        <CaptionText color="gray.500" noOfLines={1}>
                          {object.folderPath || object.id}
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
                {query ? 'No objects match' : 'No objects yet'}
              </Text>
              <CaptionText color="gray.600">
                Create objects in the explorer or from tiles in the tileset editor, then place them
                from here.
              </CaptionText>
            </VStack>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};
