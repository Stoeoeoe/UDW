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
import { AddIcon, DeleteIcon, EditIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { GuidedMapCreationDialog } from '../../dialogs/GuidedMapCreationDialog';
import { EditorModal } from '../../common/EditorModal';
import { EntityFormDialog } from '../common/EntityFormDialog';
import { VariationManager } from './VariationManager';
import { LayersPanel } from './LayersPanel';
import { MetadataDialog } from './MetadataDialog';

interface MapBrowserProps {
  showEditingPanels?: boolean;
}

/**
 * MapBrowser - A sidebar panel for browsing all maps in the project,
 * switching between them, creating new ones, and managing variations
 * for the active map. Also integrates the layers panel below.
 */
export const MapBrowser: React.FC<MapBrowserProps> = ({ showEditingPanels = true }) => {
  const maps = useEditorStore((state) => state.maps);
  const currentMap = useEditorStore((state) => state.currentMap);
  const loadMap = useEditorStore((state) => state.loadMap);
  const deleteMap = useEditorStore((state) => state.deleteMap);
  const {
    isOpen: isMapCreatorOpen,
    onOpen: onMapCreatorOpen,
    onClose: onMapCreatorClose,
  } = useDisclosure();
  const {
    isOpen: isMetadataOpen,
    onOpen: onMetadataOpen,
    onClose: onMetadataClose,
  } = useDisclosure();
  const toast = useToast();

  const [metadataInitialTab, setMetadataInitialTab] = React.useState<'base' | 'variation'>('base');

  // Open metadata dialog in response to external requests (e.g., edit buttons)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent | undefined;
      const focus = ce?.detail?.focus === 'variation' ? 'variation' : 'base';
      setMetadataInitialTab(focus);
      onMetadataOpen();
    };
    window.addEventListener('openMetadataDialog', handler as EventListener);
    return () => window.removeEventListener('openMetadataDialog', handler as EventListener);
  }, [onMetadataOpen]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [mapsCollapsed, setMapsCollapsed] = useState(false);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  const pendingDeleteMap = maps.find((m) => m.id === pendingDeleteId) ?? null;

  // Count location links in OTHER maps that target the map being deleted
  const affectedLinkCount = pendingDeleteId
    ? maps
        .filter((m) => m.id !== pendingDeleteId)
        .reduce(
          (sum, m) =>
            sum + (m.locationLinks ?? []).filter((l) => l.targetMapId === pendingDeleteId).length,
          0,
        )
    : 0;

  const requestDeleteMap = (mapId: string) => {
    setPendingDeleteId(mapId);
    onDeleteOpen();
  };

  const confirmDeleteMap = async () => {
    if (!pendingDeleteId || !pendingDeleteMap) return;
    onDeleteClose();
    try {
      await deleteMap(pendingDeleteId);
      toast({
        title: `Map "${pendingDeleteMap.name}" deleted`,
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
    setPendingDeleteId(null);
  };

  const cancelDeleteMap = () => {
    onDeleteClose();
    setPendingDeleteId(null);
  };

  return (
    <Flex direction="column" h="full" bg="editorPanelBg" color="gray.200" overflow="hidden">
      {/* Maps List Section */}
      <Box flex="0 0 auto">
        <Flex
          p="3"
          borderBottom="1px"
          borderColor="editorShellBorder"
          align="center"
          justify="space-between"
          bg="editorSectionBg"
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
          <HStack spacing={1}>
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
                  onMapCreatorOpen();
                }}
              />
            </Tooltip>
          </HStack>
        </Flex>

        {!mapsCollapsed && (
          <Box maxH="200px" overflowY="auto" p={1} bg="editorPanelBg">
            <VStack spacing={0} align="stretch">
              {maps.length === 0 && (
                <Text fontSize="xs" color="gray.600" textAlign="center" py={4} fontStyle="italic">
                  No maps yet
                </Text>
              )}
              {maps.map((map) => {
                const isActive = currentMap?.id === map.id;
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

                    <Tooltip label="Edit Map" placement="right" hasArrow>
                      <IconButton
                        aria-label="Edit Map"
                        icon={<EditIcon fontSize="10px" />}
                        size="xs"
                        variant="ghost"
                        color="gray.400"
                        opacity={0}
                        _groupHover={{
                          opacity: 1,
                          color: 'white',
                          bg: 'whiteAlpha.50',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentMap?.id !== map.id) loadMap(map.id);
                          setMetadataInitialTab('base');
                          onMetadataOpen();
                        }}
                        title="Edit map metadata"
                      />
                    </Tooltip>

                    <IconButton
                      aria-label="Delete Map"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      color="gray.600"
                      opacity={0}
                      _groupHover={{ opacity: 1 }}
                      _hover={{ color: 'red.300', bg: 'red.900' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteMap(map.id);
                      }}
                      title="Delete map"
                    />
                  </HStack>
                );
              })}
            </VStack>
          </Box>
        )}
      </Box>

      {showEditingPanels && (
        <>
          {/* Divider */}
          <Box borderBottom="1px" borderColor="editorShellBorder" />

          {/* Variation Manager for active map */}
          <Box flex="0 0 auto" maxH="280px" overflow="hidden">
            <VariationManager />
          </Box>

          {/* Divider */}
          <Box borderBottom="1px" borderColor="editorShellBorder" />

          {/* Layers Panel */}
          <Box flex={1} overflow="hidden" minH="100px">
            <LayersPanel />
          </Box>
        </>
      )}

      {/* Map Creator Modal */}
      <GuidedMapCreationDialog isOpen={isMapCreatorOpen} onClose={onMapCreatorClose} />

      <MetadataDialog
        isOpen={isMetadataOpen}
        onClose={onMetadataClose}
        initialTab={metadataInitialTab}
      />

      {/* Delete Map Confirmation Dialog */}
      <EditorModal isOpen={isDeleteOpen} onClose={cancelDeleteMap} size="sm">
        <EntityFormDialog
          title="Delete Map"
          description={
            pendingDeleteMap
              ? affectedLinkCount > 0
                ? `Delete "${pendingDeleteMap.name}"? This will also remove ${affectedLinkCount} location link${affectedLinkCount !== 1 ? 's' : ''} in other maps that point to it.`
                : `Are you sure you want to delete "${pendingDeleteMap.name}"? This cannot be undone.`
              : undefined
          }
          onCancel={cancelDeleteMap}
          onSubmit={confirmDeleteMap}
          submitLabel="Delete"
        >
          <></>
        </EntityFormDialog>
      </EditorModal>
    </Flex>
  );
};
