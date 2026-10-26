import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  HStack,
  NumberInput,
  NumberInputField,
  Radio,
  RadioGroup,
  Text,
  Select,
  VStack,
} from '@chakra-ui/react';
import {
  isMapPosition,
  isAnchorPosition,
  type PositionArgument,
  type PlacementMode,
} from '../../lib/mapPosition';

export const MapPositionField: React.FC<{
  value: unknown;
  modes: PlacementMode[];
  anchors: { id: string; label: string }[];
  isPicking: boolean;
  onChange: (value: PositionArgument | '') => void;
  onPick: (mode: PlacementMode) => void;
  onModeChange: (mode: PlacementMode) => void;
  onCancel: () => void;
}> = ({ value, modes, anchors, isPicking, onChange, onPick, onModeChange, onCancel }) => {
  const [mode, setMode] = useState<PlacementMode>(isAnchorPosition(value) ? 'anchor' : modes[0]);
  const [draft, setDraft] = useState({
    x: isMapPosition(value) ? String(value.x) : '',
    y: isMapPosition(value) ? String(value.y) : '',
  });
  const lastEmitted = useRef(JSON.stringify(value));
  const previousValue = useRef(value);
  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized !== lastEmitted.current) {
      if (isAnchorPosition(value)) setMode('anchor');
      else if (isAnchorPosition(previousValue.current))
        setMode((current) => (current === 'anchor' ? modes[0] : current));
      setDraft({
        x: isMapPosition(value) ? String(value.x) : '',
        y: isMapPosition(value) ? String(value.y) : '',
      });
    }
    lastEmitted.current = serialized;
    previousValue.current = value;
  }, [value, modes]);
  const activeMode = modes.includes(mode) ? mode : modes[0];
  const change = (axis: 'x' | 'y', text: string) => {
    const next = { ...draft, [axis]: text };
    setDraft(next);
    const position = { x: Number(next.x), y: Number(next.y) };
    const output = next.x.trim() && next.y.trim() && isMapPosition(position) ? position : '';
    lastEmitted.current = JSON.stringify(output);
    onChange(output);
  };
  return (
    <VStack align="stretch" spacing={2}>
      <RadioGroup
        aria-label="Placement mode"
        value={activeMode}
        onChange={(value) => {
          const next = value as PlacementMode;
          setMode(next);
          onModeChange(next);
        }}
      >
        <HStack>
          {modes.map((value) => (
            <Radio key={value} value={value} size="sm">
              {value === 'tile' ? 'Grid' : value === 'pixel' ? 'Pixel' : 'Anchor'}
            </Radio>
          ))}
        </HStack>
      </RadioGroup>
      {activeMode === 'anchor' ? (
        <Select
          aria-label="Position anchor"
          placeholder="Choose map anchor"
          value={isAnchorPosition(value) ? value.anchor : ''}
          onChange={(e) => onChange(e.target.value ? { anchor: e.target.value } : '')}
        >
          {isAnchorPosition(value) && !anchors.some((a) => a.id === value.anchor) && (
            <option value={value.anchor}>Missing anchor: {value.anchor}</option>
          )}
          {anchors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      ) : (
        <>
          <HStack>
            {(['x', 'y'] as const).map((axis) => (
              <NumberInput
                key={axis}
                value={draft[axis]}
                min={0}
                precision={0}
                onChange={(text) => change(axis, text)}
              >
                <NumberInputField aria-label={`Position ${axis.toUpperCase()}`} />
              </NumberInput>
            ))}
          </HStack>
          <HStack>
            <Button size="xs" variant="outline" onClick={() => onPick(activeMode)}>
              {isPicking ? 'Picking on map…' : 'Pick on map'}
            </Button>
            {isPicking && (
              <Button size="xs" variant="ghost" onClick={onCancel}>
                Cancel placement
              </Button>
            )}
          </HStack>
        </>
      )}
      <Text textStyle="helperText">
        Map pixels from top left. The point marks the character’s feet.
      </Text>
    </VStack>
  );
};
