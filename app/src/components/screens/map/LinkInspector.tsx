import React from 'react';
import {
  VStack,
  HStack,
  Text,
  Input,
  Select,
  Button,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Divider,
  IconButton,
  Tooltip,
  Badge,
  Flex,
  Box,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { LocationLink } from '../../../types/schema';
import { MapPreviewPicker } from '../../common/MapPreviewPicker';

// ─────────────────────────────────────────────────────────────────────────────
// Row helpers
// ─────────────────────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <FormLabel
    color="gray.500"
    fontSize="10px"
    fontWeight="black"
    textTransform="uppercase"
    letterSpacing="wide"
    mb={1}
  >
    {children}
  </FormLabel>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main inspector
// ─────────────────────────────────────────────────────────────────────────────

export const LinkInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const pickingLinkTargetForLinkId = useEditorStore((s) => s.pickingLinkTargetForLinkId);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const startPickingLinkTarget = useEditorStore((s) => s.startPickingLinkTarget);
  const cancelPickingLinkTarget = useEditorStore((s) => s.cancelPickingLinkTarget);
  const loadMap = useEditorStore((s) => s.loadMap);
  const createBidirectionalCounterpart = useEditorStore((s) => s.createBidirectionalCounterpart);

  const link = currentMap?.locationLinks?.find((l) => l.id === selectedLinkId);

  // Links from other maps that target this map at or near this link's target position
  const incomingLinks = React.useMemo(() => {
    if (!currentMap) return [];
    const results: {
      map: (typeof maps)[0];
      link: NonNullable<(typeof maps)[0]['locationLinks']>[0];
    }[] = [];
    for (const m of maps) {
      if (m.id === currentMap.id) continue;
      for (const l of m.locationLinks ?? []) {
        if (l.targetMapId === currentMap.id) {
          results.push({ map: m, link: l });
        }
      }
    }
    return results;
  }, [maps, currentMap]);

  if (!link) {
    return (
      <InspectorPanel title="Link">
        <InspectorEmptyState
          icon="🔗"
          message="No Link Selected"
          hint="Click a link on the map or in the Links list"
        />
      </InspectorPanel>
    );
  }

  const targetMap = maps.find((m) => m.id === link.targetMapId);
  const isSameMap = !link.targetMapId || link.targetMapId === currentMap?.id;
  const isBroken = !isSameMap && !targetMap;
  const isPickingTarget = pickingLinkTargetForLinkId === link.id;

  const update = (updates: Partial<LocationLink>) => updateLocationLink(link.id, updates);

  return (
    <InspectorPanel title="Location Link">
      <VStack align="stretch" spacing={5}>
        {/* Identity */}
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FieldLabel>ID</FieldLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              value={link.id}
              isReadOnly
              fontFamily="mono"
              color="gray.500"
              _hover={{ bg: '#071018' }}
            />
          </FormControl>

          <FormControl>
            <FieldLabel>Label</FieldLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              color="white"
              placeholder="e.g. Front Door"
              value={link.label ?? ''}
              onChange={(e) => update({ label: e.target.value || undefined })}
              _hover={{ bg: '#071018' }}
            />
          </FormControl>
        </VStack>

        <Divider borderColor="#071018" />

        {/* Source */}
        <VStack align="stretch" spacing={3}>
          <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
            Source
          </Text>

          <FormControl>
            <FieldLabel>Tile Position</FieldLabel>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                X
              </Text>
              <NumberInput
                size="xs"
                value={link.sourcePosition[0]}
                min={0}
                max={(currentMap?.width ?? 999) - 1}
                precision={0}
                onChange={(_, val) => {
                  if (!isNaN(val))
                    update({ sourcePosition: [Math.round(val), link.sourcePosition[1]] });
                }}
                flex={1}
              >
                <NumberInputField
                  bg="#0a0a0b"
                  borderColor="#1a1a2e"
                  color="white"
                  fontFamily="mono"
                  _hover={{ bg: '#071018' }}
                />
              </NumberInput>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                Y
              </Text>
              <NumberInput
                size="xs"
                value={link.sourcePosition[1]}
                min={0}
                max={(currentMap?.height ?? 999) - 1}
                precision={0}
                onChange={(_, val) => {
                  if (!isNaN(val))
                    update({ sourcePosition: [link.sourcePosition[0], Math.round(val)] });
                }}
                flex={1}
              >
                <NumberInputField
                  bg="#0a0a0b"
                  borderColor="#1a1a2e"
                  color="white"
                  fontFamily="mono"
                  _hover={{ bg: '#071018' }}
                />
              </NumberInput>
            </HStack>
          </FormControl>

          <FormControl>
            <FieldLabel>Trigger Size (tiles)</FieldLabel>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                W
              </Text>
              <NumberInput
                size="xs"
                value={link.triggerSize[0]}
                min={1}
                max={16}
                precision={0}
                onChange={(_, val) => {
                  if (!isNaN(val))
                    update({ triggerSize: [Math.max(1, Math.round(val)), link.triggerSize[1]] });
                }}
                flex={1}
              >
                <NumberInputField
                  bg="#0a0a0b"
                  borderColor="#1a1a2e"
                  color="white"
                  fontFamily="mono"
                  _hover={{ bg: '#071018' }}
                />
              </NumberInput>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                H
              </Text>
              <NumberInput
                size="xs"
                value={link.triggerSize[1]}
                min={1}
                max={16}
                precision={0}
                onChange={(_, val) => {
                  if (!isNaN(val))
                    update({ triggerSize: [link.triggerSize[0], Math.max(1, Math.round(val))] });
                }}
                flex={1}
              >
                <NumberInputField
                  bg="#0a0a0b"
                  borderColor="#1a1a2e"
                  color="white"
                  fontFamily="mono"
                  _hover={{ bg: '#071018' }}
                />
              </NumberInput>
            </HStack>
          </FormControl>
        </VStack>

        <Divider borderColor="#071018" />

        {/* Target */}
        <VStack align="stretch" spacing={3}>
          <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
            Target
          </Text>

          <FormControl>
            <FieldLabel>Map</FieldLabel>
            <Select
              size="xs"
              value={link.targetMapId}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              onChange={(e) => update({ targetMapId: e.target.value })}
            >
              <option value="">— Same map —</option>
              {maps
                .filter((m) => m.id !== currentMap?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
            {!isSameMap && targetMap && (
              <Button
                mt={2}
                size="xs"
                variant="outline"
                colorScheme="cyan"
                w="full"
                onClick={() => loadMap(targetMap.id)}
              >
                → Go to '<i>{targetMap.name}</i>'
              </Button>
            )}
            {isBroken && (
              <Text fontSize="10px" color="red.400" mt={1}>
                ⚠ Target map not found
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FieldLabel>Entry Position</FieldLabel>

            {/* Cross-map: show visual map picker */}
            {!isSameMap && targetMap ? (
              <Box mt={1}>
                <Text fontSize="10px" color="gray.500" mb={2}>
                  Click a tile on {targetMap.name} to set the entry point.
                </Text>
                <MapPreviewPicker
                  mapId={link.targetMapId}
                  selectedPosition={link.targetPosition}
                  onSelect={(x, y) => update({ targetPosition: [x, y] })}
                  width={240}
                  height={180}
                  interactive={true}
                />
                <Text fontSize="10px" color="cyan.400" fontFamily="mono" mt={1}>
                  ({link.targetPosition[0]}, {link.targetPosition[1]})
                </Text>
              </Box>
            ) : (
              /* Same-map or broken: show coordinate inputs + tile picker */
              <>
                {isPickingTarget ? (
                  <Flex
                    align="center"
                    justify="space-between"
                    px={2}
                    py={1}
                    bg="blue.900"
                    borderRadius="md"
                    border="1px"
                    borderColor="blue.700"
                    mb={1}
                  >
                    <Text fontSize="10px" color="blue.200">
                      Click a tile to set entry point
                    </Text>
                    <Text
                      fontSize="10px"
                      color="blue.400"
                      cursor="pointer"
                      _hover={{ color: 'blue.300' }}
                      onClick={cancelPickingLinkTarget}
                    >
                      Cancel
                    </Text>
                  </Flex>
                ) : (
                  <HStack spacing={2} mb={1}>
                    <Text fontSize="xs" color="gray.400" flexShrink={0}>
                      X
                    </Text>
                    <NumberInput
                      size="xs"
                      value={link.targetPosition[0]}
                      precision={0}
                      onChange={(_, val) => {
                        if (!isNaN(val))
                          update({ targetPosition: [Math.round(val), link.targetPosition[1]] });
                      }}
                      flex={1}
                    >
                      <NumberInputField
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        fontFamily="mono"
                        _hover={{ bg: '#071018' }}
                      />
                    </NumberInput>
                    <Text fontSize="xs" color="gray.400" flexShrink={0}>
                      Y
                    </Text>
                    <NumberInput
                      size="xs"
                      value={link.targetPosition[1]}
                      precision={0}
                      onChange={(_, val) => {
                        if (!isNaN(val))
                          update({ targetPosition: [link.targetPosition[0], Math.round(val)] });
                      }}
                      flex={1}
                    >
                      <NumberInputField
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        fontFamily="mono"
                        _hover={{ bg: '#071018' }}
                      />
                    </NumberInput>
                    <Tooltip label="Pick tile on map" placement="top" hasArrow>
                      <IconButton
                        aria-label="Pick entry tile"
                        icon={<Text fontSize="10px">🎯</Text>}
                        size="xs"
                        variant="ghost"
                        color="gray.400"
                        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                        onClick={() => startPickingLinkTarget(link.id)}
                      />
                    </Tooltip>
                  </HStack>
                )}
              </>
            )}

            {/* Status badge */}
            <Box mt={1}>
              {isBroken ? (
                <Badge colorScheme="red" fontSize="9px">
                  ⚠ Target map not found
                </Badge>
              ) : isSameMap ? (
                <Badge colorScheme="red" fontSize="9px">
                  Same map
                </Badge>
              ) : (
                <Badge colorScheme="cyan" fontSize="9px">
                  → {targetMap?.name}
                </Badge>
              )}
            </Box>
          </FormControl>
        </VStack>

        <Divider borderColor="#071018" />

        {/* Behaviour */}
        <VStack align="stretch" spacing={3}>
          <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
            Behaviour
          </Text>

          <FormControl>
            <FieldLabel>Direction</FieldLabel>
            <Select
              size="xs"
              value={link.direction}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              onChange={(e) => update({ direction: e.target.value as LocationLink['direction'] })}
            >
              <option value="one-way">One-way →</option>
              <option value="bidirectional">Bidirectional ↔</option>
            </Select>
          </FormControl>

          {/* Bidirectional cross-map: show counterpart status */}
          {link.direction === 'bidirectional' && !isSameMap && targetMap && (
            <Box>
              {link.targetLinkId ? (
                <HStack spacing={2}>
                  <Badge colorScheme="green" fontSize="9px">
                    ↔ Counterpart exists
                  </Badge>
                  <Text fontSize="10px" color="gray.600" fontFamily="mono">
                    {link.targetLinkId}
                  </Text>
                </HStack>
              ) : (
                <VStack align="stretch" spacing={1}>
                  <Text fontSize="10px" color="yellow.600">
                    No return link on {targetMap.name} yet.
                  </Text>
                  <Button
                    size="xs"
                    colorScheme="yellow"
                    variant="outline"
                    onClick={() => createBidirectionalCounterpart(link.id)}
                  >
                    ↔ Create counterpart on {targetMap.name}
                  </Button>
                </VStack>
              )}
            </Box>
          )}
        </VStack>

        {/* Incoming links — other maps linking to this map */}
        {incomingLinks.length > 0 && (
          <>
            <Divider borderColor="#071018" />
            <VStack align="stretch" spacing={2}>
              <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
                Linked From
              </Text>
              {incomingLinks.map(({ map: srcMap, link: inLink }) => (
                <HStack
                  key={`${srcMap.id}:${inLink.id}`}
                  spacing={2}
                  px={2}
                  py={1.5}
                  bg="whiteAlpha.50"
                  borderRadius="md"
                  border="1px"
                  borderColor="cyan.900"
                >
                  <Box flex={1} minW={0}>
                    <Text fontSize="xs" color="cyan.200" noOfLines={1}>
                      {inLink.label || inLink.id}
                    </Text>
                    <Text fontSize="10px" color="gray.500">
                      {srcMap.name} · ({inLink.sourcePosition[0]}, {inLink.sourcePosition[1]})
                    </Text>
                  </Box>
                  <Button
                    size="xs"
                    variant="ghost"
                    colorScheme="cyan"
                    flexShrink={0}
                    onClick={() => loadMap(srcMap.id)}
                  >
                    ← Go
                  </Button>
                </HStack>
              ))}
            </VStack>
          </>
        )}
      </VStack>
    </InspectorPanel>
  );
};

export default LinkInspector;
