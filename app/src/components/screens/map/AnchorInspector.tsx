import React from 'react';
import {
  Button,
  FormControl,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  Text,
  VStack,
  Wrap,
} from '@chakra-ui/react';
import { FiMapPin } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorEmptyState, InspectorPanel } from '../common';
import { FieldLabel, SectionLabel } from '../../common/Typography.tsx';

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

  return (
    <InspectorPanel title="Anchor">
      <VStack align="stretch" spacing={5}>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FieldLabel>ID</FieldLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              value={anchor.id}
              isReadOnly
              fontFamily="mono"
              color="gray.500"
              _hover={{ bg: '#071018' }}
            />
          </FormControl>

          <FormControl>
            <FieldLabel>Name</FieldLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              color="white"
              value={anchor.name}
              onChange={(event) => updateAnchor(anchor.id, { name: event.target.value })}
              _hover={{ bg: '#071018' }}
            />
          </FormControl>
        </VStack>

        <VStack align="stretch" spacing={3}>
          <SectionLabel textStyle="fieldLabel">Position</SectionLabel>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              X
            </Text>
            <NumberInput
              size="xs"
              value={anchor.position[0]}
              precision={0}
              min={0}
              onChange={(_, value) => {
                if (!isNaN(value))
                  updateAnchor(anchor.id, { position: [Math.round(value), anchor.position[1]] });
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
              value={anchor.position[1]}
              precision={0}
              min={0}
              onChange={(_, value) => {
                if (!isNaN(value))
                  updateAnchor(anchor.id, { position: [anchor.position[0], Math.round(value)] });
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
        </VStack>

        <VStack align="stretch" spacing={3}>
          <SectionLabel textStyle="fieldLabel">Facing</SectionLabel>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              X
            </Text>
            <NumberInput
              size="xs"
              value={facing[0]}
              step={0.1}
              precision={2}
              onChange={(_, value) => {
                if (!isNaN(value)) updateAnchor(anchor.id, { facing: [value, facing[1]] });
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
              value={facing[1]}
              step={0.1}
              precision={2}
              onChange={(_, value) => {
                if (!isNaN(value)) updateAnchor(anchor.id, { facing: [facing[0], value] });
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
        </VStack>
      </VStack>
    </InspectorPanel>
  );
};

export default AnchorInspector;
