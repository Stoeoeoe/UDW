import React from 'react';
import { Badge, Button, HStack, Text } from '@chakra-ui/react';
import { FiZap } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { MapTrigger, TriggerShape, TriggerType } from '../../../types/schema';
import {
  CompactInput,
  CompactSelect,
  Field,
  FieldStack,
  InlineNumberPair,
  InspectorSection,
  ReadOnlyIdField,
} from '../../common/Fields';

const TRIGGER_TYPES: { value: TriggerType; label: string; description: string }[] = [
  {
    value: 'cutscene',
    label: 'Cutscene',
    description: 'Starts a cutscene for this map after location reveal.',
  },
  {
    value: 'locationLinkTrigger',
    label: 'Location Link Trigger',
    description: 'Fires a map transition when an character enters this zone.',
  },
];

const TriggerInspectorContent: React.FC<{ trigger: MapTrigger }> = ({ trigger }) => {
  const updateTrigger = useEditorStore((s) => s.updateTrigger);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const cutscenes = useEditorStore((s) => s.cutscenes);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const selectLink = useEditorStore((s) => s.selectLink);
  const selectTrigger = useEditorStore((s) => s.selectTrigger);
  const loadMap = useEditorStore((s) => s.loadMap);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const selectAnchor = useEditorStore((s) => s.selectAnchor);

  const update = (updates: Partial<MapTrigger>) => updateTrigger(trigger.id, updates);

  const typeInfo = TRIGGER_TYPES.find((t) => t.value === trigger.type);
  const link = currentMap?.locationLinks?.find((entry) => entry.triggerId === trigger.id);
  const targetMap = link ? maps.find((map) => map.id === link.targetMapId) : undefined;
  const targetAnchor = targetMap?.spatialPrimitives?.anchors?.find(
    (anchor) => anchor.id === link?.targetAnchorId,
  );

  const jumpToTarget = () => {
    if (!link || !targetMap) return;

    const applySelection = () => {
      const store = useEditorStore.getState();
      const latest = store.maps.find((map) => map.id === link.targetMapId);
      const navLayer = latest?.layers.find((layer) => layer.kind === 'navigation');
      if (navLayer) {
        store.selectLayer(navLayer.id);
      }
      store.selectAnchor(link.targetAnchorId);
    };

    if (link.targetMapId !== currentMap?.id) {
      loadMap(link.targetMapId);
      Promise.resolve().then(applySelection);
      return;
    }

    const navLayer = currentMap?.layers.find((layer) => layer.kind === 'navigation');
    if (navLayer) {
      selectLayer(navLayer.id);
    }
    selectAnchor(link.targetAnchorId);
  };

  return (
    <FieldStack spacing={5}>
      <InspectorSection>
        <FieldStack>
          <Field label="ID">
            <ReadOnlyIdField value={trigger.id} />
          </Field>

          <Field label="Label">
            <CompactInput
              placeholder="e.g. Cave Entrance"
              value={trigger.label ?? ''}
              onChange={(event) => update({ label: event.target.value || undefined })}
            />
          </Field>
        </FieldStack>
      </InspectorSection>

      <InspectorSection title="Type">
        <Field label="Trigger Type" helperText={typeInfo?.description}>
          <CompactSelect
            value={trigger.type}
            onChange={(event) => update({ type: event.target.value as TriggerType })}
          >
            {TRIGGER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </CompactSelect>
        </Field>
      </InspectorSection>

      {trigger.type === 'cutscene' && (
        <InspectorSection title="Cutscene">
          <Field
            label="Cutscene"
            helperText="Only cutscenes on this map can be selected. Busy requests do not queue."
          >
            <CompactSelect
              value={trigger.cutsceneId ?? ''}
              onChange={(event) => update({ cutsceneId: event.target.value })}
            >
              <option value="">Select a cutscene</option>
              {trigger.cutsceneId &&
                !cutscenes.some(
                  (c) => c.id === trigger.cutsceneId && c.mapId === currentMap?.id,
                ) && (
                  <option value={trigger.cutsceneId}>
                    Missing or wrong map: {trigger.cutsceneId}
                  </option>
                )}
              {cutscenes
                .filter((c) => c.mapId === currentMap?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
            </CompactSelect>
          </Field>
        </InspectorSection>
      )}
      <InspectorSection title="Shape">
        <Field label="Shape Type">
          <CompactSelect
            value={trigger.shape}
            onChange={(event) => {
              const shape = event.target.value as TriggerShape;
              if (shape === 'rectangle') {
                update({ shape, size: [projectTileSize, projectTileSize], points: undefined });
                return;
              }

              const [x, y] = trigger.position;
              const [w, h] = trigger.size ?? [projectTileSize, projectTileSize];
              update({
                shape,
                points: [
                  [x, y],
                  [x + w, y],
                  [x + w, y + h],
                  [x, y + h],
                ],
                size: undefined,
              });
            }}
          >
            <option value="rectangle">Rectangle</option>
            <option value="polygon">Polygon</option>
          </CompactSelect>
        </Field>

        <Field label="Position (px)">
          <InlineNumberPair
            labels={['X', 'Y']}
            values={[trigger.position[0], trigger.position[1]]}
            onChange={(position) => update({ position })}
          />
        </Field>

        {trigger.shape === 'rectangle' ? (
          <Field label="Size (px)">
            <InlineNumberPair
              labels={['W', 'H']}
              values={[trigger.size?.[0] ?? projectTileSize, trigger.size?.[1] ?? projectTileSize]}
              min={1}
              onChange={([width, height]) =>
                update({
                  size: [Math.max(1, width), Math.max(1, height)],
                })
              }
            />
          </Field>
        ) : null}

        {trigger.shape === 'polygon' && trigger.points ? (
          <Field
            label={`Vertices (${trigger.points.length})`}
            helperText="Drag vertices on the canvas to reposition them."
          >
            <FieldStack spacing={2}>
              {trigger.points.map(([x, y], index) => (
                <HStack key={`${x}-${y}-${index}`} spacing={2}>
                  <Badge colorScheme="purple" fontSize="9px">
                    {index}
                  </Badge>
                  <Text textStyle="monoMeta">
                    ({x}, {y})
                  </Text>
                </HStack>
              ))}
            </FieldStack>
          </Field>
        ) : null}
      </InspectorSection>

      {link ? (
        <InspectorSection title="Connected Link">
          <HStack justify="space-between" align="center">
            <Text textStyle="helperText">Linked location transition</Text>
            <Badge colorScheme="cyan" fontSize="9px">
              {link.id}
            </Badge>
          </HStack>

          <Field label="Label">
            <CompactInput
              placeholder="e.g. Front Door"
              value={link.label ?? ''}
              onChange={(event) =>
                updateLocationLink(link.id, { label: event.target.value || undefined })
              }
            />
          </Field>

          <Field label="Target Map" helperText={!targetMap ? 'Target map not found' : undefined}>
            <CompactSelect
              value={link.targetMapId}
              onChange={(event) =>
                updateLocationLink(link.id, {
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
          </Field>

          <Field
            label="Arrival Anchor"
            helperText={
              !targetAnchor && targetMap
                ? 'No anchor selected; link has no arrival point.'
                : undefined
            }
          >
            <CompactSelect
              value={link.targetAnchorId}
              isDisabled={!targetMap}
              onChange={(event) =>
                updateLocationLink(link.id, { targetAnchorId: event.target.value })
              }
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
          </Field>

          <HStack spacing={2}>
            <Button
              size="xs"
              variant="outline"
              colorScheme="cyan"
              flex={1}
              isDisabled={!targetMap || !targetAnchor}
              onClick={jumpToTarget}
            >
              Jump to target
            </Button>
            <Button
              size="xs"
              variant="ghost"
              colorScheme="cyan"
              onClick={() => {
                selectTrigger(null);
                selectLink(link.id);
              }}
            >
              Open link
            </Button>
            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              onClick={() => removeLocationLink(link.id)}
            >
              Unlink
            </Button>
          </HStack>
        </InspectorSection>
      ) : null}
    </FieldStack>
  );
};

export const TriggerInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const selectedTriggerId = useEditorStore((s) => s.selectedTriggerId);

  const trigger = currentMap?.spatialPrimitives?.triggers?.find(
    (entry) => entry.id === selectedTriggerId,
  );

  if (!trigger) {
    return (
      <InspectorPanel title="Trigger">
        <InspectorEmptyState
          icon={FiZap}
          message="No Trigger Selected"
          hint="Click a trigger on the map or in the Triggers list"
        />
      </InspectorPanel>
    );
  }

  return (
    <InspectorPanel title="Trigger">
      <TriggerInspectorContent trigger={trigger} />
    </InspectorPanel>
  );
};

export default TriggerInspector;
