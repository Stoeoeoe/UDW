import React from 'react';
import { Button, Checkbox, Wrap } from '@chakra-ui/react';
import { FiMapPin } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { DEBUG_SPAWN_POINT_TAG } from '../../../lib/debugSpawn';
import { InspectorEmptyState, InspectorPanel } from '../common';
import {
  CompactInput,
  Field,
  FieldStack,
  InlineNumberPair,
  InspectorSection,
  ReadOnlyIdField,
} from '../../common/Fields';

const FACING_PRESETS: Array<{ label: string; value: [number, number] }> = [
  { label: 'Up', value: [0, -1] },
  { label: 'Down', value: [0, 1] },
  { label: 'Left', value: [-1, 0] },
  { label: 'Right', value: [1, 0] },
];

export const AnchorInspector: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const selectedAnchorId = useEditorStore((state) => state.selectedAnchorId);
  const updateAnchor = useEditorStore((state) => state.updateAnchor);

  const anchor = currentMap?.spatialPrimitives?.anchors?.find(
    (item) => item.id === selectedAnchorId,
  );

  if (!anchor || !currentMap) {
    return (
      <InspectorPanel title="Anchor">
        <InspectorEmptyState
          icon={FiMapPin}
          message="No Anchor Selected"
          hint="Select an anchor on the map or in the Anchors panel"
        />
      </InspectorPanel>
    );
  }

  const facing = anchor.facing ?? [0, 1];
  const isDebugSpawn = anchor.tags.includes(DEBUG_SPAWN_POINT_TAG);

  // A map has a single debug spawn point: enabling it here clears it from other anchors.
  const setDebugSpawn = (enabled: boolean) => {
    if (enabled) {
      for (const other of currentMap.spatialPrimitives?.anchors ?? []) {
        if (other.id !== anchor.id && other.tags.includes(DEBUG_SPAWN_POINT_TAG)) {
          updateAnchor(other.id, {
            tags: other.tags.filter((tag) => tag !== DEBUG_SPAWN_POINT_TAG),
          });
        }
      }
    }
    updateAnchor(anchor.id, {
      tags: enabled
        ? [...anchor.tags, DEBUG_SPAWN_POINT_TAG]
        : anchor.tags.filter((tag) => tag !== DEBUG_SPAWN_POINT_TAG),
    });
  };

  return (
    <InspectorPanel title="Anchor">
      <FieldStack spacing={5}>
        <InspectorSection>
          <FieldStack>
            <Field label="ID">
              <ReadOnlyIdField value={anchor.id} />
            </Field>

            <Field label="Name">
              <CompactInput
                value={anchor.name}
                onChange={(event) => updateAnchor(anchor.id, { name: event.target.value })}
              />
            </Field>
          </FieldStack>
        </InspectorSection>

        <InspectorSection title="Debug">
          <Checkbox
            size="sm"
            isChecked={isDebugSpawn}
            onChange={(event) => setDebugSpawn(event.target.checked)}
          >
            Debug spawn point
          </Checkbox>
        </InspectorSection>

        <InspectorSection title="Position">
          <InlineNumberPair
            labels={['X', 'Y']}
            values={[anchor.position[0], anchor.position[1]]}
            min={0}
            onChange={(position) => updateAnchor(anchor.id, { position })}
          />
        </InspectorSection>

        <InspectorSection title="Facing">
          <FieldStack>
            <InlineNumberPair
              labels={['X', 'Y']}
              values={[facing[0], facing[1]]}
              precision={2}
              step={0.1}
              onChange={(nextFacing) => updateAnchor(anchor.id, { facing: nextFacing })}
            />
            <Wrap spacing={1}>
              {FACING_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="xs"
                  variant="outline"
                  colorScheme="cyan"
                  onClick={() => updateAnchor(anchor.id, { facing: preset.value })}
                >
                  {preset.label}
                </Button>
              ))}
            </Wrap>
          </FieldStack>
        </InspectorSection>
      </FieldStack>
    </InspectorPanel>
  );
};

export default AnchorInspector;
