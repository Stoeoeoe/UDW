import React, { useState } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Input,
  FormControl,
  FormLabel,
  Heading,
  Image,
  SimpleGrid,
  useToast,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TileDefinition, Tileset } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { resolveSpriteAsset } from '../../lib/asepriteUtils';

interface TilesetImporterProps {
  onImport: () => void;
  onCancel: () => void;
}

export const TilesetImporter: React.FC<TilesetImporterProps> = ({ onImport, onCancel }) => {
  const addTileset = useEditorStore((state) => state.addTileset);
  const toast = useToast();

  const [fileData, setFileData] = useState<{
    name: string;
    path: string;
    url: string;
    blob: Blob;
  } | null>(null);
  const [tilesetName, setTilesetName] = useState('');
  const [tileSize, setTileSize] = useState(16);
  const [imageDimensions, setImageDimensions] = useState({ w: 0, h: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectFile = async () => {
    try {
      const rawPath = await fileSystem.selectAsset();
      if (!rawPath) return;

      setIsProcessing(true);
      const blob = await fileSystem.readFileAsBlob(rawPath);

      // Extract filename from path
      const name = rawPath.split(/[\\/]/).pop() || 'tileset';
      const resolved = await resolveSpriteAsset(rawPath, blob);
      const url = URL.createObjectURL(resolved.imageBlob);

      setImageDimensions({ w: resolved.width, h: resolved.height });
      setFileData({
        name,
        path: rawPath,
        url,
        blob,
      });
      setTilesetName(name.replace(/\.[^/.]+$/, ''));
    } catch (e: unknown) {
      toast({
        title: 'File error',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Revoke object URL when file changes or component unmounts
  React.useEffect(() => {
    return () => {
      if (fileData && fileData.url) {
        try {
          URL.revokeObjectURL(fileData.url);
        } catch (e) {
          // ignore
        }
      }
    };
  }, [fileData]);

  const handleImport = async () => {
    if (!fileData) return;

    setIsProcessing(true);
    try {
      // 1. Copy image to project/assets
      const internalPath = await fileSystem.saveAsset(fileData.name, fileData.blob);

      // 2. Define tileset
      const columns = Math.floor(imageDimensions.w / tileSize);
      const rows = Math.floor(imageDimensions.h / tileSize);
      const tileCount = columns * rows;

      // Generate default tile definitions for every tile
      const tiles: Record<number, TileDefinition> = {};
      for (let i = 0; i < tileCount; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        tiles[i] = {
          id: `tile_${col}_${row}`,
          spriteIndex: i,
          collision: { type: 'none' },
        };
      }

      const newTileset: Tileset = {
        version: 1,
        id: tilesetName.toLowerCase().replace(/\s+/g, '-'),
        name: tilesetName,
        spriteSheet: internalPath,
        tileWidth: tileSize,
        tileHeight: tileSize,
        columns: columns,
        tileCount: tileCount,
        tiles: tiles,
        wangSets: [],
      };

      // 3. Save to store (this also saves the JSON)
      await addTileset(newTileset);

      toast({
        title: 'Tileset Imported',
        description: `Created ${tileCount} tiles using ${tileSize}px grid.`,
        status: 'success',
        duration: 3000,
      });
      onImport();
    } catch (e: unknown) {
      toast({
        title: 'Import Failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box bg="gray.900" p={8} rounded="2xl" border="2px" borderColor="gray.800" shadow="2xl">
      <VStack spacing={6} align="stretch">
        <VStack align="start" spacing={1}>
          <Heading size="md" color="white">
            Import New Tileset
          </Heading>
          <Text color="gray.500" fontSize="sm">
            Select an image from your computer to add to the project
          </Text>
        </VStack>

        {!fileData ? (
          <Box
            h="48"
            border="2px dashed"
            borderColor="gray.700"
            rounded="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
            _hover={{ borderColor: 'blue.500', bg: 'whiteAlpha.50' }}
            cursor="pointer"
            onClick={handleSelectFile}
            transition="all 0.2s"
          >
            <VStack spacing={3}>
              <Box
                w="12"
                h="12"
                bg="blue.900"
                rounded="lg"
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="blue.200"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </Box>
              <VStack spacing={0}>
                <Text color="gray.300" fontWeight="bold">
                  Select Tileset Image
                </Text>
                <Text color="gray.600" fontSize="xs">
                  PNG/JPG/Aseprite supported
                </Text>
              </VStack>
            </VStack>
          </Box>
        ) : (
          <SimpleGrid columns={2} spacing={8}>
            <Box
              bg="blackAlpha.400"
              rounded="xl"
              p={4}
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="1px"
              borderColor="gray.800"
            >
              <Image
                src={fileData.url}
                maxH="200px"
                objectFit="contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </Box>

            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel
                  color="gray.500"
                  fontSize="xs"
                  fontWeight="bold"
                  textTransform="uppercase"
                >
                  Tileset Name
                </FormLabel>
                <Input
                  bg="gray.950"
                  borderColor="gray.700"
                  value={tilesetName}
                  onChange={(e) => setTilesetName(e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  color="gray.500"
                  fontSize="xs"
                  fontWeight="bold"
                  textTransform="uppercase"
                >
                  Tile Size (px)
                </FormLabel>
                <Input
                  type="number"
                  bg="gray.950"
                  borderColor="gray.700"
                  value={tileSize}
                  onChange={(e) => setTileSize(Number(e.target.value))}
                />
              </FormControl>

              <Box bg="whiteAlpha.50" p={3} rounded="lg">
                <HStack justify="space-between" fontSize="xs">
                  <Text color="gray.400">Dimensions</Text>
                  <Text color="white" fontWeight="mono">
                    {imageDimensions.w} x {imageDimensions.h}px
                  </Text>
                </HStack>
                <HStack justify="space-between" fontSize="xs" mt={1}>
                  <Text color="gray.400">Grid Resolution</Text>
                  <Text color="blue.300" fontWeight="bold">
                    {Math.floor(imageDimensions.w / tileSize)} x{' '}
                    {Math.floor(imageDimensions.h / tileSize)} tiles
                  </Text>
                </HStack>
              </Box>
            </VStack>
          </SimpleGrid>
        )}

        <HStack justify="flex-end" spacing={4} pt={2}>
          <Button variant="ghost" onClick={fileData ? () => setFileData(null) : onCancel} size="sm">
            {fileData ? 'Change File' : 'Cancel'}
          </Button>
          <Button
            colorScheme="blue"
            isDisabled={!fileData || isProcessing}
            isLoading={isProcessing}
            onClick={handleImport}
            size="sm"
            px={10}
            fontWeight="black"
            boxShadow="0 4px 14px rgba(49, 130, 206, 0.4)"
          >
            IMPORT
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};
