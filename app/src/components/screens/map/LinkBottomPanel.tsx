import React from 'react';
import { Box, Flex, HStack, VStack, Text, Badge, IconButton, Tooltip } from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { getDefaultLinkTargetPosition, resolveLinkTarget } from '../../../lib/locationLinkUtils';
import { useEditorStore } from '../../../store/useEditorStore';
import PanelHeader from '../../common/PanelHeader';

/**
 * LinkBottomPanel — shown in the bottom panel when the locationlink layer is active.
 * Lists all location links on the current map; clicking one selects it.
 */
export const LinkBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const maps = useEditorStore((s) => s.maps);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectLink = useEditorStore((s) => s.selectLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const addLocationLink = useEditorStore((s) => s.addLocationLink);

  const links = currentMap?.locationLinks ?? [];

  const handleAdd = () => {
    // Place a link at center of current map (user can reposition after)
    const cx = Math.floor((currentMap?.width ?? 2) / 2);
    const cy = Math.floor((currentMap?.height ?? 2) / 2);
    const sourcePosition: [number, number] = [cx * projectTileSize, cy * projectTileSize];
    const triggerSize: [number, number] = [projectTileSize, projectTileSize];
    addLocationLink({
      id: `link-${Date.now()}`,
      sourcePosition,
      triggerSize,
      targetMapId: '',
      targetPosition: getDefaultLinkTargetPosition(sourcePosition, triggerSize, projectTileSize),
      direction: 'one-way',
    });
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editor.panelBg">
      <PanelHeader
        title="Location Links"
        actions={
          <Tooltip label="Add new link" placement="top" hasArrow>
            <IconButton
              aria-label="Add Location Link"
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

      {links.length === 0 ? (
        <Flex flex={1} align="center" justify="center" direction="column" gap={2} color="gray.600">
          <Text fontSize="lg">🔗</Text>
          <Text fontSize="xs">No links yet — click + to add one</Text>
        </Flex>
      ) : (
        <Box flex={1} overflowX="auto" overflowY="hidden">
          <HStack spacing={2} px={3} py={2} align="stretch" h="full">
            {links.map((link) => {
              const isSelected = link.id === selectedLinkId;
              const targetMap = maps.find((m) => m.id === link.targetMapId);
              const isSameMap = !link.targetMapId || link.targetMapId === currentMap?.id;
              const isBroken = !isSameMap && !targetMap;
              const resolvedTarget = resolveLinkTarget(link, currentMap, maps);
              const targetLabel = isBroken
                ? '⚠ broken'
                : isSameMap
                  ? resolvedTarget.anchor
                    ? `@ ${resolvedTarget.anchor.name}`
                    : 'same map'
                  : resolvedTarget.anchor
                    ? `${targetMap?.name} @ ${resolvedTarget.anchor.name}`
                    : `→ ${targetMap?.name}`;

              return (
                <Flex
                  key={link.id}
                  direction="column"
                  justify="space-between"
                  minW="140px"
                  maxW="180px"
                  px={3}
                  py={2}
                  borderRadius="md"
                  border="1px"
                  borderColor={isSelected ? 'cyan.500' : 'whiteAlpha.100'}
                  bg={isSelected ? 'cyan.900' : 'whiteAlpha.50'}
                  cursor="pointer"
                  flexShrink={0}
                  _hover={{
                    borderColor: isSelected ? 'cyan.400' : 'whiteAlpha.200',
                    bg: isSelected ? 'cyan.900' : 'whiteAlpha.100',
                  }}
                  onClick={() => selectLink(isSelected ? null : link.id)}
                  role="group"
                  transition="all 0.1s"
                >
                  <VStack align="start" spacing={1}>
                    <HStack w="full" justify="space-between">
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        color={isSelected ? 'cyan.100' : 'gray.200'}
                        noOfLines={1}
                        maxW="100px"
                      >
                        {link.label || link.id}
                      </Text>
                      <Text fontSize="10px" color="gray.500">
                        {link.direction === 'bidirectional' ? '↔' : '→'}
                      </Text>
                    </HStack>

                    <Text fontSize="10px" color="gray.500" fontFamily="mono">
                      ({link.sourcePosition[0]}, {link.sourcePosition[1]})
                      {link.triggerSize[0] > projectTileSize ||
                      link.triggerSize[1] > projectTileSize
                        ? ` ${link.triggerSize[0]}×${link.triggerSize[1]} px`
                        : ''}
                    </Text>

                    {isBroken ? (
                      <Badge colorScheme="red" fontSize="9px">
                        {targetLabel}
                      </Badge>
                    ) : isSameMap ? (
                      <Badge colorScheme="red" fontSize="9px">
                        {targetLabel}
                      </Badge>
                    ) : (
                      <Badge colorScheme="cyan" fontSize="9px" noOfLines={1} maxW="120px">
                        {targetLabel}
                      </Badge>
                    )}
                  </VStack>

                  <Flex justify="flex-end" mt={1}>
                    <IconButton
                      aria-label="Delete link"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      opacity={0}
                      _groupHover={{ opacity: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSelected) selectLink(null);
                        removeLocationLink(link.id);
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

export default LinkBottomPanel;
