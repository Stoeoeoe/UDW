import React from 'react';
import { FiLink } from 'react-icons/fi';
import {
  VStack,
  HStack,
  Text,
  Input,
  Select,
  Button,
  FormControl,
  NumberInput,
  NumberInputField,
  Divider,
  Badge,
  Box,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { LocationLink } from '../../../types/schema';
import { MapPreviewPicker } from '../../common/MapPreviewPicker';
import { CardinalDirectionPicker } from '../../common/CardinalDirectionPicker';
import { FieldLabel, SectionLabel } from '../../common/Typography.tsx';
import { getIncomingLinksForLink, resolveLinkTarget } from '../../../lib/locationLinkUtils';

const Vector2Field: React.FC<{
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
}> = ({ value, onChange, step = 1 }) => (
  <HStack spacing={2}>
    <Text fontSize="xs" color="gray.400" flexShrink={0}>
      X
    </Text>
    <NumberInput
      size="xs"
      value={value[0]}
      precision={step < 1 ? 2 : 0}
      step={step}
      onChange={(_, next) => {
        if (!isNaN(next)) onChange([next, value[1]]);
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
      value={value[1]}
      precision={step < 1 ? 2 : 0}
      step={step}
      onChange={(_, next) => {
        if (!isNaN(next)) onChange([value[0], next]);
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
);

export const LinkInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectAnchor = useEditorStore((s) => s.selectAnchor);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const loadMap = useEditorStore((s) => s.loadMap);
  const updateMapAnchor = useEditorStore((s) => s.updateMapAnchor);
  const createTargetAnchorForLink = useEditorStore((s) => s.createTargetAnchorForLink);

  const link = currentMap?.locationLinks?.find((l) => l.id === selectedLinkId);

  if (!link) {
    return (
      <InspectorPanel title="Link">
        <InspectorEmptyState
          icon={FiLink}
          message="No Link Selected"
          hint="Click a link on the map or in the Links list"
        />
      </InspectorPanel>
    );
  }

  const targetMap = maps.find((m) => m.id === link.targetMapId);
  const isSameMap = !link.targetMapId || link.targetMapId === currentMap?.id;
  const isBroken = !isSameMap && !targetMap;
  const resolvedTarget = resolveLinkTarget(link, currentMap, maps);
  const landingMap = resolvedTarget.targetMap;
  const targetLink = resolvedTarget.targetLink;
  const landingAnchor = resolvedTarget.anchor;
  const effectiveTargetPosition = resolvedTarget.position;
  const effectiveFacing = resolvedTarget.facing;
  const previewTargetPosition: [number, number] = [
    Math.floor(effectiveTargetPosition[0] / projectTileSize),
    Math.floor(effectiveTargetPosition[1] / projectTileSize),
  ];
  const previewAnchorPosition: [number, number] | null = landingAnchor
    ? [
        Math.floor(landingAnchor.position[0] / projectTileSize),
        Math.floor(landingAnchor.position[1] / projectTileSize),
      ]
    : null;
  const targetableLinks = (landingMap?.locationLinks ?? []).filter(
    (candidate) => candidate.id !== link.id,
  );
  const incomingLinks = currentMap ? getIncomingLinksForLink(link, currentMap, maps) : [];

  const update = (updates: Partial<LocationLink>) => updateLocationLink(link.id, updates);

  const updateLandingPosition = (position: [number, number]) => {
    if (landingAnchor && landingMap) {
      updateMapAnchor(landingMap.id, landingAnchor.id, { position });
      return;
    }

    update({ targetPosition: position });
  };

  const updateLandingFacing = (facing: [number, number]) => {
    if (landingAnchor && landingMap) {
      updateMapAnchor(landingMap.id, landingAnchor.id, { facing });
      return;
    }

    update({ targetFacing: facing });
  };

  const openAnchorOnMap = (mapId: string, anchorId: string) => {
    const targetMapForSelection = maps.find((map) => map.id === mapId);
    if (!targetMapForSelection) return;
    const applySelection = () => {
      const latestMap = useEditorStore.getState().maps.find((map) => map.id === mapId);
      const anchorLayer = latestMap?.layers.find((layer) => layer.kind === 'anchor');
      if (anchorLayer) {
        selectLayer(anchorLayer.id);
      }
      selectAnchor(anchorId);
    };

    if (mapId !== currentMap?.id) {
      loadMap(mapId);
      window.requestAnimationFrame(applySelection);
      return;
    }

    applySelection();
  };

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
          <SectionLabel textStyle="fieldLabel">Source</SectionLabel>

          <FormControl>
            <FieldLabel>Pixel Position</FieldLabel>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                X
              </Text>
              <NumberInput
                size="xs"
                value={link.sourcePosition[0]}
                min={0}
                max={(currentMap?.width ?? 999) * projectTileSize}
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
            <FieldLabel>Trigger Size (px)</FieldLabel>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                W
              </Text>
              <NumberInput
                size="xs"
                value={link.triggerSize[0]}
                min={1}
                max={(currentMap?.width ?? 64) * projectTileSize}
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

        {/* Target */}
        <VStack align="stretch" spacing={3}>
          <SectionLabel textStyle="fieldLabel">Target</SectionLabel>

          <FormControl>
            <FieldLabel>Map</FieldLabel>
            <Select
              size="xs"
              value={link.targetMapId}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              onChange={(e) =>
                update({
                  targetMapId: e.target.value,
                  targetLinkId: undefined,
                  targetAnchorId: undefined,
                })
              }
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
                → Open {targetMap.name}
              </Button>
            )}
            {isBroken && (
              <Text fontSize="10px" color="red.400" mt={1}>
                ⚠ Target map not found
              </Text>
            )}
          </FormControl>

          {/* Arrival Anchor — direct targetAnchorId selection */}
          <FormControl>
            <FieldLabel>Arrival Anchor</FieldLabel>
            <Select
              size="xs"
              value={link.targetAnchorId ?? ''}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              isDisabled={!landingMap}
              onChange={(e) =>
                update({
                  targetAnchorId: e.target.value || undefined,
                })
              }
            >
              <option value="">— None (use position below) —</option>
              {(landingMap?.spatialPrimitives?.anchors ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Text fontSize="10px" color="gray.500" mt={1}>
              Anchor on {landingMap?.name ?? 'target map'} that sets the arrival position and
              facing. Takes priority over the position below.
            </Text>
            {landingAnchor && !targetLink && (
              <HStack spacing={2} mt={2}>
                <Badge colorScheme="orange" fontSize="9px">
                  @{landingAnchor.name}
                </Badge>
                {landingMap && (
                  <Button
                    size="xs"
                    variant="ghost"
                    colorScheme="orange"
                    onClick={() => openAnchorOnMap(landingMap.id, landingAnchor.id)}
                  >
                    Open anchor
                  </Button>
                )}
              </HStack>
            )}
            {!link.targetAnchorId && landingMap && (
              <Button
                size="xs"
                mt={2}
                variant="outline"
                colorScheme="orange"
                onClick={async () => {
                  const anchorId = await createTargetAnchorForLink(link.id);
                  if (anchorId && landingMap) {
                    openAnchorOnMap(landingMap.id, anchorId);
                  }
                }}
              >
                Create &amp; assign arrival anchor
              </Button>
            )}
          </FormControl>

          {/* Paired Link — targetLinkId for bidirectional pairing */}
          <FormControl>
            <FieldLabel>Paired Link</FieldLabel>
            <Select
              size="xs"
              value={link.targetLinkId ?? ''}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              isDisabled={!landingMap}
              onChange={(e) =>
                update({
                  targetLinkId: e.target.value || undefined,
                })
              }
            >
              <option value="">— None —</option>
              {targetableLinks.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label || candidate.id}
                </option>
              ))}
            </Select>
            <Text fontSize="10px" color="gray.500" mt={1}>
              Optional. When set, this link uses the paired link's arrival anchor. Overrides the
              anchor above.
            </Text>
            {targetLink && (
              <VStack align="stretch" spacing={2} mt={2}>
                <HStack spacing={2}>
                  <Badge colorScheme="green" fontSize="9px">
                    → {targetLink.label || targetLink.id}
                  </Badge>
                  {landingAnchor && (
                    <Badge colorScheme="orange" fontSize="9px">
                      via @{landingAnchor.name}
                    </Badge>
                  )}
                  {!landingAnchor && (
                    <Badge colorScheme="yellow" fontSize="9px">
                      no anchor on paired link
                    </Badge>
                  )}
                </HStack>
                {landingAnchor && landingMap && (
                  <Button
                    size="xs"
                    variant="ghost"
                    colorScheme="orange"
                    alignSelf="flex-start"
                    onClick={() => openAnchorOnMap(landingMap.id, landingAnchor.id)}
                  >
                    Open anchor
                  </Button>
                )}
              </VStack>
            )}
          </FormControl>

          <FormControl>
            <FieldLabel>Fallback Arrival Position</FieldLabel>

            {landingMap ? (
              <Box mt={1}>
                <Text fontSize="10px" color="gray.500" mb={2}>
                  {landingAnchor
                    ? `Ignored — anchor "${landingAnchor.name}" takes priority.`
                    : `Click a tile on ${landingMap.name} to place the landing point.`}
                </Text>
                <MapPreviewPicker
                  mapId={landingMap.id}
                  onSelect={(x, y) =>
                    updateLandingPosition([x * projectTileSize, y * projectTileSize])
                  }
                  width={240}
                  height={180}
                  interactive={!landingAnchor}
                  overlays={[
                    ...(previewAnchorPosition && landingAnchor
                      ? [
                          {
                            kind: 'anchor' as const,
                            position: previewAnchorPosition,
                            facing: landingAnchor.facing ?? effectiveFacing,
                            color: 'rgba(246, 173, 85, 0.95)',
                          },
                        ]
                      : []),
                    {
                      kind: 'arrival',
                      position: previewTargetPosition,
                      facing: effectiveFacing,
                      color: landingAnchor
                        ? 'rgba(34, 211, 238, 0.35)'
                        : 'rgba(34, 211, 238, 0.95)',
                    },
                  ]}
                />
                <Text fontSize="10px" color="cyan.400" fontFamily="mono" mt={1}>
                  ({effectiveTargetPosition[0]}, {effectiveTargetPosition[1]})
                </Text>
              </Box>
            ) : (
              <Text fontSize="10px" color="red.400" mt={1}>
                Target map not found. Manual coordinates below will be preserved until it returns.
              </Text>
            )}

            <Box mt={landingMap ? 3 : 2}>
              <Vector2Field
                value={link.targetPosition}
                onChange={(position) => update({ targetPosition: position })}
              />
            </Box>

            {/* Status badge */}
            <Box mt={1}>
              {isBroken ? (
                <Badge colorScheme="red" fontSize="9px">
                  ⚠ Target map not found
                </Badge>
              ) : isSameMap ? (
                <Badge colorScheme="yellow" fontSize="9px">
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
          <SectionLabel textStyle="fieldLabel">Behaviour</SectionLabel>

          <Text fontSize="10px" color="gray.500">
            This editor currently configures a one-way link. Create a second link if you want a
            return path.
          </Text>

          <FormControl>
            <FieldLabel>Arrival Facing</FieldLabel>
            <CardinalDirectionPicker value={effectiveFacing} onChange={updateLandingFacing} />
            <Text fontSize="10px" color="gray.500" mt={1}>
              {landingAnchor
                ? `Stored on anchor ${landingAnchor.name}.`
                : 'Stored directly on this link.'}
            </Text>
          </FormControl>
        </VStack>

        {/* Incoming links — other links pointing at this link */}
        {incomingLinks.length > 0 && (
          <>
            <Divider borderColor="#071018" />
            <VStack align="stretch" spacing={2}>
              <SectionLabel textStyle="fieldLabel">Incoming Links</SectionLabel>
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
