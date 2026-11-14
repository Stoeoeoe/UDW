import React, { useState } from 'react';
import { Box, Button, HStack, IconButton, Text, VStack } from '@chakra-ui/react';
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon } from '@chakra-ui/icons';
import { MapPositionField } from './MapPositionField';
import {
  isAnchorPosition,
  isMapPosition,
  type PathArgument,
  type PlacementMode,
} from '../../lib/mapPosition';

/** Ordered waypoints use the same position contract and picker as placement actions. */
export const MapPathField: React.FC<{
  value: unknown;
  modes: PlacementMode[];
  anchors: { id: string; label: string }[];
  pickingIndex?: number;
  onChange: (path: PathArgument) => void;
  onPick: (index: number, mode: PlacementMode) => void;
  onModeChange: (mode: PlacementMode) => void;
  onCancel: () => void;
}> = ({ value, modes, anchors, pickingIndex, onChange, onPick, onModeChange, onCancel }) => {
  const path: PathArgument = Array.isArray(value) ? value : [];
  const [selected, setSelected] = useState<number | null>(null);
  const replace = (index: number, point: PathArgument[number]) =>
    onChange(path.map((p, i) => (i === index ? point : p)));
  const move = (index: number, offset: number) => {
    const next = [...path];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onCancel();
    onChange(next);
    setSelected(index + offset);
  };
  return (
    <VStack align="stretch" spacing={2}>
      <Text textStyle="helperText">
        Waypoints are visited in order. Select a point to edit its position.
      </Text>
      {path.map((point, index) => (
        <Box key={index} borderWidth="1px" borderColor="editorBorderSubtle" borderRadius="md" p={2}>
          <HStack>
            <Button
              size="xs"
              variant="ghost"
              flex={1}
              justifyContent="start"
              onClick={() => {
                onCancel();
                setSelected(selected === index ? null : index);
              }}
            >
              {index + 1}.{' '}
              {isAnchorPosition(point)
                ? anchors.find((a) => a.id === point.anchor)?.label ||
                  `Missing anchor: ${point.anchor}`
                : isMapPosition(point)
                  ? `(${point.x}, ${point.y})`
                  : 'Choose position'}
            </Button>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={`Move waypoint ${index + 1} up`}
              icon={<ArrowUpIcon />}
              isDisabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={`Move waypoint ${index + 1} down`}
              icon={<ArrowDownIcon />}
              isDisabled={index === path.length - 1}
              onClick={() => move(index, 1)}
            />
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={`Remove waypoint ${index + 1}`}
              icon={<DeleteIcon />}
              onClick={() => {
                onCancel();
                onChange(path.filter((_, i) => i !== index));
                setSelected(null);
              }}
            />
          </HStack>
          {selected === index && (
            <Box pt={2}>
              <MapPositionField
                value={point}
                modes={modes}
                anchors={anchors}
                isPicking={pickingIndex === index}
                onChange={(value) => replace(index, value)}
                onPick={(mode) => onPick(index, mode)}
                onModeChange={onModeChange}
                onCancel={onCancel}
              />
            </Box>
          )}
        </Box>
      ))}
      <Button
        size="xs"
        variant="outline"
        onClick={() => {
          onCancel();
          setSelected(path.length);
          onChange([...path, '']);
        }}
      >
        Add waypoint
      </Button>
    </VStack>
  );
};
