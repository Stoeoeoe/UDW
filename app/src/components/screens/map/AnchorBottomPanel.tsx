import React from 'react';
import { Box, Flex, HStack, IconButton, Text, Tooltip, VStack } from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import PanelHeader from '../../common/PanelHeader';
import { useEditorStore } from '../../../store/useEditorStore';

export const AnchorBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? 16);
  const selectedAnchorId = useEditorStore((state) => state.selectedAnchorId);
  const addAnchor = useEditorStore((state) => state.addAnchor);
  const removeAnchor = useEditorStore((state) => state.removeAnchor);
  const selectAnchor = useEditorStore((state) => state.selectAnchor);
  const selectLayer = useEditorStore((state) => state.selectLayer);

  const anchors = currentMap?.spatialPrimitives?.anchors ?? [];

  const handleAdd = () => {
    const cx = Math.floor((currentMap?.width ?? 2) / 2) * projectTileSize;
    const cy = Math.floor((currentMap?.height ?? 2) / 2) * projectTileSize;
    const anchorLayer = currentMap?.layers.find((layer) => layer.kind === 'anchor');
    if (anchorLayer) {
      selectLayer(anchorLayer.id);
    }
    addAnchor({
      id: `anchor-${Date.now()}`,
      name: 'Anchor',
      position: [cx, cy],
      facing: [0, 1],
      tags: [],
    });
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editor.panelBg">
      <PanelHeader
        title="Anchors"
        actions={
          <Tooltip label="Add new anchor" placement="top" hasArrow>
            <IconButton
              aria-label="Add Anchor"
              icon={<AddIcon fontSize="10px" />}
              size="md"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={handleAdd}
            />
          </Tooltip>
        }
      />
      {anchors.length === 0 ? (
        <Flex flex={1} align="center" justify="center" direction="column" gap={2} color="gray.600">
          <Text fontSize="lg">📍</Text>
          <Text fontSize="xs">No anchors yet</Text>
        </Flex>
      ) : (
        <Box flex={1} overflowX="auto" overflowY="hidden">
          <HStack spacing={2} px={3} py={2} align="stretch" h="full">
            {anchors.map((anchor) => {
              const isSelected = anchor.id === selectedAnchorId;
              return (
                <Flex
                  key={anchor.id}
                  direction="column"
                  justify="space-between"
                  minW="140px"
                  maxW="180px"
                  px={3}
                  py={2}
                  borderRadius="md"
                  border="1px"
                  borderColor={isSelected ? 'orange.500' : 'whiteAlpha.100'}
                  bg={isSelected ? 'orange.900' : 'whiteAlpha.50'}
                  cursor="pointer"
                  flexShrink={0}
                  _hover={{
                    borderColor: isSelected ? 'orange.400' : 'whiteAlpha.200',
                    bg: isSelected ? 'orange.900' : 'whiteAlpha.100',
                  }}
                  onClick={() => {
                    const anchorLayer = currentMap?.layers.find((layer) => layer.kind === 'anchor');
                    if (anchorLayer) {
                      selectLayer(anchorLayer.id);
                    }
                    selectAnchor(isSelected ? null : anchor.id);
                  }}
                  role="group"
                  transition="all 0.1s"
                >
                  <VStack align="start" spacing={1}>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color={isSelected ? 'orange.100' : 'gray.200'}
                      noOfLines={1}
                      maxW="120px"
                    >
                      {anchor.name || anchor.id}
                    </Text>
                    <Text fontSize="10px" color="gray.500" fontFamily="mono">
                      ({anchor.position[0]}, {anchor.position[1]})
                    </Text>
                  </VStack>
                  <Flex justify="flex-end" mt={1}>
                    <IconButton
                      aria-label="Delete anchor"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      opacity={0}
                      _groupHover={{ opacity: 1 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isSelected) selectAnchor(null);
                        removeAnchor(anchor.id);
                      }}
                    />
                  </Flex>
                </Flex>
              );
            })}
          </HStack>
        </Box>
      )}
    </Flex>
  );
};

export default AnchorBottomPanel;
