import React from 'react';
import {
  VStack,
  HStack,
  FormControl,
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
import { PropertyDefinition, PropertyValue } from '../../types/schema';
import { FormLabel } from './FormLabel';

export type PropertyType =
  | 'string'
  | 'int'
  | 'float'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'vector2'
  | 'custom';

export interface PropertySchema {
  key: string;
  label: string;
  type: PropertyType;
  description?: string;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
  // Optional custom renderer for complex fields. Receives current value and an onChange callback.
  customRenderer?: (value: PropertyValue, onChange: (v: PropertyValue) => void) => React.ReactNode;
}

/**
 * Convert a PropertyDefinition array (from schema.ts) into PropertySchema[] for use with PropertyForm.
 * This is the single canonical mapping — all callers should use this instead of rolling their own.
 */
export function propertyDefinitionsToSchema(definitions: PropertyDefinition[]): PropertySchema[] {
  return definitions.map((d) => {
    const common: Pick<PropertySchema, 'key' | 'label' | 'description'> = {
      key: d.key,
      label: d.label,
      description: d.description,
    };

    switch (d.type) {
      case 'int':
        return {
          ...common,
          type: 'int',
          constraints: {
            min: d.constraints?.min,
            max: d.constraints?.max,
          },
        };
      case 'float':
      case 'number':
        return {
          ...common,
          type: 'float',
          constraints: {
            min: d.constraints?.min,
            max: d.constraints?.max,
            step: 0.01,
          },
        };
      case 'boolean':
        return { ...common, type: 'boolean' };
      case 'enum':
        return {
          ...common,
          type: 'enum',
          constraints: { options: d.constraints?.options ?? [] },
        };
      case 'color':
        return { ...common, type: 'color' };
      case 'vector2':
        return { ...common, type: 'vector2' };
      case 'string':
      default:
        return { ...common, type: 'string' };
    }
  });
}

interface PropertyFormProps {
  schema: PropertySchema[];
  values: Record<string, PropertyValue>;
  onChange: (key: string, value: PropertyValue) => void;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({ schema, values, onChange }) => {
  const [localValues, setLocalValues] = React.useState<Record<string, string>>({});
  const focusedRef = React.useRef<Record<string, boolean>>({});

  // Sync incoming values into localValues when not focused
  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const prop of schema) {
      if (focusedRef.current[prop.key]) continue;
      const rawVal = values[prop.key];
      const v =
        rawVal !== undefined
          ? rawVal
          : prop.type === 'float' || prop.type === 'int'
            ? 0
            : prop.type === 'boolean'
              ? false
              : '';
      next[prop.key] = String(v);
    }
    setLocalValues((prev) => ({ ...prev, ...next }));
  }, [schema, values]);

  const numericRegex = /^-?\d+(?:\.\d+)?$/;

  const commitNumeric = (key: string, integer: boolean) => {
    const str = localValues[key] ?? '';
    if (numericRegex.test(str)) {
      const n = parseFloat(str);
      onChange(key, integer ? Math.round(n) : n);
    } else {
      const n = parseFloat(str);
      onChange(key, isNaN(n) ? (integer ? 0 : 0) : integer ? Math.round(n) : n);
    }
  };

  return (
    <VStack align="stretch" spacing={5} px={2}>
      {schema.map((prop) => {
        const rawVal = values[prop.key];
        const currentValue =
          rawVal !== undefined
            ? rawVal
            : prop.type === 'float' || prop.type === 'int'
              ? 0
              : prop.type === 'boolean'
                ? false
                : '';
        const localVal = localValues[prop.key] ?? String(currentValue);

        return (
          <FormControl key={prop.key}>
            <FormLabel>{prop.label}</FormLabel>

            <Box>
              {prop.type === 'string' && (
                <Input
                  value={localVal}
                  onChange={(e) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: e.target.value }));
                    onChange(prop.key, e.target.value);
                  }}
                  onFocus={() => {
                    focusedRef.current[prop.key] = true;
                  }}
                  onBlur={() => {
                    focusedRef.current[prop.key] = false;
                  }}
                />
              )}

              {prop.type === 'int' && (
                <NumberInput
                  value={localVal}
                  min={prop.constraints?.min}
                  max={prop.constraints?.max}
                  step={1}
                  precision={0}
                  onChange={(str) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: str }));
                    if (numericRegex.test(str)) onChange(prop.key, Math.round(parseFloat(str)));
                  }}
                  onFocus={() => {
                    focusedRef.current[prop.key] = true;
                  }}
                  onBlur={() => {
                    focusedRef.current[prop.key] = false;
                    commitNumeric(prop.key, true);
                  }}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}

              {prop.type === 'float' && (
                <NumberInput
                  value={localVal}
                  min={prop.constraints?.min}
                  max={prop.constraints?.max}
                  step={prop.constraints?.step ?? 0.01}
                  onChange={(str) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: str }));
                    if (numericRegex.test(str)) onChange(prop.key, parseFloat(str));
                  }}
                  onFocus={() => {
                    focusedRef.current[prop.key] = true;
                  }}
                  onBlur={() => {
                    focusedRef.current[prop.key] = false;
                    commitNumeric(prop.key, false);
                  }}
                >
                  <NumberInputField />
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
                  value={localVal}
                  onChange={(e) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: e.target.value }));
                    onChange(prop.key, e.target.value);
                  }}
                >
                  {(prop.constraints?.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              )}

              {prop.type === 'color' && (
                <Input
                  type="color"
                  value={localVal}
                  onChange={(e) => {
                    setLocalValues((prev) => ({ ...prev, [prop.key]: e.target.value }));
                    onChange(prop.key, e.target.value);
                  }}
                />
              )}

              {prop.type === 'vector2' && (
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.400" flexShrink={0}>
                    X
                  </Text>
                  <NumberInput
                    value={
                      Array.isArray(currentValue)
                        ? String(currentValue[0] ?? 0)
                        : (localValues[`${prop.key}.__x`] ?? '0')
                    }
                    step={0.01}
                    onChange={(str) => {
                      setLocalValues((prev) => ({ ...prev, [`${prop.key}.__x`]: str }));
                      const x = parseFloat(str);
                      const y = Array.isArray(currentValue)
                        ? ((currentValue[1] as number) ?? 0)
                        : parseFloat(localValues[`${prop.key}.__y`] ?? '0') || 0;
                      if (!isNaN(x)) onChange(prop.key, [x, y]);
                    }}
                    flex={1}
                  >
                    <NumberInputField />
                  </NumberInput>
                  <Text fontSize="xs" color="gray.400" flexShrink={0}>
                    Y
                  </Text>
                  <NumberInput
                    value={
                      Array.isArray(currentValue)
                        ? String(currentValue[1] ?? 0)
                        : (localValues[`${prop.key}.__y`] ?? '0')
                    }
                    step={0.01}
                    onChange={(str) => {
                      setLocalValues((prev) => ({ ...prev, [`${prop.key}.__y`]: str }));
                      const x = Array.isArray(currentValue)
                        ? ((currentValue[0] as number) ?? 0)
                        : parseFloat(localValues[`${prop.key}.__x`] ?? '0') || 0;
                      const y = parseFloat(str);
                      if (!isNaN(y)) onChange(prop.key, [x, y]);
                    }}
                    flex={1}
                  >
                    <NumberInputField />
                  </NumberInput>
                </HStack>
              )}

              {prop.type === 'custom' && prop.customRenderer && (
                <Box>
                  {prop.customRenderer(localVal, (v) => {
                    setLocalValues((prev) => ({
                      ...prev,
                      [prop.key]: String(v),
                    }));
                    onChange(prop.key, v);
                  })}
                </Box>
              )}
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

export default PropertyForm;
