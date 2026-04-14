/**
 * GlobalFunctionEditor — list + inline editor for ScriptFunction entries.
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
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  ScriptFunction,
  ScriptParam,
  ScriptPrimitiveType,
  ScriptTable,
} from '../../../types/schema';
import { SectionLabel } from '../../common/Typography.tsx';

const RETURN_TYPES: { value: ScriptPrimitiveType; label: string }[] = [
  { value: 'void', label: 'void' },
  { value: 'boolean', label: 'boolean' },
  { value: 'number', label: 'number' },
  { value: 'string', label: 'string' },
  { value: 'table', label: 'table' },
];

const PARAM_TYPES: { value: ScriptPrimitiveType; label: string }[] = [
  { value: 'boolean', label: 'boolean' },
  { value: 'number', label: 'number' },
  { value: 'string', label: 'string' },
  { value: 'enum', label: 'enum' },
];

// ─── Param row ──────────────────────────────────────────────────────────────

const ParamRow: React.FC<{
  param: ScriptParam;
  onChange: (updates: Partial<ScriptParam>) => void;
  onDelete: () => void;
}> = ({ param, onChange, onDelete }) => (
  <HStack spacing={1}>
    <Input
      size="xs"
      bg="#05060a"
      borderColor="#1a1a2e"
      color="white"
      fontFamily="mono"
      value={param.name}
      onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
      placeholder="param"
      w="90px"
    />
    <Select
      size="xs"
      bg="#05060a"
      borderColor="#1a1a2e"
      color="white"
      value={param.type}
      w="90px"
      onChange={(e) => onChange({ type: e.target.value as ScriptPrimitiveType })}
    >
      {PARAM_TYPES.map((t) => (
        <option key={t.value} value={t.value} style={{ background: '#0a0a0b' }}>
          {t.label}
        </option>
      ))}
    </Select>
    <IconButton
      aria-label="Remove param"
      icon={<DeleteIcon fontSize="8px" />}
      size="xs"
      variant="ghost"
      color="gray.700"
      _hover={{ color: 'red.300' }}
      onClick={onDelete}
    />
  </HStack>
);

// ─── Main list editor ───────────────────────────────────────────────────────

interface GlobalFunctionEditorProps {
  functions: ScriptFunction[];
  tables: ScriptTable[];
  onAdd: (fn: ScriptFunction) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<ScriptFunction>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  initialExpandedId?: string | null;
}

export const GlobalFunctionEditor: React.FC<GlobalFunctionEditorProps> = ({
  functions,
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
  const genId = () => `sfid_${Math.random().toString(36).slice(2, 9)}`;
  for (const f of functions) {
    if (!idMapRef.current[f.id]) idMapRef.current[f.id] = genId();
  }

  const handleAdd = useCallback(() => {
    const id = `fn_${Date.now()}`;
    const fn: ScriptFunction = { id, name: 'newFunction', params: [], returnType: 'void' };
    onAdd(fn);
    setExpandedId(id);
  }, [onAdd]);

  const updateParam = (fnId: string, paramIdx: number, updates: Partial<ScriptParam>) => {
    const fn = functions.find((f) => f.id === fnId);
    if (!fn) return;
    const params = fn.params.map((p, i) => (i === paramIdx ? { ...p, ...updates } : p));
    onUpdate(fnId, { params });
  };

  const addParam = (fnId: string) => {
    const fn = functions.find((f) => f.id === fnId);
    if (!fn) return;
    onUpdate(fnId, {
      params: [...fn.params, { name: `arg${fn.params.length + 1}`, type: 'string' }],
    });
  };

  const removeParam = (fnId: string, paramIdx: number) => {
    const fn = functions.find((f) => f.id === fnId);
    if (!fn) return;
    onUpdate(fnId, { params: fn.params.filter((_, i) => i !== paramIdx) });
  };

  const renderExpanded = (fn: ScriptFunction) => (
    <Box px={3} pb={3} pt={2} bg="whiteAlpha.50">
      <VStack spacing={3} align="stretch">
        <Box>
          <SectionLabel textStyle="panelLabel" mb={1}>
            Name
          </SectionLabel>
          <Input
            size="xs"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            fontFamily="mono"
            value={fn.name}
            onChange={(e) =>
              onUpdate(fn.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
            }
          />
        </Box>

        <Box>
          <SectionLabel textStyle="panelLabel" mb={1}>
            Return Type
          </SectionLabel>
          <Select
            size="xs"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={fn.returnType}
            onChange={(e) => {
              const nextReturnType = e.target.value as ScriptPrimitiveType;
              onUpdate(fn.id, {
                returnType: nextReturnType,
                returnTableId: nextReturnType === 'table' ? fn.returnTableId : undefined,
              });
            }}
          >
            {RETURN_TYPES.map((t) => (
              <option key={t.value} value={t.value} style={{ background: '#0a0a0b' }}>
                {t.label}
              </option>
            ))}
          </Select>
          {fn.returnType === 'table' && (
            <Select
              mt={2}
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={fn.returnTableId ?? ''}
              onChange={(e) => onUpdate(fn.id, { returnTableId: e.target.value || undefined })}
            >
              <option value="" style={{ background: '#0a0a0b' }}>
                - select table -
              </option>
              {tables.map((table) => (
                <option key={table.id} value={table.id} style={{ background: '#0a0a0b' }}>
                  {table.name}
                </option>
              ))}
            </Select>
          )}
        </Box>

        <Box>
          <HStack mb={1} justify="space-between">
            <SectionLabel textStyle="panelLabel">Parameters</SectionLabel>
            <IconButton
              aria-label="Add param"
              icon={<AddIcon fontSize="8px" />}
              size="xs"
              variant="ghost"
              color="gray.500"
              _hover={{ color: 'white' }}
              onClick={() => addParam(fn.id)}
            />
          </HStack>
          {fn.params.length === 0 && (
            <Text fontSize="10px" color="gray.700" fontStyle="italic">
              No parameters
            </Text>
          )}
          <VStack spacing={1} align="stretch">
            {fn.params.map((p, pi) => (
              <ParamRow
                key={pi}
                param={p}
                onChange={(u) => updateParam(fn.id, pi, u)}
                onDelete={() => removeParam(fn.id, pi)}
              />
            ))}
          </VStack>
        </Box>

        <Box>
          <SectionLabel textStyle="panelLabel" mb={1}>
            Description
          </SectionLabel>
          <Input
            size="xs"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={fn.description ?? ''}
            onChange={(e) => onUpdate(fn.id, { description: e.target.value || undefined })}
            placeholder="Optional"
          />
        </Box>
      </VStack>
    </Box>
  );

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
            <SectionLabel textStyle="fieldLabel">Global Functions</SectionLabel>
            <Badge fontSize="9px" colorScheme="gray" variant="subtle">
              {functions.length}
            </Badge>
          </HStack>
          <Tooltip label="Add Function" hasArrow>
            <IconButton
              aria-label="Add Function"
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

      {!initialExpandedId && functions.length === 0 && (
        <Box px={3} py={6} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No global functions defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to add a Lua-callable function
          </Text>
        </Box>
      )}

      {initialExpandedId
        ? (() => {
            const fn = functions.find((f) => f.id === initialExpandedId);
            return fn ? (
              <Box key={fn.id} borderTop="1px" borderColor="whiteAlpha.50">
                {renderExpanded(fn)}
              </Box>
            ) : null;
          })()
        : functions.map((fn) => {
            const isExpanded = expandedId === fn.id;
            const stableId = idMapRef.current[fn.id] || genId();
            if (!idMapRef.current[fn.id]) idMapRef.current[fn.id] = stableId;

            const sig = `${fn.name}(${fn.params.map((p) => p.name).join(', ')})`;
            const returnLabel =
              fn.returnType === 'table'
                ? `table${
                    fn.returnTableId
                      ? `:${tables.find((t) => t.id === fn.returnTableId)?.name ?? '?'}`
                      : ''
                  }`
                : fn.returnType;

            return (
              <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
                <HStack
                  px={3}
                  py={1.5}
                  spacing={2}
                  cursor="pointer"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  onClick={() => setExpandedId(isExpanded ? null : fn.id)}
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
                    {sig}
                  </Text>
                  <Badge fontSize="9px" colorScheme="teal" variant="subtle">
                    {returnLabel}
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
                      onDelete(fn.id);
                      if (expandedId === fn.id) setExpandedId(null);
                    }}
                  />
                </HStack>

                <Collapse in={isExpanded} animateOpacity>
                  <Box px={3} pb={3} pt={2} bg="whiteAlpha.50">
                    <VStack spacing={3} align="stretch">
                      {/* Name */}
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
                          value={fn.name}
                          onChange={(e) =>
                            onUpdate(fn.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                          }
                        />
                      </Box>

                      {/* Return type */}
                      <Box>
                        <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                          RETURN TYPE
                        </Text>
                        <Select
                          size="xs"
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
                          color="white"
                          value={fn.returnType}
                          onChange={(e) => {
                            const nextReturnType = e.target.value as ScriptPrimitiveType;
                            onUpdate(fn.id, {
                              returnType: nextReturnType,
                              returnTableId:
                                nextReturnType === 'table' ? fn.returnTableId : undefined,
                            });
                          }}
                        >
                          {RETURN_TYPES.map((t) => (
                            <option key={t.value} value={t.value} style={{ background: '#0a0a0b' }}>
                              {t.label}
                            </option>
                          ))}
                        </Select>
                        {fn.returnType === 'table' && (
                          <Select
                            mt={2}
                            size="xs"
                            bg="#0a0a0b"
                            borderColor="#1a1a2e"
                            color="white"
                            value={fn.returnTableId ?? ''}
                            onChange={(e) =>
                              onUpdate(fn.id, {
                                returnTableId: e.target.value || undefined,
                              })
                            }
                          >
                            <option value="" style={{ background: '#0a0a0b' }}>
                              - select table -
                            </option>
                            {tables.map((table) => (
                              <option
                                key={table.id}
                                value={table.id}
                                style={{ background: '#0a0a0b' }}
                              >
                                {table.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Box>

                      {/* Params */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            PARAMETERS
                          </Text>
                          <IconButton
                            aria-label="Add param"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addParam(fn.id)}
                          />
                        </HStack>
                        {fn.params.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No parameters
                          </Text>
                        )}
                        <VStack spacing={1} align="stretch">
                          {fn.params.map((p, pi) => (
                            <ParamRow
                              key={pi}
                              param={p}
                              onChange={(u) => updateParam(fn.id, pi, u)}
                              onDelete={() => removeParam(fn.id, pi)}
                            />
                          ))}
                        </VStack>
                      </Box>

                      {/* Description */}
                      <Box>
                        <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                          DESCRIPTION
                        </Text>
                        <Input
                          size="xs"
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
                          color="white"
                          value={fn.description ?? ''}
                          onChange={(e) =>
                            onUpdate(fn.id, { description: e.target.value || undefined })
                          }
                          placeholder="Optional"
                        />
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

export default GlobalFunctionEditor;
