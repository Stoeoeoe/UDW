import React from 'react';
import {
  VStack,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Select,
  Text,
  Box,
} from '@chakra-ui/react';
import type { PropertySchema } from '../types';

export interface PropertyFormProps {
  schema: PropertySchema[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({
  schema,
  values,
  onChange,
}) => {
  const [localValues, setLocalValues] = React.useState<Record<string, string>>(
    {},
  );
  const focusedRef = React.useRef<Record<string, boolean>>({});
  const numericRegex = /^-?\d+(?:\.\d+)?$/;

  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const prop of schema) {
      if (focusedRef.current[prop.key]) continue;
      const raw = values[prop.key];
      next[prop.key] = String(
        raw !== undefined
          ? raw
          : prop.type === 'number'
            ? 0
            : prop.type === 'boolean'
              ? false
              : '',
      );
    }
    setLocalValues((prev) => ({ ...prev, ...next }));
  }, [schema, values]);

  const commit = (key: string) => {
    const s = localValues[key] ?? '';
    onChange(
      key,
      numericRegex.test(s)
        ? parseFloat(s)
        : isNaN(parseFloat(s))
          ? s
          : parseFloat(s),
    );
  };

  return (
    <VStack align="stretch" spacing={5} px={2}>
      {schema.map((prop) => {
        const raw = values[prop.key];
        const cur =
          raw !== undefined
            ? raw
            : prop.type === 'number'
              ? 0
              : prop.type === 'boolean'
                ? false
                : '';
        const local = localValues[prop.key] ?? String(cur);
        return (
          <FormControl key={prop.key}>
            <FormLabel
              fontSize="10px"
              color="gray.400"
              mb={2}
              textTransform="uppercase"
              letterSpacing="wide"
            >
              {prop.label}
            </FormLabel>
            <Box>
              {prop.type === 'string' && (
                <Input
                  size="sm"
                  bg="editor.inputBg"
                  borderColor="editor.inputBorder"
                  color="white"
                  value={local}
                  onChange={(e) => {
                    setLocalValues((p) => ({
                      ...p,
                      [prop.key]: e.target.value,
                    }));
                    onChange(prop.key, e.target.value);
                  }}
                  onFocus={() => {
                    focusedRef.current[prop.key] = true;
                  }}
                  onBlur={() => {
                    focusedRef.current[prop.key] = false;
                    commit(prop.key);
                  }}
                />
              )}
              {prop.type === 'number' && (
                <NumberInput
                  size="sm"
                  value={local}
                  min={prop.constraints?.min}
                  max={prop.constraints?.max}
                  step={prop.constraints?.step ?? 0.01}
                  onChange={(s) => {
                    setLocalValues((p) => ({ ...p, [prop.key]: s }));
                    if (numericRegex.test(s)) onChange(prop.key, parseFloat(s));
                  }}
                  onFocus={() => {
                    focusedRef.current[prop.key] = true;
                  }}
                  onBlur={() => {
                    focusedRef.current[prop.key] = false;
                    commit(prop.key);
                  }}
                >
                  <NumberInputField
                    bg="editor.inputBg"
                    borderColor="editor.inputBorder"
                    color="white"
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}
              {prop.type === 'boolean' && (
                <Switch
                  colorScheme="blue"
                  isChecked={!!cur}
                  onChange={(e) => onChange(prop.key, e.target.checked)}
                />
              )}
              {prop.type === 'enum' && (
                <Select
                  size="sm"
                  bg="editor.inputBg"
                  borderColor="editor.inputBorder"
                  color="white"
                  value={local}
                  onChange={(e) => {
                    setLocalValues((p) => ({
                      ...p,
                      [prop.key]: e.target.value,
                    }));
                    onChange(prop.key, e.target.value);
                  }}
                >
                  {(prop.constraints?.options || []).map((o) => (
                    <option
                      key={o}
                      value={o}
                      style={{ background: '#05060a', color: '#fff' }}
                    >
                      {o}
                    </option>
                  ))}
                </Select>
              )}
              {prop.type === 'custom' &&
                prop.customRenderer?.(local, (v) => {
                  setLocalValues((p) => ({ ...p, [prop.key]: String(v) }));
                  onChange(prop.key, v);
                })}
            </Box>
            {prop.description && (
              <Text fontSize="9px" color="gray.500" mt={2}>
                {prop.description}
              </Text>
            )}
          </FormControl>
        );
      })}
    </VStack>
  );
};
