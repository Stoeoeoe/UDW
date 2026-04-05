import React from 'react';
import { Box, Flex, Text, VStack, HStack, IconButton, Badge, Tooltip } from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';

/**
 * Simple navigation list of location links for the left sidebar.
 * No inline editing — selection drives the right-panel inspector.
 */
export const LocationLinksPanel: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectLink = useEditorStore((s) => s.selectLink);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);

  const links = currentMap?.locationLinks ?? [];
  const linkLayer = currentMap?.layers.find((l) => l.kind === 'locationlink');
  const isLinkLayerSelected = linkLayer && selectedLayerId === linkLayer.id;

  const activateLinkLayer = () => {
    if (linkLayer) {
      selectLayer(linkLayer.id);
      setActiveTool('linkSelect');
    }
  };

  const handleSelectLink = (id: string) => {
    activateLinkLayer();
    selectLink(id);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    activateLinkLayer();
    setActiveTool('linkPlace');
    selectLink(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string, label?: string) => {
    e.stopPropagation();
    if (confirm(`Delete link "${label || id}"?`)) {
      removeLocationLink(id);
    }
  };

  return (
    <Box borderTop="1px" borderColor="editor.border">
      {/* Section header */}
      <Flex
        align="center"
        px="2"
        py="1"
        bg="editor.headerBg"
        _hover={{ bg: 'whiteAlpha.50' }}
        cursor="pointer"
        onClick={activateLinkLayer}
        userSelect="none"
        borderBottom="1px"
        borderColor={isLinkLayerSelected ? 'cyan.700' : 'editor.border'}
      >
        <Box w="6px" h="6px" borderRadius="full" bg="cyan.500" mr="2" flexShrink={0} />
        <Text
          flex={1}
          fontSize="9px"
          fontWeight="black"
          textTransform="uppercase"
          letterSpacing="widest"
          color={isLinkLayerSelected ? 'cyan.400' : 'gray.500'}
        >
          Links
        </Text>
        {links.length > 0 && (
          <Text fontSize="9px" color="gray.600" mr={1}>
            {links.length}
          </Text>
        )}
        <Tooltip label="Place new link (N)" placement="right" hasArrow>
          <IconButton
            aria-label="Add location link"
            icon={<AddIcon fontSize="8px" />}
            size="xs"
            variant="ghost"
            color="gray.600"
            _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
            onClick={handleAdd}
          />
        </Tooltip>
      </Flex>

      {/* Link list */}
      {links.length === 0 ? (
        <Box px={4} py={2}>
          <Text fontSize="10px" color="gray.700" fontStyle="italic">
            No links — click + to place one
          </Text>
        </Box>
      ) : (
        <VStack spacing={0} align="stretch">
          {links.map((link) => {
            const isSelected = selectedLinkId === link.id;
            const targetMap = maps.find((m) => m.id === link.targetMapId);
            const isSameMap = !link.targetMapId || link.targetMapId === currentMap?.id;
            const isBroken = !isSameMap && !targetMap;
            const dirIcon = link.direction === 'bidirectional' ? '↔' : '→';
            const targetLabel = isSameMap ? 'same map' : isBroken ? '⚠ missing' : targetMap!.name;

            return (
              <HStack
                key={link.id}
                px={2}
                py={1.5}
                spacing={0}
                cursor="pointer"
                bg={isSelected ? 'whiteAlpha.150' : 'transparent'}
                borderLeft="2px"
                borderColor={isSelected ? 'cyan.400' : 'transparent'}
                _hover={{ bg: isSelected ? 'whiteAlpha.150' : 'whiteAlpha.50' }}
                onClick={() => handleSelectLink(link.id)}
                role="group"
                transition="all 0.1s"
              >
                {/* Direction color dot */}
                <Text
                  fontSize="10px"
                  fontFamily="mono"
                  color={isBroken ? 'red.400' : isSameMap ? 'purple.300' : 'cyan.300'}
                  mr={1.5}
                  flexShrink={0}
                >
                  {dirIcon}
                </Text>

                <VStack align="start" spacing={0} flex={1} minW={0}>
                  <Text
                    fontSize="xs"
                    color={isSelected ? 'white' : 'gray.300'}
                    fontWeight={isSelected ? 'semibold' : 'normal'}
                    noOfLines={1}
                  >
                    {link.label || (
                      <Text as="span" color="gray.600" fontStyle="italic">
                        Unnamed
                      </Text>
                    )}
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="10px" color="gray.600" fontFamily="mono">
                      ({link.sourcePosition[0]},{link.sourcePosition[1]})
                    </Text>
                    <Text fontSize="10px" color="gray.600">
                      {dirIcon}
                    </Text>
                    <Badge
                      fontSize="9px"
                      colorScheme={isBroken ? 'red' : isSameMap ? 'purple' : 'cyan'}
                      variant="subtle"
                      px={1}
                    >
                      {targetLabel}
                    </Badge>
                  </HStack>
                </VStack>

                <IconButton
                  aria-label="Delete link"
                  icon={<DeleteIcon fontSize="9px" />}
                  size="xs"
                  variant="ghost"
                  color="gray.600"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  _hover={{ color: 'red.300', bg: 'red.900' }}
                  onClick={(e) => handleDelete(e, link.id, link.label)}
                />
              </HStack>
            );
          })}
        </VStack>
      )}
    </Box>
  );
};

export default LocationLinksPanel;
