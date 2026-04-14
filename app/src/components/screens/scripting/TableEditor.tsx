/**
 * TableEditor — list + inline editor for ScriptTable entries.
 * Tables are reusable field definitions that can be referenced by variables,
 * namespace fields, and context type fields.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  IconButton,
  Flex,
  Badge,
  Tooltip,
  Collapse,
  Divider,
  Switch,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Button,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { ScriptTable, TableField } from '../../../types/schema';
import { SectionLabel } from '../../common/Typography.tsx';

const FIELD_TYPES: { value: TableField['type']; label: string }[] = [
  { value: 'boolean', label: 'boolean' },
  { value: 'number', label: 'number' },
  { value: 'string', label: 'string' },
  { value: 'enum', label: 'enum' },
];

function defaultValueForType(type: TableField['type']): boolean | number | string {
  switch (type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'enum':
      return '';
  }
}

const InlineTableField: React.FC<{
  field: TableField;
  onChange: (updates: Partial<TableField>) => void;
  onDelete: () => void;
}> = ({ field, onChange, onDelete }) => (
  <Box bg="#0a0a0b" borderRadius="md" border="1px" borderColor="#1a1a2e" p={2}>
    <VStack spacing={2} align="stretch">
      <HStack spacing={1}>
        <Input
          size="xs"
          bg="#05060a"
          borderColor="#1a1a2e"
          color="white"
          fontFamily="mono"
          value={field.key}
          flex={1}
          onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
          placeholder="fieldName"
        />
        <Select
          size="xs"
          bg="#05060a"
          borderColor="#1a1a2e"
          color="white"
          w="85px"
          value={field.type}
          onChange={(e) => {
            const t = e.target.value as TableField['type'];
            onChange({
              type: t,
              defaultValue: defaultValueForType(t),
              enumValues:
                t === 'enum'
                  ? field.enumValues?.length
                    ? field.enumValues
                    : ['option1']
                  : undefined,
            });
          }}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value} style={{ background: '#0a0a0b' }}>
              {t.label}
            </option>
          ))}
        </Select>
        <IconButton
          aria-label="Remove"
          icon={<DeleteIcon fontSize="8px" />}
          size="xs"
          variant="ghost"
          color="gray.700"
          _hover={{ color: 'red.300' }}
          onClick={onDelete}
        />
      </HStack>

      {/* Default value */}
      {field.type === 'boolean' && (
        <HStack spacing={2}>
          <Text fontSize="9px" color="gray.600">
            default
          </Text>
          <Switch
            size="sm"
            colorScheme="green"
            isChecked={!!field.defaultValue}
            onChange={(e) => onChange({ defaultValue: e.target.checked })}
          />
        </HStack>
      )}
      {field.type === 'number' && (
        <NumberInput
          size="xs"
          value={typeof field.defaultValue === 'number' ? field.defaultValue : 0}
          onChange={(_, val) => onChange({ defaultValue: isNaN(val) ? 0 : val })}
        >
          <NumberInputField
            bg="#05060a"
            borderColor="#1a1a2e"
            color="white"
            placeholder="default"
          />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      )}
      {field.type === 'string' && (
        <Input
          size="xs"
          bg="#05060a"
          borderColor="#1a1a2e"
          color="white"
          value={typeof field.defaultValue === 'string' ? field.defaultValue : ''}
          onChange={(e) => onChange({ defaultValue: e.target.value })}
          placeholder="default"
        />
      )}
      {field.type === 'enum' && (
        <VStack spacing={1} align="stretch">
          <HStack spacing={1} flexWrap="wrap">
            {(field.enumValues || []).map((opt, oi) => (
              <HStack key={oi} spacing={1}>
                <Input
                  size="xs"
                  bg="#05060a"
                  borderColor="#1a1a2e"
                  color="white"
                  value={opt}
                  w="80px"
                  onChange={(e) => {
                    const vals = [...(field.enumValues || [])];
                    vals[oi] = e.target.value;
                    onChange({ enumValues: vals });
                  }}
                />
                <IconButton
                  aria-label="Remove"
                  icon={<DeleteIcon fontSize="7px" />}
                  size="xs"
                  variant="ghost"
                  color="gray.700"
                  _hover={{ color: 'red.300' }}
                  onClick={() => {
                    const vals = (field.enumValues || []).filter((_, i) => i !== oi);
                    onChange({
                      enumValues: vals,
                      ...(field.defaultValue === opt ? { defaultValue: vals[0] ?? '' } : {}),
                    });
                  }}
                />
              </HStack>
            ))}
            <Button
              size="xs"
              variant="ghost"
              color="gray.600"
              _hover={{ color: 'white' }}
              leftIcon={<AddIcon fontSize="7px" />}
              onClick={() =>
                onChange({
                  enumValues: [
                    ...(field.enumValues || []),
                    `val_${(field.enumValues?.length || 0) + 1}`,
                  ],
                })
              }
            >
              Add
            </Button>
          </HStack>
          <Select
            size="xs"
            bg="#05060a"
            borderColor="#1a1a2e"
            color="white"
            value={typeof field.defaultValue === 'string' ? field.defaultValue : ''}
            onChange={(e) => onChange({ defaultValue: e.target.value })}
          >
            {(field.enumValues || []).map((opt) => (
              <option key={opt} value={opt} style={{ background: '#0a0a0b' }}>
                {opt}
              </option>
            ))}
          </Select>
        </VStack>
      )}

      <Input
        size="xs"
        bg="#05060a"
        borderColor="#1a1a2e"
        color="gray.500"
        value={field.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value || undefined })}
        placeholder="Description"
        _placeholder={{ color: 'gray.700' }}
      />
    </VStack>
  </Box>
);

// ─── Main editor ────────────────────────────────────────────────────────────

interface TableEditorProps {
  tables: ScriptTable[];
  onAdd: (table: ScriptTable) => void;
  onUpdate: (id: string, updates: Partial<ScriptTable>) => void;
  onDelete: (id: string) => void;
  initialExpandedId?: string | null;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  tables,
  onAdd,
  onUpdate,
  onDelete,
  initialExpandedId,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    setExpandedId(initialExpandedId ?? null);
  }, [initialExpandedId]);

  const idMapRef = useRef<Record<string, string>>({});
  const genId = () => `tbid_${Math.random().toString(36).slice(2, 9)}`;
  for (const t of tables) {
    if (!idMapRef.current[t.id]) idMapRef.current[t.id] = genId();
  }

  const handleAdd = useCallback(() => {
    const id = `tbl_${Date.now()}`;
    const table: ScriptTable = { id, name: 'table', fields: [] };
    onAdd(table);
    setExpandedId(id);
  }, [onAdd]);

  const updateField = (tblId: string, idx: number, updates: Partial<TableField>) => {
    const tbl = tables.find((t) => t.id === tblId);
    if (!tbl) return;
    onUpdate(tblId, { fields: tbl.fields.map((f, i) => (i === idx ? { ...f, ...updates } : f)) });
  };

  const addField = (tblId: string) => {
    const tbl = tables.find((t) => t.id === tblId);
    if (!tbl) return;
    onUpdate(tblId, {
      fields: [
        ...tbl.fields,
        { key: `field${tbl.fields.length + 1}`, type: 'string', defaultValue: '' },
      ],
    });
  };

  const removeField = (tblId: string, idx: number) => {
    const tbl = tables.find((t) => t.id === tblId);
    if (!tbl) return;
    onUpdate(tblId, { fields: tbl.fields.filter((_, i) => i !== idx) });
  };

  return (
    <VStack spacing={0} align="stretch">
      {!initialExpandedId && (
        <Flex
          px={3}
          py={2}
          align="center"
          justify="space-between"
          borderBottom="1px"
          borderColor="whiteAlpha.50"
        >
          <HStack spacing={2}>
            <SectionLabel textStyle="fieldLabel">Tables</SectionLabel>
            <Badge fontSize="9px" colorScheme="gray" variant="subtle">
              {tables.length}
            </Badge>
          </HStack>
          <Tooltip label="Add Table" hasArrow>
            <IconButton
              aria-label="Add Table"
              icon={<AddIcon fontSize="9px" />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={handleAdd}
            />
          </Tooltip>
        </Flex>
      )}

      {!initialExpandedId && tables.length === 0 && (
        <Box px={3} py={6} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No tables defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to define a reusable table type
          </Text>
        </Box>
      )}

      {(initialExpandedId && initialExpandedId
        ? tables.filter((t) => t.id === initialExpandedId)
        : tables
      ).map((tbl) => {
        const isExpanded = expandedId === tbl.id;
        const stableId = idMapRef.current[tbl.id] || genId();
        if (!idMapRef.current[tbl.id]) idMapRef.current[tbl.id] = stableId;

        return (
          <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
            {!initialExpandedId && (
              <HStack
                px={3}
                py={1.5}
                spacing={2}
                cursor="pointer"
                _hover={{ bg: 'whiteAlpha.50' }}
                onClick={() => setExpandedId(isExpanded ? null : tbl.id)}
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
                  fontFamily="mono"
                >
                  {tbl.name}
                </Text>
                <Badge fontSize="9px" colorScheme="orange" variant="subtle">
                  {tbl.fields.length} fields
                </Badge>
                <IconButton
                  aria-label="Delete"
                  icon={<DeleteIcon fontSize="8px" />}
                  size="xs"
                  variant="ghost"
                  color="gray.700"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  _hover={{ color: 'red.300', bg: 'red.900' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(tbl.id);
                    if (expandedId === tbl.id) setExpandedId(null);
                  }}
                />
              </HStack>
            )}

            <Collapse in={initialExpandedId || isExpanded} animateOpacity>
              <Box px={3} pb={3} pt={2} bg="whiteAlpha.50">
                <VStack spacing={3} align="stretch">
                  <Box>
                    <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                      NAME
                    </Text>
                    <Input
                      size="xs"
                      bg="#0a0a0b"
                      borderColor="#1a1a2e"
                      color="white"
                      fontFamily="mono"
                      value={tbl.name}
                      onChange={(e) =>
                        onUpdate(tbl.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                      }
                    />
                  </Box>

                  <Box>
                    <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                      DESCRIPTION
                    </Text>
                    <Input
                      size="xs"
                      bg="#0a0a0b"
                      borderColor="#1a1a2e"
                      color="white"
                      value={tbl.description ?? ''}
                      onChange={(e) =>
                        onUpdate(tbl.id, { description: e.target.value || undefined })
                      }
                      placeholder="e.g. Structure for actor data"
                    />
                  </Box>

                  <Divider borderColor="whiteAlpha.100" />

                  <Box>
                    <HStack mb={1} justify="space-between">
                      <Text fontSize="9px" color="gray.500" fontWeight="bold">
                        FIELDS
                      </Text>
                      <IconButton
                        aria-label="Add field"
                        icon={<AddIcon fontSize="8px" />}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        _hover={{ color: 'white' }}
                        onClick={() => addField(tbl.id)}
                      />
                    </HStack>
                    {tbl.fields.length === 0 && (
                      <Text fontSize="10px" color="gray.700" fontStyle="italic">
                        No fields
                      </Text>
                    )}
                    <VStack spacing={2} align="stretch">
                      {tbl.fields.map((f, fi) => (
                        <InlineTableField
                          key={fi}
                          field={f}
                          onChange={(u) => updateField(tbl.id, fi, u)}
                          onDelete={() => removeField(tbl.id, fi)}
                        />
                      ))}
                    </VStack>
                  </Box>
                </VStack>
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </VStack>
  );
};

export default TableEditor;
