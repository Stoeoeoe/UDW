import React from 'react';
import { Box, Flex, HStack, IconButton, Text, Tooltip, VStack, Badge } from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import PanelHeader from '../../common/PanelHeader';
import { useEditorStore } from '../../../store/useEditorStore';
import { MapTrigger } from '../../../types/schema';

const TRIGGER_TYPE_LABELS: Record<MapTrigger['type'], string> = {
  locationLinkTrigger: 'Link',
};

const TRIGGER_TYPE_COLORS: Record<MapTrigger['type'], string> = {
  locationLinkTrigger: 'purple',
};

export const TriggerBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const selectedTriggerId = useEditorStore((s) => s.selectedTriggerId);
  const addTrigger = useEditorStore((s) => s.addTrigger);
  const removeTrigger = useEditorStore((s) => s.removeTrigger);
  const selectTrigger = useEditorStore((s) => s.selectTrigger);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  const triggers = currentMap?.spatialPrimitives?.triggers ?? [];

  const handleAdd = () => {
    const cx = Math.floor((currentMap?.width ?? 2) / 2) * projectTileSize;
    const cy = Math.floor((currentMap?.height ?? 2) / 2) * projectTileSize;
    const triggerLayer = currentMap?.layers.find((l) => l.kind === 'navigation');
    if (triggerLayer) selectLayer(triggerLayer.id);
    addTrigger({
      id: `trigger-${Date.now()}`,
      type: 'locationLinkTrigger',
      shape: 'rectangle',
      position: [cx, cy],
      size: [projectTileSize * 2, projectTileSize * 2],
      tags: [],
    });
    setActiveTool('triggerSelect');
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editor.panelBg">
      <PanelHeader
        title="Triggers"
        actions={
          <Tooltip label="Add new trigger" placement="top" hasArrow>
            <IconButton
              aria-label="Add Trigger"
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
      {triggers.length === 0 ? (
        <Flex flex={1} align="center" justify="center" direction="column" gap={2} color="gray.600">
          <Text fontSize="lg">⬡</Text>
          <Text fontSize="xs">No triggers yet — click + to add one</Text>
        </Flex>
      ) : (
        <Box flex={1} overflowX="auto" overflowY="hidden">
          <HStack spacing={2} px={3} py={2} align="stretch" h="full">
            {triggers.map((trigger) => {
              const isSelected = trigger.id === selectedTriggerId;
              const typeColor = TRIGGER_TYPE_COLORS[trigger.type] ?? 'gray';
              const typeLabel = TRIGGER_TYPE_LABELS[trigger.type] ?? trigger.type;
              const sizeLabel =
                trigger.shape === 'rectangle' && trigger.size
                  ? `${trigger.size[0]}×${trigger.size[1]} px`
                  : trigger.shape === 'polygon' && trigger.points
                    ? `${trigger.points.length} pts`
                    : '';

              return (
                <Flex
                  key={trigger.id}
                  direction="column"
                  justify="space-between"
                  minW="140px"
                  maxW="180px"
                  px={3}
                  py={2}
                  borderRadius="md"
                  border="1px"
                  borderColor={isSelected ? 'purple.500' : 'whiteAlpha.100'}
                  bg={isSelected ? 'purple.900' : 'whiteAlpha.50'}
                  cursor="pointer"
                  flexShrink={0}
                  _hover={{
                    borderColor: isSelected ? 'purple.400' : 'whiteAlpha.200',
                    bg: isSelected ? 'purple.900' : 'whiteAlpha.100',
                  }}
                  onClick={() => {
                    const triggerLayer = currentMap?.layers.find((l) => l.kind === 'navigation');
                    if (triggerLayer) selectLayer(triggerLayer.id);
                    selectTrigger(isSelected ? null : trigger.id);
                  }}
                  role="group"
                  transition="all 0.1s"
                >
                  <VStack align="start" spacing={1}>
                    <HStack w="full" justify="space-between">
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        color={isSelected ? 'purple.100' : 'gray.200'}
                        noOfLines={1}
                        maxW="100px"
                      >
                        {trigger.label || trigger.id}
                      </Text>
                      <Badge colorScheme={typeColor} fontSize="9px" flexShrink={0}>
                        {typeLabel}
                      </Badge>
                    </HStack>
                    <Text fontSize="10px" color="gray.500" fontFamily="mono">
                      ({trigger.position[0]}, {trigger.position[1]})
                    </Text>
                    {sizeLabel && (
                      <Text fontSize="10px" color="gray.600">
                        {trigger.shape} · {sizeLabel}
                      </Text>
                    )}
                  </VStack>
                  <Flex justify="flex-end" mt={1}>
                    <IconButton
                      aria-label="Delete trigger"
                      icon={<DeleteIcon fontSize="10px" />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      opacity={0}
                      _groupHover={{ opacity: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrigger(trigger.id);
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

export default TriggerBottomPanel;
