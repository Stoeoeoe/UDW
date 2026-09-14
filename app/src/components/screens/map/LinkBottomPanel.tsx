import React from 'react';
import { Box, Flex, HStack, VStack, Text, Badge, IconButton, Tooltip } from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { resolveLinkTarget } from '../../../lib/locationLinkUtils';
import { useEditorStore } from '../../../store/useEditorStore';
import PanelHeader from '../../common/PanelHeader';

export const LinkBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectLink = useEditorStore((s) => s.selectLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  const links = currentMap?.locationLinks ?? [];
  const hasTriggers = (currentMap?.spatialPrimitives?.triggers?.length ?? 0) > 0;

  const handleAdd = () => {
    const navLayer = currentMap?.layers.find((layer) => layer.kind === 'navigation');
    if (navLayer) selectLayer(navLayer.id);
    setActiveTool('linkPlace');
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      <PanelHeader
        title="Location Links"
        actions={
          <Tooltip
            label={
              hasTriggers
                ? 'New Link — click a highlighted trigger'
                : 'Create a trigger first, then a link'
            }
            placement="top"
            hasArrow
          >
            <IconButton
              aria-label="Add Link"
              icon={<AddIcon fontSize="10px" />}
              size="md"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              isDisabled={!hasTriggers}
              onClick={handleAdd}
            />
          </Tooltip>
        }
      />

      {links.length === 0 ? (
        <Flex flex={1} align="center" justify="center" direction="column" gap={2} color="gray.600">
          <Text fontSize="xs">No links yet — use the Link tool (click a trigger) to add one</Text>
        </Flex>
      ) : (
        <Box flex={1} overflowX="auto" overflowY="hidden">
          <HStack spacing={2} px={3} py={2} align="stretch" h="full">
            {links.map((link) => {
              const isSelected = link.id === selectedLinkId;
              const { targetMap, anchor } = resolveLinkTarget(link, maps);
              const trigger = currentMap?.spatialPrimitives?.triggers?.find(
                (t) => t.id === link.triggerId,
              );
              const isBroken = !targetMap || !anchor || !trigger;
              const targetLabel = !targetMap
                ? '⚠ no map'
                : !anchor
                  ? `${targetMap.name} @ ⚠ no anchor`
                  : `${targetMap.name} @ ${anchor.name}`;

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
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color={isSelected ? 'cyan.100' : 'gray.200'}
                      noOfLines={1}
                      maxW="160px"
                    >
                      {link.label || link.id}
                    </Text>

                    <Text fontSize="10px" color="gray.500" noOfLines={1} maxW="160px">
                      via {trigger?.label || trigger?.id || '⚠ no trigger'}
                    </Text>

                    <Badge
                      colorScheme={isBroken ? 'red' : 'cyan'}
                      fontSize="9px"
                      noOfLines={1}
                      maxW="160px"
                    >
                      {targetLabel}
                    </Badge>
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
