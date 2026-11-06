import React, { useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  HStack,
  IconButton,
  Input,
  Select,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import PanelHeader from '../../common/PanelHeader';
import { FieldLabel } from '../../common/Typography.tsx';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  createWaterBody,
  getWaterTypeOptions,
  nextWaterBodyName,
  waterBodyColorCss,
} from '../../../lib/waterBodies';

/** Bodies of the selected water layer: add them, pick the one to paint, and describe what each is. */
export const WaterBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectedWaterBodyId = useEditorStore((state) => state.selectedWaterBodyId);
  const selectWaterBody = useEditorStore((state) => state.selectWaterBody);
  const addWaterBody = useEditorStore((state) => state.addWaterBody);
  const updateWaterBody = useEditorStore((state) => state.updateWaterBody);
  const removeWaterBody = useEditorStore((state) => state.removeWaterBody);
  const clearFlow = useEditorStore((state) => state.clearFlow);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);

  const layer = currentMap?.layers.find((candidate) => candidate.id === selectedLayerId);
  const bodies = useMemo(() => (layer?.kind === 'water' ? (layer.waterBodies ?? []) : []), [layer]);
  const selectedBody = bodies.find((body) => body.id === selectedWaterBodyId);
  const waterTypes = getWaterTypeOptions(tileMetadataDefinitions);

  // Switching to another water layer (or deleting the selection) must leave a body to paint with.
  useEffect(() => {
    if (!selectedBody && bodies.length > 0) selectWaterBody(bodies[0].id);
  }, [selectedBody, bodies, selectWaterBody]);

  if (!layer || layer.kind !== 'water') return null;

  const handleAdd = () => {
    addWaterBody(
      layer.id,
      createWaterBody(`water-${Date.now()}`, nextWaterBodyName(bodies), waterTypes[0] ?? ''),
    );
  };

  const handleRemove = () => {
    if (!selectedBody) return;
    if (confirm(`Delete "${selectedBody.name}" and erase its water from the layer?`)) {
      removeWaterBody(layer.id, selectedBody.id);
    }
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      <PanelHeader
        title="Water Bodies"
        subtitle="Pick a body, then paint it, or draw its current with the flow tool"
        actions={
          <Tooltip label="Add a body of water" placement="top" hasArrow>
            <IconButton
              aria-label="Add water body"
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
      <Flex flex={1} overflow="hidden">
        <VStack
          align="stretch"
          spacing={0}
          w="260px"
          flexShrink={0}
          overflowY="auto"
          borderRight="1px"
          borderColor="editorShellBorder"
        >
          {bodies.map((body, index) => (
            <HStack
              key={body.id}
              px={3}
              py={2}
              spacing={3}
              cursor="pointer"
              bg={body.id === selectedBody?.id ? 'whiteAlpha.200' : 'transparent'}
              _hover={{ bg: 'whiteAlpha.100' }}
              onClick={() => selectWaterBody(body.id)}
            >
              <Box
                w="12px"
                h="12px"
                borderRadius="sm"
                flexShrink={0}
                bg={waterBodyColorCss(index)}
              />
              <Box flex={1} minW={0}>
                <Text fontSize="xs" color="white" noOfLines={1}>
                  {body.name}
                </Text>
                <Text fontSize="10px" color="gray.500" noOfLines={1}>
                  {body.waterType || 'No type'}
                  {body.isFreshwater ? ' · freshwater' : ''}
                  {body.flow.length > 0
                    ? ` · ${body.flow.length} current${body.flow.length === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </Box>
            </HStack>
          ))}
        </VStack>

        {selectedBody ? (
          <VStack align="stretch" spacing={3} p={4} flex={1} overflowY="auto" maxW="520px">
            <FormControl>
              <FieldLabel>Name</FieldLabel>
              <Input
                size="sm"
                bg="gray.800"
                value={selectedBody.name}
                onChange={(e) =>
                  updateWaterBody(layer.id, selectedBody.id, { name: e.target.value })
                }
              />
            </FormControl>
            <FormControl>
              <FieldLabel>Water Type</FieldLabel>
              <Select
                size="sm"
                bg="gray.800"
                value={selectedBody.waterType}
                onChange={(e) =>
                  updateWaterBody(layer.id, selectedBody.id, { waterType: e.target.value })
                }
              >
                {waterTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </FormControl>
            <Checkbox
              size="sm"
              isChecked={selectedBody.isFreshwater}
              onChange={(e) =>
                updateWaterBody(layer.id, selectedBody.id, { isFreshwater: e.target.checked })
              }
            >
              Freshwater (refills watering cans)
            </Checkbox>
            <FormControl>
              <FieldLabel>Bank Profile</FieldLabel>
              <Input
                size="sm"
                bg="gray.800"
                placeholder="None"
                value={selectedBody.bankProfile ?? ''}
                onChange={(e) =>
                  updateWaterBody(layer.id, selectedBody.id, { bankProfile: e.target.value })
                }
              />
              <Text fontSize="10px" color="gray.500" mt={1}>
                Name of the Unity bank profile drawn around this body. Empty draws no bank.
              </Text>
            </FormControl>
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.400">
                {selectedBody.flow.length === 0
                  ? 'No current drawn: the water type’s uniform flow applies.'
                  : `${selectedBody.flow.length} current${selectedBody.flow.length === 1 ? '' : 's'} drawn.`}
              </Text>
              <Button
                size="xs"
                variant="outline"
                isDisabled={selectedBody.flow.length === 0}
                onClick={() => clearFlow(layer.id, selectedBody.id)}
              >
                Clear currents
              </Button>
            </HStack>
            <Box>
              <Button
                size="xs"
                variant="outline"
                colorScheme="red"
                leftIcon={<DeleteIcon fontSize="10px" />}
                onClick={handleRemove}
              >
                Delete body
              </Button>
            </Box>
          </VStack>
        ) : (
          <Flex flex={1} align="center" justify="center">
            <Text fontSize="xs" color="gray.500">
              Add a body of water to start painting.
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};

export default WaterBottomPanel;
