import React from 'react';
import {
    VStack,
    FormControl,
    FormLabel,
    Input,
    NumberInput,
    NumberInputField,
    Switch,
    Select,
    Text,
    Box,
} from '@chakra-ui/react';

export type PropertyType = 'string' | 'number' | 'boolean' | 'enum' | 'custom';

export interface PropertySchema {
    key: string;
    label: string;
    type: PropertyType;
    description?: string;
    constraints?: {
        min?: number;
        max?: number;
        options?: string[];
    };
    // Optional custom renderer for complex fields. Receives current value and an onChange callback.
    customRenderer?: (value: any, onChange: (v: any) => void) => React.ReactNode;
}

interface PropertyFormProps {
    schema: PropertySchema[];
    values: Record<string, any>;
    onChange: (key: string, value: any) => void;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({ schema, values, onChange }) => {
    return (
        <VStack align="stretch" spacing={5} px={2}>
            {schema.map(prop => {
                const rawVal = values[prop.key];
                const currentValue = rawVal !== undefined ? rawVal : (prop.type === 'number' ? 0 : prop.type === 'boolean' ? false : '');

                return (
                    <FormControl key={prop.key}>
                        <FormLabel fontSize="10px" color="gray.400" mb={2} textTransform="uppercase" letterSpacing="wide">
                            {prop.label}
                        </FormLabel>

                        <Box>
                            {prop.type === 'string' && (
                                <Input
                                    size="sm"
                                    bg="#05060a"
                                    borderColor="#0b1116"
                                    _focus={{ borderColor: 'blue.500', boxShadow: '0 0 0 2px rgba(66,153,225,0.6)' }}
                                    color="white"
                                    value={currentValue}
                                    onChange={(e) => onChange(prop.key, e.target.value)}
                                />
                            )}

                            {prop.type === 'number' && (
                            <NumberInput
                                size="sm"
                                value={Number(currentValue)}
                                min={prop.constraints?.min}
                                max={prop.constraints?.max}
                                onChange={(_, val) => onChange(prop.key, val)}
                            >
                                <NumberInputField bg="#05060a" borderColor="#0b1116" color="white" />
                            </NumberInput>
                            )}

                            {prop.type === 'boolean' && (
                                <Switch colorScheme="blue" isChecked={!!currentValue} onChange={(e) => onChange(prop.key, e.target.checked)} />
                            )}

                            {prop.type === 'enum' && (
                                <Select size="sm" bg="#05060a" borderColor="#0b1116" color="white" value={currentValue} onChange={(e) => onChange(prop.key, e.target.value)}>
                                    {(prop.constraints?.options || []).map(opt => (
                                        <option key={opt} value={opt} style={{ background: '#05060a', color: '#fff' }}>{opt}</option>
                                    ))}
                                </Select>
                            )}

                            {prop.type === 'custom' && prop.customRenderer && (
                                <Box>
                                    {prop.customRenderer(currentValue, (v) => onChange(prop.key, v))}
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

export default PropertyForm;
