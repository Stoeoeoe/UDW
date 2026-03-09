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

/**
 * PropertyForm - A schema-driven form for editing key/value properties.
 * Supports string, number, boolean, enum, and custom renderers.
 */
export const PropertyForm: React.FC<PropertyFormProps> = ({ schema, values, onChange }) => {
  const [localValues, setLocalValues] = React.useState<Record<string, string>>({});
  const focusedRef = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const prop of schema) {
      if (focusedRef.current[prop.key]) continue;
      const rawVal = values[prop.key];
      const v = rawVal !== undefined ? rawVal : (prop.type === 'number' ? 0 : prop.type === 'boolean' ? false : '');
      next[prop.key] = String(v);
    }
    setLocalValues((prev) => ({ ...prev, ...next }));
  }, [schema, values]);

  const numericRegex = /^-?\d+(?:\.\d+)?$/;

  const commitValue = (key: string) => {
    const str = localValues[key] ?? '';
    if (numericRegex.test(str)) {
      onChange(key, parseFloat(str));
    } else {
      const n = parseFloat(str);
      onChange(key, isNaN(n) ? str : n);
    }
  };

  return (
    <VStack align="stretch" spacing={5} px={2}>
      {schema.map((prop) => {
        const rawVal = values[prop.key];
        const currentValue = rawVal !== undefined ? rawVal : (prop.type === 'number' ? 0 : prop.type === 'boolean' ? false : '');
        const localVal = localValues[prop.key] ?? String(currentValue);

        return (
          <FormControl key={prop.key}>
            <FormLabel fontSize="10px" color="gray.400" mb={2} textTransform="uppercase" letterSpacing="wide">
              {prop.label}
            </FormLabel>

            <Box>
              {prop.type === 'string' && (
                <Input
                  size="sm"
                  bg="editor.inputBg"
                  borderColor="editor.inputBorder"
                  _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 2px rgba(66,153,225,0.6)' }}
                  color="white"
                  value={localVal}
                  onChange={(e) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: e.target.value }));
                    onChange(prop.key, e.target.value);
                  }}
                  onFocus={() => { focusedRef.current[prop.key] = true; }}
                  onBlur={() => { focusedRef.current[prop.key] = false; commitValue(prop.key); }}
                />
              )}

              {prop.type === 'number' && (
                <NumberInput
                  size="sm"
                  value={localVal}
                  min={prop.constraints?.min}
                  max={prop.constraints?.max}
                  step={prop.constraints?.step ?? 0.01}
                  onChange={(str) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: str }));
                    if (numericRegex.test(str)) {
                      onChange(prop.key, parseFloat(str));
                    }
                  }}
                  onFocus={() => { focusedRef.current[prop.key] = true; }}
                  onBlur={() => { focusedRef.current[prop.key] = false; commitValue(prop.key); }}
                >
                  <NumberInputField bg="editor.inputBg" borderColor="editor.inputBorder" color="white" />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}

              {prop.type === 'boolean' && (
                <Switch
                  colorScheme="blue"
                  isChecked={!!currentValue}
                  onChange={(e) => onChange(prop.key, e.target.checked)}
                />
              )}

              {prop.type === 'enum' && (
                <Select
                  size="sm"
                  bg="editor.inputBg"
                  borderColor="editor.inputBorder"
                  color="white"
                  value={localVal}
                  onChange={(e) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: e.target.value }));
                    onChange(prop.key, e.target.value);
                  }}
                >
                  {(prop.constraints?.options || []).map((opt) => (
                    <option key={opt} value={opt} style={{ background: '#05060a', color: '#fff' }}>{opt}</option>
                  ))}
                </Select>
              )}

              {prop.type === 'custom' && prop.customRenderer && (
                <Box>
                  {prop.customRenderer(localVal, (v) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: String(v) }));
                    onChange(prop.key, v);
                  })}
                </Box>
              )}
            </Box>

            {prop.description && <Text fontSize="9px" color="gray.500" mt={2}>{prop.description}</Text>}
          </FormControl>
        );
      })}
    </VStack>
  );
};
