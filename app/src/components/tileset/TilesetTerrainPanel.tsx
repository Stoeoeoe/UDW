import React from 'react';
import { VStack, HStack, Text, Box, Divider, Button, useDisclosure } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';
import { AutotileGeneratorDialog } from './AutotileGeneratorDialog';
import { SectionLabel } from '../common/Typography.tsx';

interface TilesetTerrainPanelProps {
  tileset: Tileset;
}

export const TilesetTerrainPanel: React.FC<TilesetTerrainPanelProps> = ({ tileset }) => {
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const selectedTerrainId = useEditorStore((state) => state.selectedTerrainId);
  const setSelectedTerrain = useEditorStore((state) => state.setSelectedTerrain);
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <VStack align="stretch" spacing={4} p={6}>
      <VStack align="start" spacing={1}>
        <SectionLabel>Terrain Palette</SectionLabel>
        <Text fontSize="sm" color="gray.400">
          Select a terrain then click tile corners to paint.
        </Text>
      </VStack>

      <Divider borderColor="editorBorderSubtle" />

      {terrainTypes.length === 0 ? (
        <Text color="gray.500">No terrain types defined in project.</Text>
      ) : (
        <VStack align="stretch" spacing={1}>
          {/* Allow clearing the current terrain selection (delete mode) */}
          <HStack
            key="__none__"
            spacing={3}
            align="center"
            px={3}
            py={2}
            rounded="md"
            cursor="pointer"
            bg={selectedTerrainId === null ? 'blue.700' : 'transparent'}
            _hover={{ bg: selectedTerrainId === null ? 'blue.600' : 'gray.800' }}
            onClick={() => setSelectedTerrain(null)}
          >
            <Box
              w={4}
              h={4}
              rounded="sm"
              bg={selectedTerrainId === null ? 'white' : 'transparent'}
              borderWidth={1}
              borderColor="gray.600"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="gray.400"
              fontSize="xs"
            >
              ×
            </Box>
            <Text
              flex={1}
              fontWeight={selectedTerrainId === null ? 'semibold' : 'normal'}
              color={selectedTerrainId === null ? 'white' : 'gray.300'}
            >
              None
            </Text>
          </HStack>

          {terrainTypes.map((t) => (
            <HStack
              key={t.id}
              spacing={3}
              align="center"
              px={3}
              py={2}
              rounded="md"
              cursor="pointer"
              bg={selectedTerrainId === t.id ? 'blue.700' : 'transparent'}
              _hover={{ bg: selectedTerrainId === t.id ? 'blue.600' : 'gray.800' }}
              onClick={() => setSelectedTerrain(t.id)}
            >
              <Box w={4} h={4} rounded="sm" bg={t.color} borderWidth={1} borderColor="gray.600" />
              <Text
                flex={1}
                fontWeight={selectedTerrainId === t.id ? 'semibold' : 'normal'}
                color={selectedTerrainId === t.id ? 'white' : 'gray.300'}
              >
                {t.displayName}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}

      <Divider borderColor="editorBorderSubtle" />

      <VStack align="stretch" spacing={2}>
        <SectionLabel>Auto Tile Utility</SectionLabel>
        <Text fontSize="sm" color="gray.400">
          Generate transition tiles from two terrain sample groups in this tileset.
        </Text>
        <Button size="sm" colorScheme="blue" onClick={onOpen} isDisabled={terrainTypes.length < 2}>
          Generate Auto Tiles
        </Button>
      </VStack>

      <AutotileGeneratorDialog isOpen={isOpen} onClose={onClose} tileset={tileset} />
    </VStack>
  );
};

export default TilesetTerrainPanel;
