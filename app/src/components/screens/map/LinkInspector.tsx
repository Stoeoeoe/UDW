import React from 'react';
import { Badge, Button, HStack, Text } from '@chakra-ui/react';
import { FiLink } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { LocationLink } from '../../../types/schema';
import {
  CompactInput,
  CompactSelect,
  Field,
  FieldStack,
  InspectorSection,
  ReadOnlyIdField,
} from '../../common/Fields';

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
      <FieldStack spacing={5}>
        <InspectorSection>
          <FieldStack>
            <Field label="ID">
              <ReadOnlyIdField value={link.id} />
            </Field>

            <Field label="Label">
              <CompactInput
                placeholder="e.g. Front Door"
                value={link.label ?? ''}
                onChange={(event) => update({ label: event.target.value || undefined })}
              />
            </Field>
          </FieldStack>
        </InspectorSection>

        <InspectorSection title="Source Trigger">
          <Field
            label="Trigger Zone"
            helperText={
              trigger
                ? undefined
                : 'Trigger not found. Pick another or create one on the navigation layer.'
            }
          >
            <CompactSelect
              value={link.triggerId}
              onChange={(event) => update({ triggerId: event.target.value })}
            >
              <option value="" disabled>
                Select a trigger
              </option>
              {(currentMap?.spatialPrimitives?.triggers ?? [])
                .filter((item) => item.type !== 'cutscene')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label || item.id}
                  </option>
                ))}
            </CompactSelect>
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
            ) : null}
          </Field>
        </InspectorSection>

        <InspectorSection title="Target">
          <Field label="Target Map" helperText={!targetMap ? 'Target map not found' : undefined}>
            <CompactSelect
              value={link.targetMapId}
              onChange={(event) =>
                update({
                  targetMapId: event.target.value,
                  targetAnchorId: '',
                })
              }
            >
              <option value="" disabled>
                Select a map
              </option>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                  {map.id === currentMap?.id ? ' (same map)' : ''}
                </option>
              ))}
            </CompactSelect>
            {targetMap && !isSameMap ? (
              <Button
                mt={2}
                size="xs"
                variant="outline"
                colorScheme="cyan"
                w="full"
                onClick={() => loadMap(targetMap.id)}
              >
                Open {targetMap.name}
              </Button>
            ) : null}
          </Field>

          <Field
            label="Arrival Anchor"
            helperText={`Anchor on ${targetMap?.name ?? 'target map'} that sets the arrival position and facing.`}
          >
            <CompactSelect
              value={link.targetAnchorId}
              isDisabled={!targetMap}
              onChange={(event) => update({ targetAnchorId: event.target.value })}
            >
              <option value="" disabled>
                Select an anchor
              </option>
              {(targetMap?.spatialPrimitives?.anchors ?? []).map((anchor) => (
                <option key={anchor.id} value={anchor.id}>
                  {anchor.name}
                </option>
              ))}
            </CompactSelect>
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
            ) : targetMap ? (
              <Text fontSize="10px" color="red.400" mt={2}>
                No anchor selected; the link has no arrival point.
              </Text>
            ) : null}
          </Field>
        </InspectorSection>
      </FieldStack>
    </InspectorPanel>
  );
};

export default LinkInspector;
