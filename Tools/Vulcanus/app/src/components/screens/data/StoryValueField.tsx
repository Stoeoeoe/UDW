import React, { useEffect, useState } from 'react';
import { Button, Input, Select, Switch, Text, Textarea, VStack } from '@chakra-ui/react';
import {
  defaultStoryValue,
  matchesStoryType,
  storyDataSchema,
  type StoryData,
} from '../../../lib/storyValues';
import type { StoryValueDefinition } from '../../../types/schema';

const inferType = (value: unknown): StoryValueDefinition['type'] =>
  typeof value === 'number'
    ? 'double'
    : typeof value === 'boolean'
      ? 'boolean'
      : value !== null && typeof value === 'object'
        ? 'object'
        : 'string';

/** Edits the same plain value kinds accepted by GameState.Story.Set. */
export const StoryValueField: React.FC<{
  value: unknown;
  onChange: (value: StoryData) => void;
  declaredType?: StoryValueDefinition['type'];
  declarationKey?: string;
  onDeclare?: (type: StoryValueDefinition['type']) => void;
}> = ({ value, onChange, declaredType, declarationKey, onDeclare }) => {
  const [chosenType, setChosenType] = useState(() => inferType(value));
  const valueType = declaredType ?? chosenType;
  const type = valueType === 'long' || valueType === 'double' ? 'number' : valueType;
  const mismatch = declaredType !== undefined && !matchesStoryType(value, declaredType);
  const [json, setJson] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState('');
  const [numberText, setNumberText] = useState(() =>
    typeof value === 'number' ? String(value) : '0',
  );
  useEffect(() => {
    setChosenType((chosen) => (matchesStoryType(value, chosen) ? chosen : inferType(value)));
    if (typeof value === 'number')
      setNumberText((text) => (Number(text) === value ? text : String(value)));
    if (typeof value === 'object') setJson(JSON.stringify(value, null, 2));
  }, [value]);
  return (
    <VStack align="stretch" spacing={2}>
      {declaredType ? (
        <Text fontSize="xs">Type: {declaredType}</Text>
      ) : (
        <Select
          aria-label="Story value type"
          value={valueType === 'double' ? 'number' : valueType}
          onChange={(event) => {
            const selected =
              event.target.value === 'number'
                ? 'double'
                : (event.target.value as StoryValueDefinition['type']);
            setChosenType(selected);
            const next = defaultStoryValue(selected);
            setJson(JSON.stringify(next, null, 2));
            setNumberText('0');
            setError('');
            onChange(next);
          }}
        >
          <option value="boolean">Boolean</option>
          <option value="string">String</option>
          <option value="number">Number (double)</option>
          <option value="long">Integer (long)</option>
          <option value="object">Object / dictionary</option>
        </Select>
      )}
      {type === 'boolean' ? (
        <Switch
          aria-label="Story boolean value"
          isChecked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : type === 'object' ? (
        <Textarea
          aria-label="Story object value"
          fontFamily="mono"
          value={json}
          onChange={(event) => {
            setJson(event.target.value);
            try {
              const parsed = storyDataSchema.parse(JSON.parse(event.target.value));
              if (typeof parsed !== 'object') throw new Error('Enter a JSON object.');
              onChange(parsed);
              setError('');
            } catch {
              setError(
                'Enter a JSON object with string keys and plain story values. The last valid value is retained.',
              );
            }
          }}
        />
      ) : (
        <Input
          aria-label="Story value"
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={type === 'number' ? numberText : typeof value === 'string' ? value : ''}
          onChange={(event) => {
            if (type === 'string') onChange(event.target.value);
            else {
              setNumberText(event.target.value);
              const parsed = storyDataSchema.safeParse(
                event.target.value === '' ? null : Number(event.target.value),
              );
              if (parsed.success && matchesStoryType(parsed.data, valueType)) {
                onChange(parsed.data);
                setError('');
              } else
                setError(
                  valueType === 'long'
                    ? 'Enter a whole integer within Lua’s exact integer range.'
                    : 'Enter a finite number; integers must fit Lua’s exact integer range.',
                );
            }
          }}
        />
      )}
      {mismatch && (
        <>
          <Text color="red.300" fontSize="xs">
            This action value does not match its declared {declaredType} type.
          </Text>
          <Button
            size="xs"
            onClick={() => {
              setError('');
              onChange(defaultStoryValue(declaredType!));
            }}
          >
            Use {declaredType} value
          </Button>
        </>
      )}
      {!declaredType && onDeclare && (
        <Button size="xs" onClick={() => onDeclare(valueType)}>
          Add "{declarationKey}" to Data
        </Button>
      )}
      {error && (
        <Text color="red.300" fontSize="xs">
          {error}
        </Text>
      )}
    </VStack>
  );
};
