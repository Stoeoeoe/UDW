import React from 'react';
import { FiZap } from 'react-icons/fi';
import {
  VStack,
  HStack,
  Text,
  Input,
  Select,
  FormControl,
  NumberInput,
  NumberInputField,
  Divider,
  Badge,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { MapTrigger, TriggerShape, TriggerType } from '../../../types/schema';
import { FieldLabel, SectionLabel } from '../../common/Typography.tsx';

const TRIGGER_TYPES: { value: TriggerType; label: string; description: string }[] = [
  {
    value: 'locationLinkTrigger',
    label: 'Location Link Trigger',
    description: 'Fires a map transition when an actor enters this zone.',
  },
];

const TriggerInspectorContent: React.FC<{ trigger: MapTrigger }> = ({ trigger }) => {
  const updateTrigger = useEditorStore((s) => s.updateTrigger);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);

  const update = (updates: Partial<MapTrigger>) => updateTrigger(trigger.id, updates);

  const typeInfo = TRIGGER_TYPES.find((t) => t.value === trigger.type);

  return (
    <VStack align="stretch" spacing={5}>
      {/* Identity */}
      <VStack align="stretch" spacing={3}>
        <FormControl>
          <FieldLabel>ID</FieldLabel>
          <Input
            size="xs"
            variant="filled"
            bg="#0a0a0b"
            value={trigger.id}
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
            placeholder="e.g. Cave Entrance"
            value={trigger.label ?? ''}
            onChange={(e) => update({ label: e.target.value || undefined })}
            _hover={{ bg: '#071018' }}
          />
        </FormControl>
      </VStack>

      <Divider borderColor="#071018" />

      {/* Type */}
      <VStack align="stretch" spacing={3}>
        <SectionLabel>Type</SectionLabel>

        <FormControl>
          <FieldLabel>Trigger Type</FieldLabel>
          <Select
            size="xs"
            value={trigger.type}
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            onChange={(e) => update({ type: e.target.value as TriggerType })}
          >
            {TRIGGER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {typeInfo && (
            <Text fontSize="10px" color="gray.500" mt={1}>
              {typeInfo.description}
            </Text>
          )}
        </FormControl>
      </VStack>

      <Divider borderColor="#071018" />

      {/* Shape */}
      <VStack align="stretch" spacing={3}>
        <SectionLabel>Shape</SectionLabel>

        <FormControl>
          <FieldLabel>Shape Type</FieldLabel>
          <Select
            size="xs"
            value={trigger.shape}
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            onChange={(e) => {
              const shape = e.target.value as TriggerShape;
              if (shape === 'rectangle') {
                update({ shape, size: [projectTileSize, projectTileSize], points: undefined });
              } else {
                // Convert rectangle corners to polygon vertices
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
              }
            }}
          >
            <option value="rectangle">Rectangle</option>
            <option value="polygon">Polygon</option>
          </Select>
        </FormControl>

        <FormControl>
          <FieldLabel>Position (px)</FieldLabel>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              X
            </Text>
            <NumberInput
              size="xs"
              value={trigger.position[0]}
              precision={0}
              onChange={(_, v) => {
                if (!isNaN(v)) update({ position: [Math.round(v), trigger.position[1]] });
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
              value={trigger.position[1]}
              precision={0}
              onChange={(_, v) => {
                if (!isNaN(v)) update({ position: [trigger.position[0], Math.round(v)] });
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

        {trigger.shape === 'rectangle' && (
          <FormControl>
            <FieldLabel>Size (px)</FieldLabel>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                W
              </Text>
              <NumberInput
                size="xs"
                value={trigger.size?.[0] ?? projectTileSize}
                min={1}
                precision={0}
                onChange={(_, v) => {
                  if (!isNaN(v))
                    update({
                      size: [Math.max(1, Math.round(v)), trigger.size?.[1] ?? projectTileSize],
                    });
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
                value={trigger.size?.[1] ?? projectTileSize}
                min={1}
                precision={0}
                onChange={(_, v) => {
                  if (!isNaN(v))
                    update({
                      size: [trigger.size?.[0] ?? projectTileSize, Math.max(1, Math.round(v))],
                    });
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
        )}

        {trigger.shape === 'polygon' && trigger.points && (
          <VStack align="stretch" spacing={2}>
            <FieldLabel>Vertices ({trigger.points.length})</FieldLabel>
            <Text fontSize="10px" color="gray.500">
              Drag vertices on the canvas to reposition them.
            </Text>
            {trigger.points.map(([px, py], i) => (
              <HStack key={i} spacing={2}>
                <Badge fontSize="9px" colorScheme="purple" flexShrink={0}>
                  {i}
                </Badge>
                <Text fontSize="10px" color="gray.400" fontFamily="mono">
                  ({px}, {py})
                </Text>
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
};

export const TriggerInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const selectedTriggerId = useEditorStore((s) => s.selectedTriggerId);

  const trigger = currentMap?.spatialPrimitives?.triggers?.find((t) => t.id === selectedTriggerId);

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
