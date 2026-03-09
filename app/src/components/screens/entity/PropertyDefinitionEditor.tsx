import React, { useState, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  Switch,
  IconButton,
  Flex,
  Badge,
  Tooltip,
  Collapse,
  Button,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import {
  AddIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { PropertyDefinition, PropertyType } from '../../../types/schema';

const PROPERTY_TYPES: { value: PropertyType; label: string; icon: string }[] = [
  { value: 'string', label: 'String', icon: 'Aa' },
  { value: 'int', label: 'Integer', icon: '#' },
  { value: 'float', label: 'Float', icon: '#.' },
  { value: 'boolean', label: 'Boolean', icon: '⊘' },
  { value: 'enum', label: 'Enum', icon: '☰' },
];

interface PropertyDefinitionEditorProps {
  properties: PropertyDefinition[];
  onChange: (properties: PropertyDefinition[]) => void;
}

/**
 * PropertyDefinitionEditor – Inline editor for an entity type's property schema.
 * Supports add/remove/reorder with per-property type controls.
 */
export const PropertyDefinitionEditor: React.FC<
  PropertyDefinitionEditorProps
> = ({ properties, onChange }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addProperty = useCallback(() => {
    const key = `prop_${Date.now()}`;
    const newProp: PropertyDefinition = {
      key,
      label: 'New Property',
      type: 'string',
      defaultValue: '',
      required: false,
    };
    onChange([...properties, newProp]);
    setExpandedId(key);
  }, [properties, onChange]);

  const updateProperty = useCallback(
    (key: string, updates: Partial<PropertyDefinition>) => {
      onChange(
        properties.map((p) => (p.key === key ? { ...p, ...updates } : p)),
      );
    },
    [properties, onChange],
  );

  const removeProperty = useCallback(
    (key: string) => {
      onChange(properties.filter((p) => p.key !== key));
      if (expandedId === key) setExpandedId(null);
    },
    [properties, onChange, expandedId],
  );

  const moveProperty = useCallback(
    (key: string, direction: -1 | 1) => {
      const idx = properties.findIndex((p) => p.key === key);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= properties.length) return;
      const reordered = [...properties];
      [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
      onChange(reordered);
    },
    [properties, onChange],
  );

  const getDefaultValueForType = (type: PropertyType): any => {
    switch (type) {
      case 'string':
        return '';
      case 'int':
        return 0;
      case 'float':
        return 0.0;
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'enum':
        return '';
      default:
        return '';
    }
  };

  return (
    <VStack spacing={0} align="stretch">
      {/* Header */}
      <Flex px={3} py={2} align="center" justify="space-between">
        <HStack spacing={2}>
          <Text
            fontSize="10px"
            fontWeight="black"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            Properties
          </Text>
          <Badge fontSize="9px" colorScheme="gray" variant="subtle">
            {properties.length}
          </Badge>
        </HStack>
        <Tooltip label="Add Property" hasArrow>
          <IconButton
            aria-label="Add Property"
            icon={<AddIcon fontSize="9px" />}
            size="xs"
            variant="ghost"
            color="gray.400"
            _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
            onClick={addProperty}
          />
        </Tooltip>
      </Flex>

      {/* Property list */}
      {properties.length === 0 && (
        <Box px={3} py={4} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No properties defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to add a configurable property
          </Text>
        </Box>
      )}

      {properties.map((prop, idx) => {
        const isExpanded = expandedId === prop.key;

        return (
          <Box key={prop.key} borderTop="1px" borderColor="whiteAlpha.50">
            {/* Collapsed row */}
            <HStack
              px={3}
              py={1.5}
              spacing={2}
              cursor="pointer"
              _hover={{ bg: 'whiteAlpha.50' }}
              onClick={() => setExpandedId(isExpanded ? null : prop.key)}
              role="group"
            >
              <Text fontSize="10px" color="gray.600" w="14px">
                {isExpanded ? '▾' : '▸'}
              </Text>
              <Text
                fontSize="xs"
                fontWeight="medium"
                color="gray.200"
                flex={1}
                noOfLines={1}
              >
                {prop.label}
              </Text>
              <Badge
                fontSize="9px"
                colorScheme={
                  prop.type === 'string'
                    ? 'green'
                    : prop.type === 'int' ||
                        prop.type === 'float' ||
                        prop.type === 'number'
                      ? 'blue'
                      : prop.type === 'boolean'
                        ? 'yellow'
                        : prop.type === 'enum'
                          ? 'purple'
                          : 'gray'
                }
                variant="subtle"
              >
                {prop.type}
              </Badge>
              {prop.required && (
                <Text fontSize="9px" color="red.400" fontWeight="bold">
                  *
                </Text>
              )}
              <IconButton
                aria-label="Delete Property"
                icon={<DeleteIcon fontSize="8px" />}
                size="xs"
                variant="ghost"
                color="gray.700"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                _hover={{ color: 'red.300', bg: 'red.900' }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeProperty(prop.key);
                }}
              />
            </HStack>

            {/* Expanded editor */}
            <Collapse in={isExpanded} animateOpacity>
              <Box px={3} pb={3} pt={1} bg="whiteAlpha.50">
                <VStack spacing={3} align="stretch">
                  {/* Label & Key */}
                  <HStack spacing={3}>
                    <Box flex={1}>
                      <Text
                        fontSize="9px"
                        color="gray.500"
                        mb={1}
                        fontWeight="bold"
                      >
                        LABEL
                      </Text>
                      <Input
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={prop.label}
                        onChange={(e) =>
                          updateProperty(prop.key, { label: e.target.value })
                        }
                      />
                    </Box>
                    <Box flex={1}>
                      <Text
                        fontSize="9px"
                        color="gray.500"
                        mb={1}
                        fontWeight="bold"
                      >
                        KEY
                      </Text>
                      <Input
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        fontFamily="mono"
                        value={prop.key}
                        onChange={(e) => {
                          const newKey = e.target.value.replace(
                            /[^a-zA-Z0-9_]/g,
                            '',
                          );
                          // Update key in the property
                          const updated = properties.map((p) =>
                            p.key === prop.key ? { ...p, key: newKey } : p,
                          );
                          onChange(updated);
                          // Keep expanded on the new key
                          setExpandedId(newKey);
                        }}
                      />
                    </Box>
                  </HStack>

                  {/* Type & Required */}
                  <HStack spacing={3}>
                    <Box flex={1}>
                      <Text
                        fontSize="9px"
                        color="gray.500"
                        mb={1}
                        fontWeight="bold"
                      >
                        TYPE
                      </Text>
                      <Select
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={prop.type}
                        onChange={(e) => {
                          const newType = e.target.value as PropertyType;
                          updateProperty(prop.key, {
                            type: newType,
                            defaultValue: getDefaultValueForType(newType),
                            constraints:
                              newType === 'enum'
                                ? { options: ['option1', 'option2'] }
                                : undefined,
                          });
                        }}
                      >
                        {PROPERTY_TYPES.map((t) => (
                          <option
                            key={t.value}
                            value={t.value}
                            style={{ background: '#0a0a0b' }}
                          >
                            {t.icon} {t.label}
                          </option>
                        ))}
                      </Select>
                    </Box>
                    <Box>
                      <Text
                        fontSize="9px"
                        color="gray.500"
                        mb={1}
                        fontWeight="bold"
                      >
                        REQUIRED
                      </Text>
                      <Switch
                        size="sm"
                        colorScheme="blue"
                        isChecked={prop.required}
                        onChange={(e) =>
                          updateProperty(prop.key, {
                            required: e.target.checked,
                          })
                        }
                      />
                    </Box>
                  </HStack>

                  {/* Default value */}
                  <Box>
                    <Text
                      fontSize="9px"
                      color="gray.500"
                      mb={1}
                      fontWeight="bold"
                    >
                      DEFAULT VALUE
                    </Text>
                    {prop.type === 'string' && (
                      <Input
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={prop.defaultValue ?? ''}
                        onChange={(e) =>
                          updateProperty(prop.key, {
                            defaultValue: e.target.value,
                          })
                        }
                      />
                    )}
                    {prop.type === 'int' && (
                      <NumberInput
                        size="xs"
                        value={prop.defaultValue ?? 0}
                        step={1}
                        precision={0}
                        onChange={(_, val) =>
                          updateProperty(prop.key, {
                            defaultValue: isNaN(val) ? 0 : Math.round(val),
                          })
                        }
                      >
                        <NumberInputField
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
                          color="white"
                        />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    )}
                    {(prop.type === 'float' || prop.type === 'number') && (
                      <NumberInput
                        size="xs"
                        value={prop.defaultValue ?? 0}
                        step={0.1}
                        precision={2}
                        onChange={(_, val) =>
                          updateProperty(prop.key, {
                            defaultValue: isNaN(val) ? 0 : val,
                          })
                        }
                      >
                        <NumberInputField
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
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
                        size="sm"
                        colorScheme="green"
                        isChecked={!!prop.defaultValue}
                        onChange={(e) =>
                          updateProperty(prop.key, {
                            defaultValue: e.target.checked,
                          })
                        }
                      />
                    )}
                    {prop.type === 'enum' && (
                      <Select
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={prop.defaultValue ?? ''}
                        onChange={(e) =>
                          updateProperty(prop.key, {
                            defaultValue: e.target.value,
                          })
                        }
                      >
                        {(prop.constraints?.options || []).map((opt) => (
                          <option
                            key={opt}
                            value={opt}
                            style={{ background: '#0a0a0b' }}
                          >
                            {opt}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Box>

                  {/* Enum options editor */}
                  {prop.type === 'enum' && (
                    <Box>
                      <Text
                        fontSize="9px"
                        color="gray.500"
                        mb={1}
                        fontWeight="bold"
                      >
                        ENUM OPTIONS
                      </Text>
                      <VStack spacing={1} align="stretch">
                        {(prop.constraints?.options || []).map(
                          (opt, optIdx) => (
                            <HStack key={optIdx} spacing={1}>
                              <Input
                                size="xs"
                                bg="#0a0a0b"
                                borderColor="#1a1a2e"
                                color="white"
                                value={opt}
                                onChange={(e) => {
                                  const opts = [
                                    ...(prop.constraints?.options || []),
                                  ];
                                  opts[optIdx] = e.target.value;
                                  updateProperty(prop.key, {
                                    constraints: {
                                      ...prop.constraints,
                                      options: opts,
                                    },
                                  });
                                }}
                              />
                              <IconButton
                                aria-label="Remove option"
                                icon={<DeleteIcon fontSize="8px" />}
                                size="xs"
                                variant="ghost"
                                color="gray.600"
                                _hover={{ color: 'red.300' }}
                                onClick={() => {
                                  const opts = (
                                    prop.constraints?.options || []
                                  ).filter((_, i) => i !== optIdx);
                                  updateProperty(prop.key, {
                                    constraints: {
                                      ...prop.constraints,
                                      options: opts,
                                    },
                                    // Reset default if it was removed
                                    ...(prop.defaultValue === opt
                                      ? { defaultValue: opts[0] || '' }
                                      : {}),
                                  });
                                }}
                              />
                            </HStack>
                          ),
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          color="gray.500"
                          _hover={{ color: 'white' }}
                          leftIcon={<AddIcon fontSize="8px" />}
                          onClick={() => {
                            const opts = [
                              ...(prop.constraints?.options || []),
                              `option_${(prop.constraints?.options?.length || 0) + 1}`,
                            ];
                            updateProperty(prop.key, {
                              constraints: {
                                ...prop.constraints,
                                options: opts,
                              },
                            });
                          }}
                        >
                          Add Option
                        </Button>
                      </VStack>
                    </Box>
                  )}

                  {/* Numeric constraints */}
                  {(prop.type === 'int' ||
                    prop.type === 'float' ||
                    prop.type === 'number') && (
                    <HStack spacing={3}>
                      <Box flex={1}>
                        <Text
                          fontSize="9px"
                          color="gray.500"
                          mb={1}
                          fontWeight="bold"
                        >
                          MIN
                        </Text>
                        <NumberInput
                          size="xs"
                          value={prop.constraints?.min ?? ''}
                          onChange={(_, val) =>
                            updateProperty(prop.key, {
                              constraints: {
                                ...prop.constraints,
                                min: isNaN(val) ? undefined : val,
                              },
                            })
                          }
                        >
                          <NumberInputField
                            bg="#0a0a0b"
                            borderColor="#1a1a2e"
                            color="white"
                            placeholder="—"
                          />
                        </NumberInput>
                      </Box>
                      <Box flex={1}>
                        <Text
                          fontSize="9px"
                          color="gray.500"
                          mb={1}
                          fontWeight="bold"
                        >
                          MAX
                        </Text>
                        <NumberInput
                          size="xs"
                          value={prop.constraints?.max ?? ''}
                          onChange={(_, val) =>
                            updateProperty(prop.key, {
                              constraints: {
                                ...prop.constraints,
                                max: isNaN(val) ? undefined : val,
                              },
                            })
                          }
                        >
                          <NumberInputField
                            bg="#0a0a0b"
                            borderColor="#1a1a2e"
                            color="white"
                            placeholder="—"
                          />
                        </NumberInput>
                      </Box>
                    </HStack>
                  )}

                  {/* Description */}
                  <Box>
                    <Text
                      fontSize="9px"
                      color="gray.500"
                      mb={1}
                      fontWeight="bold"
                    >
                      DESCRIPTION
                    </Text>
                    <Input
                      size="xs"
                      bg="#0a0a0b"
                      borderColor="#1a1a2e"
                      color="white"
                      value={prop.description ?? ''}
                      onChange={(e) =>
                        updateProperty(prop.key, {
                          description: e.target.value || undefined,
                        })
                      }
                      placeholder="Optional help text"
                    />
                  </Box>

                  {/* Reorder buttons */}
                  <HStack spacing={1} justify="flex-end">
                    <Tooltip label="Move Up" hasArrow>
                      <IconButton
                        aria-label="Move Up"
                        icon={<ChevronUpIcon />}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        isDisabled={idx === 0}
                        onClick={() => moveProperty(prop.key, -1)}
                      />
                    </Tooltip>
                    <Tooltip label="Move Down" hasArrow>
                      <IconButton
                        aria-label="Move Down"
                        icon={<ChevronDownIcon />}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        isDisabled={idx === properties.length - 1}
                        onClick={() => moveProperty(prop.key, 1)}
                      />
                    </Tooltip>
                  </HStack>
                </VStack>
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </VStack>
  );
};
