import React from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  IconButton,
  Tooltip,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  useToast,
  Flex,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { TilesetImporter } from '../tileset/TilesetImporter';
import TilesetCreator from '../dialogs/TilesetCreator';
import { WangEditor } from '../tileset/WangEditor';

export const TilesetPanel: React.FC = () => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const activeId = useEditorStore((state) => state.activeTilesetId);
  const setActive = useEditorStore((state) => state.setActiveTileset);
  const deleteTileset = useEditorStore((state) => state.deleteTileset);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [creatorOpen, setCreatorOpen] = React.useState(false);
  const toast = useToast();

  const activeTileset = activeId ? useEditorStore.getState().tilesets.get(activeId) : null;

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (
      confirm(
        `Are you sure you want to delete tileset "${name}"? This will not delete the image file, but the metadata will be lost.`,
      )
    ) {
      try {
        await deleteTileset(id);
        toast({
          title: 'Tileset deleted',
          status: 'info',
          duration: 2000,
        });
      } catch (err: unknown) {
        toast({
          title: 'Error deleting tileset',
          description: err instanceof Error ? err.message : 'Unknown error',
          status: 'error',
        });
      }
    }
  };

  return (
    <Flex direction="column" h="full" bg="gray.950" borderLeft="1px" borderColor="gray.800">
      {/* Top Section: Tileset List */}
      <VStack flex="0 0 45%" spacing={0} align="stretch" borderBottom="1px" borderColor="gray.800">
        <Box bg="gray.900" borderBottom="1px" borderColor="gray.800">
          <HStack px={4} py={3} justify="space-between">
            <Text
              fontSize="xs"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.400"
            >
              Tilesets
            </Text>
            <HStack spacing={1}>
              <Tooltip label="Import Tileset" placement="right" hasArrow>
                <IconButton
                  aria-label="Import Tileset"
                  icon={<AddIcon />}
                  size="xs"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={onOpen}
                />
              </Tooltip>
              <Tooltip label="Create New Tileset" placement="right" hasArrow>
                <IconButton
                  aria-label="Create New Tileset"
                  icon={<AddIcon />}
                  size="xs"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={() => setCreatorOpen(true)}
                />
              </Tooltip>
            </HStack>
          </HStack>
        </Box>

        <Box flex={1} overflowY="auto" p={2}>
          <VStack spacing={1} align="stretch">
            {tilesets.length === 0 ? (
              <Box py={8} textAlign="center" px={4}>
                <Text fontSize="xs" color="gray.600">
                  No tilesets in project
                </Text>
              </Box>
            ) : (
              tilesets.map((ts) => (
                <Box
                  key={ts.id}
                  px={3}
                  py={2}
                  rounded="md"
                  cursor="pointer"
                  bg={activeId === ts.id ? 'blue.900' : 'transparent'}
                  border="1px"
                  borderColor={activeId === ts.id ? 'blue.500' : 'transparent'}
                  _hover={{ bg: activeId === ts.id ? 'blue.900' : 'gray.800' }}
                  onClick={() => setActive(ts.id)}
                  transition="all 0.2s"
                >
                  <HStack justify="space-between" align="center">
                    <VStack align="start" spacing={0}>
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        noOfLines={1}
                        color={activeId === ts.id ? 'white' : 'gray.300'}
                      >
                        {ts.name}
                      </Text>
                      <Text fontSize="9px" color="gray.500" fontWeight="mono">
                        {ts.tileWidth}x{ts.tileHeight} • {ts.tileCount} tiles
                      </Text>
                    </VStack>

                    <IconButton
                      aria-label="Delete Tileset"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      opacity={0.3}
                      _hover={{ opacity: 1 }}
                      onClick={(e) => handleDelete(e, ts.id, ts.name)}
                    />
                  </HStack>
                </Box>
              ))
            )}
          </VStack>
        </Box>
      </VStack>

      {/* Bottom Section: Terrain Config (Dynamic) */}
      <VStack flex={1} spacing={0} align="stretch" overflow="hidden" bg="gray.950">
        <Box bg="gray.900" borderBottom="1px" borderColor="gray.800" px={4} py={2}>
          <Text
            fontSize="xs"
            fontWeight="black"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.400"
          >
            Terrain
          </Text>
        </Box>

        {activeTileset ? (
          <Box flex={1} overflowY="auto">
            <WangEditor tileset={activeTileset} />
          </Box>
        ) : (
          <Flex flex={1} align="center" justify="center" p={8} textAlign="center" opacity={0.3}>
            <Text fontSize="xs" color="gray.500">
              Select a tileset to configure terrain rules
            </Text>
          </Flex>
        )}
      </VStack>

      {/* Importer Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="transparent" border="none" boxShadow="none">
          <TilesetImporter onImport={onClose} onCancel={onClose} />
        </ModalContent>
      </Modal>

      {/* Creator Modal */}
      <Modal isOpen={creatorOpen} onClose={() => setCreatorOpen(false)} size="lg" isCentered>
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent bg="transparent" border="none" boxShadow="none">
          <TilesetCreator
            onCreate={() => setCreatorOpen(false)}
            onCancel={() => setCreatorOpen(false)}
          />
        </ModalContent>
      </Modal>
    </Flex>
  );
};
