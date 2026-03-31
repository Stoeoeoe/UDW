import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { MapCreator } from '../../dialogs/MapCreator';
import { EditorModal } from '../../common/EditorModal';
import { VariationManager } from './VariationManager';
import { LayersPanel } from './LayersPanel';

/**
 * MapBrowser - A sidebar panel for browsing all maps in the project,
 * switching between them, creating new ones, and managing variations
 * for the active map. Also integrates the layers panel below.
 */
export const MapBrowser: React.FC = () => {
  const maps = useEditorStore((state) => state.maps);
  const currentMap = useEditorStore((state) => state.currentMap);
  const loadMap = useEditorStore((state) => state.loadMap);
  const deleteMap = useEditorStore((state) => state.deleteMap);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mapsCollapsed, setMapsCollapsed] = useState(false);

  const handleDeleteMap = async (mapId: string, mapName: string) => {
    if (confirmDeleteId === mapId) {
      // Second click = confirm
      try {
        await deleteMap(mapId);
        toast({
          title: `Map "${mapName}" deleted`,
          status: 'info',
          duration: 2000,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        toast({
          title: 'Failed to delete map',
          description: message,
          status: 'error',
          duration: 3000,
        });
      }
      setConfirmDeleteId(null);
    } else {
      // First click = arm
      setConfirmDeleteId(mapId);
      // Auto-disarm after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  return (
    <Flex
      direction="column"
      h="full"
      bg="editor.panelBg"
      color="gray.200"
      overflow="hidden"
    >
      {/* Maps List Section */}
      <Box flex="0 0 auto">
        <Flex
          p="3"
          borderBottom="1px"
          borderColor="editor.border"
          align="center"
          justify="space-between"
          bg="editor.headerBg"
          cursor="pointer"
          _hover={{ bg: 'whiteAlpha.50' }}
          onClick={() => setMapsCollapsed(!mapsCollapsed)}
        >
          <HStack spacing={1}>
            <Text fontSize="10px" color="gray.600">
              {mapsCollapsed ? '▸' : '▾'}
            </Text>
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
            >
              Maps
            </Text>
            <Text fontSize="10px" color="gray.600">
              ({maps.length})
            </Text>
          </HStack>
          <Tooltip label="Create New Map" placement="right" hasArrow>
            <IconButton
              aria-label="Create New Map"
              icon={<AddIcon fontSize="10px" />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            />
          </Tooltip>
        </Flex>

        {!mapsCollapsed && (
          <Box maxH="200px" overflowY="auto" p={1}>
            <VStack spacing={0} align="stretch">
              {maps.length === 0 && (
                <Text
                  fontSize="xs"
                  color="gray.600"
                  textAlign="center"
                  py={4}
                  fontStyle="italic"
                >
                  No maps yet
                </Text>
              )}
              {maps.map((map) => {
                const isActive = currentMap?.id === map.id;
                const isConfirmingDelete = confirmDeleteId === map.id;
                const variationCount = map.variations?.length || 0;

                return (
                  <HStack
                    key={map.id}
                    spacing={0}
                    px={2}
                    py={1.5}
                    cursor="pointer"
                    bg={isActive ? 'whiteAlpha.100' : 'transparent'}
                    borderLeft="2px"
                    borderColor={isActive ? 'blue.400' : 'transparent'}
                    _hover={{
                      bg: isActive ? 'whiteAlpha.100' : 'whiteAlpha.50',
                    }}
                    transition="all 0.1s"
                    onClick={() => {
                      if (!isActive) loadMap(map.id);
                    }}
                    role="group"
                  >
                    <Text fontSize="lg" mr={2} opacity={0.5}>
                      🗺️
                    </Text>
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <Text
                        fontSize="xs"
                        fontWeight={isActive ? 'bold' : 'medium'}
                        color={isActive ? 'white' : 'gray.300'}
                        noOfLines={1}
                      >
                        {map.name}
                      </Text>
                      <Text fontSize="10px" color="gray.600" noOfLines={1}>
                        {map.width}×{map.height}
                        {variationCount > 0 &&
                          ` • ${variationCount} var${variationCount !== 1 ? 's' : ''}`}
                      </Text>
                    </VStack>

                    <IconButton
                      aria-label="Delete Map"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      color={isConfirmingDelete ? 'red.300' : 'gray.600'}
                      bg={isConfirmingDelete ? 'red.900' : 'transparent'}
                      opacity={isConfirmingDelete ? 1 : 0}
                      _groupHover={{ opacity: 1 }}
                      _hover={{
                        color: 'red.300',
                        bg: 'red.900',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMap(map.id, map.name);
                      }}
                      title={
                        isConfirmingDelete
                          ? 'Click again to confirm'
                          : 'Delete map'
                      }
                    />
                  </HStack>
                );
              })}
            </VStack>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <Box borderBottom="1px" borderColor="editor.border" />

      {/* Variation Manager for active map */}
      <Box flex="0 0 auto" maxH="280px" overflow="hidden">
        <VariationManager />
      </Box>

      {/* Divider */}
      <Box borderBottom="1px" borderColor="editor.border" />

      {/* Layers Panel */}
      <Box flex={1} overflow="hidden" minH="100px">
        <LayersPanel />
      </Box>

      {/* Map Creator Modal */}
      <EditorModal isOpen={isOpen} onClose={onClose}>
        <MapCreator onCreate={onClose} onCancel={onClose} />
      </EditorModal>
    </Flex>
  );
};
