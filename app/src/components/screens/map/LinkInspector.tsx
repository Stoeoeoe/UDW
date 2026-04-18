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
  Divider,
  Badge,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { LocationLink } from '../../../types/schema';
import { FieldLabel, SectionLabel } from '../../common/Typography.tsx';

export const LinkInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectAnchor = useEditorStore((s) => s.selectAnchor);
  const selectTrigger = useEditorStore((s) => s.selectTrigger);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const loadMap = useEditorStore((s) => s.loadMap);

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

  const trigger = currentMap?.spatialPrimitives?.triggers?.find((t) => t.id === link.triggerId);
  const targetMap = maps.find((m) => m.id === link.targetMapId);
  const targetAnchor = targetMap?.spatialPrimitives?.anchors?.find(
    (a) => a.id === link.targetAnchorId,
  );
  const isSameMap = link.targetMapId === currentMap?.id;

  const update = (updates: Partial<LocationLink>) => updateLocationLink(link.id, updates);

  const openAnchorOnMap = (mapId: string, anchorId: string) => {
    const applySelection = () => {
      const latestMap = useEditorStore.getState().maps.find((map) => map.id === mapId);
      const navLayer = latestMap?.layers.find((layer) => layer.kind === 'navigation');
      if (navLayer) selectLayer(navLayer.id);
      selectAnchor(anchorId);
    };

    if (mapId !== currentMap?.id) {
      loadMap(mapId);
      window.requestAnimationFrame(applySelection);
      return;
    }

    applySelection();
  };

  const openTrigger = (triggerId: string) => {
    const navLayer = currentMap?.layers.find((layer) => layer.kind === 'navigation');
    if (navLayer) selectLayer(navLayer.id);
    selectTrigger(triggerId);
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
          <SectionLabel textStyle="fieldLabel">Source Trigger</SectionLabel>

          <FormControl>
            <FieldLabel>Trigger Zone</FieldLabel>
            <Select
              size="xs"
              value={link.triggerId}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              onChange={(e) => update({ triggerId: e.target.value })}
            >
              <option value="" disabled>
                — Select a trigger —
              </option>
              {(currentMap?.spatialPrimitives?.triggers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label || t.id}
                </option>
              ))}
            </Select>
            {trigger ? (
              <HStack spacing={2} mt={2}>
                <Badge colorScheme="purple" fontSize="9px">
                  {trigger.shape} · ({trigger.position[0]}, {trigger.position[1]})
                </Badge>
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="purple"
                  onClick={() => openTrigger(trigger.id)}
                >
                  Open trigger
                </Button>
              </HStack>
            ) : (
              <Text fontSize="10px" color="red.400" mt={1}>
                ⚠ Trigger not found. Pick another or create one on the navigation layer.
              </Text>
            )}
          </FormControl>
        </VStack>

        <Divider borderColor="#071018" />

        {/* Target */}
        <VStack align="stretch" spacing={3}>
          <SectionLabel textStyle="fieldLabel">Target</SectionLabel>

          <FormControl>
            <FieldLabel>Target Map</FieldLabel>
            <Select
              size="xs"
              value={link.targetMapId}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              onChange={(e) =>
                update({
                  targetMapId: e.target.value,
                  targetAnchorId: '',
                })
              }
            >
              <option value="" disabled>
                — Select a map —
              </option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === currentMap?.id ? ' (same map)' : ''}
                </option>
              ))}
            </Select>
            {!targetMap && (
              <Text fontSize="10px" color="red.400" mt={1}>
                ⚠ Target map not found
              </Text>
            )}
            {targetMap && !isSameMap && (
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
          </FormControl>

          <FormControl>
            <FieldLabel>Arrival Anchor</FieldLabel>
            <Select
              size="xs"
              value={link.targetAnchorId}
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              isDisabled={!targetMap}
              onChange={(e) => update({ targetAnchorId: e.target.value })}
            >
              <option value="" disabled>
                — Select an anchor —
              </option>
              {(targetMap?.spatialPrimitives?.anchors ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Text fontSize="10px" color="gray.500" mt={1}>
              Anchor on {targetMap?.name ?? 'target map'} that sets the arrival position and facing.
            </Text>
            {targetAnchor && targetMap ? (
              <HStack spacing={2} mt={2}>
                <Badge colorScheme="orange" fontSize="9px">
                  @{targetAnchor.name}
                </Badge>
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="orange"
                  onClick={() => openAnchorOnMap(targetMap.id, targetAnchor.id)}
                >
                  Open anchor
                </Button>
              </HStack>
            ) : (
              targetMap && (
                <Text fontSize="10px" color="red.400" mt={1}>
                  ⚠ No anchor selected — link has no arrival point.
                </Text>
              )
            )}
          </FormControl>
        </VStack>
      </VStack>
    </InspectorPanel>
  );
};

export default LinkInspector;
