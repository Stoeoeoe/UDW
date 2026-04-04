import React, { useState } from 'react';
import {
  VStack,
  Box,
  Text,
  Button,
  Input,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  HStack,
  useToast,
  Image,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { fileSystem } from '../../lib/fileSystem';
import { resolveSpriteAsset } from '../../lib/asepriteUtils';

interface Props {
  onCreate?: () => void;
  onCancel?: () => void;
}

export const TilesetCreator: React.FC<Props> = ({ onCreate, onCancel }) => {
  const addTileset = useEditorStore((s) => s.addTileset);
  const toast = useToast();

  const [name, setName] = useState('New Tileset');
  const [tileWidth, setTileWidth] = useState(16);
  const [tileHeight, setTileHeight] = useState(16);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
  const [isProcessing, setProcessing] = useState(false);

  React.useEffect(() => {
    return () => {
      if (!previewUrl) return;
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSelectFile = async () => {
    try {
      const path = await fileSystem.selectAsset();
      if (!path) return;
      const b = await fileSystem.readFileAsBlob(path);
      const resolved = await resolveSpriteAsset(path, b);
      const url = URL.createObjectURL(resolved.imageBlob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setFilePath(path);
      setBlob(b);
      setPreviewUrl(url);
      setImageDimensions({ w: resolved.width, h: resolved.height });
      setName((n) =>
        n === 'New Tileset'
          ? path
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.[^/.]+$/, '') || n
          : n,
      );
    } catch (e: unknown) {
      toast({
        title: 'File error',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    }
  };

  const handleCreate = async () => {
    if (!blob) {
      toast({ title: 'No image selected', status: 'warning' });
      return;
    }
    setProcessing(true);
    try {
      // Save asset into project
      const filename = filePath?.split(/[\\/]/).pop() || name.replace(/\s+/g, '-');
      const internalPath = await fileSystem.saveAsset(filename, blob);

      const dimensions =
        imageDimensions ??
        (() => {
          throw new Error('Image dimensions are unavailable. Re-select the sprite image.');
        })();

      const columns = Math.floor(dimensions.w / tileWidth) || 1;
      const rows = Math.floor(dimensions.h / tileHeight) || 1;
      const tileCount = columns * rows;

      // Build default tiles record
      const tiles: Record<number, any> = {};
      for (let i = 0; i < tileCount; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        tiles[i] = { id: `tile_${col}_${row}`, spriteIndex: i, collision: { type: 'none' } };
      }

      const newTileset = {
        version: 1,
        id: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name,
        spriteSheet: internalPath,
        tileWidth,
        tileHeight,
        columns,
        tileCount,
        tiles,
        wangSets: [],
      };

      await addTileset(newTileset);
      toast({ title: 'Tileset created', status: 'success' });
      onCreate?.();
    } catch (e: unknown) {
      toast({
        title: 'Create failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Box bg="gray.900" p={6} rounded="2xl" border="1px" borderColor="gray.800" w="lg">
      <VStack spacing={4} align="stretch">
        <VStack align="start" spacing={0}>
          <Text color="white" fontSize="lg" fontWeight="bold">
            Create Tileset
          </Text>
          <Text color="gray.500" fontSize="sm">
            Choose an image and define tile sizing.
          </Text>
        </VStack>

        <FormControl>
          <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
            Name
          </FormLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            bg="gray.950"
            borderColor="gray.700"
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
            Sprite Image
          </FormLabel>
          <HStack>
            <Input value={filePath || ''} readOnly bg="gray.950" borderColor="gray.700" />
            <Button size="sm" onClick={handleSelectFile}>
              Choose
            </Button>
          </HStack>
        </FormControl>

        {previewUrl && (
          <Box bg="blackAlpha.400" p={2} rounded="md" maxH={200} overflow="hidden">
            <Image
              src={previewUrl}
              maxH={160}
              objectFit="contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </Box>
        )}

        <HStack spacing={4}>
          <FormControl>
            <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
              Tile Width
            </FormLabel>
            <NumberInput value={tileWidth} min={1} onChange={(_, v) => setTileWidth(v)}>
              <NumberInputField bg="gray.950" borderColor="gray.700" />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
              Tile Height
            </FormLabel>
            <NumberInput value={tileHeight} min={1} onChange={(_, v) => setTileHeight(v)}>
              <NumberInputField bg="gray.950" borderColor="gray.700" />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </FormControl>
        </HStack>

        <HStack justify="flex-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button colorScheme="blue" onClick={handleCreate} isLoading={isProcessing}>
            Create
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

export default TilesetCreator;
