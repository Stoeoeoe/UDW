/**
 * NamespaceEditor — list + inline editor for ScriptNamespace entries.
 * Each namespace has fields (GameVariable[]) and functions (ScriptFunction[]).
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
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  ScriptNamespace,
  ScriptFunction,
  ScriptParam,
  ScriptPrimitiveType,
  GameVariable,
  GameVariableType,
  ScriptTable,
} from '../../../types/schema';

// ─── Shared inline editors ──────────────────────────────────────────────────

const PARAM_TYPES: ScriptPrimitiveType[] = ['boolean', 'number', 'string', 'enum'];
const RETURN_TYPES: ScriptPrimitiveType[] = ['void', 'boolean', 'number', 'string', 'table'];
const VAR_TYPES: GameVariableType[] = ['boolean', 'number', 'string', 'enum'];

const InlineFunction: React.FC<{
  fn: ScriptFunction;
  tables: ScriptTable[];
  onChange: (updates: Partial<ScriptFunction>) => void;
  onDelete: () => void;
}> = ({ fn, tables, onChange, onDelete }) => {
  const updateParam = (i: number, u: Partial<ScriptParam>) => {
    const params = fn.params.map((p, j) => (j === i ? { ...p, ...u } : p));
    onChange({ params });
  };

  return (
    <Box bg="#0a0a0b" borderRadius="md" border="1px" borderColor="#1a1a2e" p={2}>
      <VStack spacing={2} align="stretch">
        <HStack spacing={1}>
          <Input
            size="xs"
            bg="#05060a"
            borderColor="#1a1a2e"
            color="white"
            fontFamily="mono"
            value={fn.name}
            flex={1}
            onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            placeholder="functionName"
          />
          <Select
            size="xs"
            bg="#05060a"
            borderColor="#1a1a2e"
            color="white"
            w="80px"
            value={fn.returnType}
            onChange={(e) => {
              const nextReturnType = e.target.value as ScriptPrimitiveType;
              onChange({
                returnType: nextReturnType,
                returnTableId: nextReturnType === 'table' ? fn.returnTableId : undefined,
              });
            }}
          >
            {RETURN_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#0a0a0b' }}>
                {t}
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
        {fn.returnType === 'table' && (
          <Select
            size="xs"
            bg="#05060a"
            borderColor="#1a1a2e"
            color="white"
            value={fn.returnTableId ?? ''}
            onChange={(e) => onChange({ returnTableId: e.target.value || undefined })}
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
        {/* Params */}
        <Box>
          <HStack mb={1} justify="space-between">
            <Text fontSize="9px" color="gray.600">
              Params
            </Text>
            <IconButton
              aria-label="Add param"
              icon={<AddIcon fontSize="7px" />}
              size="xs"
              variant="ghost"
              color="gray.600"
              _hover={{ color: 'white' }}
              onClick={() =>
                onChange({
                  params: [...fn.params, { name: `arg${fn.params.length + 1}`, type: 'string' }],
                })
              }
            />
          </HStack>
          <VStack spacing={1} align="stretch">
            {fn.params.map((p, pi) => (
              <HStack key={pi} spacing={1}>
                <Input
                  size="xs"
                  bg="#05060a"
                  borderColor="#1a1a2e"
                  color="white"
                  fontFamily="mono"
                  value={p.name}
                  w="80px"
                  onChange={(e) =>
                    updateParam(pi, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                  }
                />
                <Select
                  size="xs"
                  bg="#05060a"
                  borderColor="#1a1a2e"
                  color="white"
                  w="75px"
                  value={p.type}
                  onChange={(e) => updateParam(pi, { type: e.target.value as ScriptPrimitiveType })}
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t} style={{ background: '#0a0a0b' }}>
                      {t}
                    </option>
                  ))}
                </Select>
                <IconButton
                  aria-label="Remove"
                  icon={<DeleteIcon fontSize="7px" />}
                  size="xs"
                  variant="ghost"
                  color="gray.700"
                  _hover={{ color: 'red.300' }}
                  onClick={() => onChange({ params: fn.params.filter((_, i) => i !== pi) })}
                />
              </HStack>
            ))}
          </VStack>
        </Box>
        <Input
          size="xs"
          bg="#05060a"
          borderColor="#1a1a2e"
          color="gray.500"
          value={fn.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          placeholder="Description"
          _placeholder={{ color: 'gray.700' }}
        />
      </VStack>
    </Box>
  );
};

const InlineField: React.FC<{
  field: GameVariable;
  onChange: (updates: Partial<GameVariable>) => void;
  onDelete: () => void;
}> = ({ field, onChange, onDelete }) => (
  <HStack spacing={1}>
    <Input
      size="xs"
      bg="#05060a"
      borderColor="#1a1a2e"
      color="white"
      fontFamily="mono"
      value={field.key}
      flex={1}
      onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_.]/g, '') })}
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
        const t = e.target.value as GameVariableType;
        onChange({
          type: t,
          defaultValue: t === 'boolean' ? false : t === 'number' ? 0 : '',
          enumValues:
            t === 'enum' ? (field.enumValues?.length ? field.enumValues : ['option1']) : undefined,
        });
      }}
    >
      {VAR_TYPES.map((t) => (
        <option key={t} value={t} style={{ background: '#0a0a0b' }}>
          {t}
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
);

// ─── Main editor ────────────────────────────────────────────────────────────

interface NamespaceEditorProps {
  namespaces: ScriptNamespace[];
  tables: ScriptTable[];
  onAdd: (ns: ScriptNamespace) => void;
  onUpdate: (id: string, updates: Partial<ScriptNamespace>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  initialExpandedId?: string | null;
}

export const NamespaceEditor: React.FC<NamespaceEditorProps> = ({
  namespaces,
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
  const genId = () => `nsid_${Math.random().toString(36).slice(2, 9)}`;
  for (const ns of namespaces) {
    if (!idMapRef.current[ns.id]) idMapRef.current[ns.id] = genId();
  }

  const handleAdd = useCallback(() => {
    const id = `ns_${Date.now()}`;
    const ns: ScriptNamespace = {
      id,
      name: 'namespace',
      description: '',
      fields: [],
      functions: [],
    };
    onAdd(ns);
    setExpandedId(id);
  }, [onAdd]);

  const updateField = (nsId: string, fieldIdx: number, updates: Partial<GameVariable>) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    const fields = ns.fields.map((f, i) => (i === fieldIdx ? { ...f, ...updates } : f));
    onUpdate(nsId, { fields });
  };

  const addField = (nsId: string) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    onUpdate(nsId, {
      fields: [
        ...ns.fields,
        { key: `field${ns.fields.length + 1}`, type: 'string', category: '', defaultValue: '' },
      ],
    });
  };

  const removeField = (nsId: string, idx: number) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    onUpdate(nsId, { fields: ns.fields.filter((_, i) => i !== idx) });
  };

  const updateFn = (nsId: string, fnIdx: number, updates: Partial<ScriptFunction>) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    const fns = ns.functions.map((f, i) => (i === fnIdx ? { ...f, ...updates } : f));
    onUpdate(nsId, { functions: fns });
  };

  const addFn = (nsId: string) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    const id = `nsfn_${Date.now()}`;
    onUpdate(nsId, {
      functions: [...ns.functions, { id, name: 'method', params: [], returnType: 'void' }],
    });
  };

  const removeFn = (nsId: string, idx: number) => {
    const ns = namespaces.find((n) => n.id === nsId);
    if (!ns) return;
    onUpdate(nsId, { functions: ns.functions.filter((_, i) => i !== idx) });
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
            <Text
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
            >
              Namespaces
            </Text>
            <Badge fontSize="9px" colorScheme="gray" variant="subtle">
              {namespaces.length}
            </Badge>
          </HStack>
          <Tooltip label="Add Namespace" hasArrow>
            <IconButton
              aria-label="Add Namespace"
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

      {!initialExpandedId && namespaces.length === 0 && (
        <Box px={3} py={6} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No namespaces defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to add a namespace (e.g. weather, camera)
          </Text>
        </Box>
      )}

      {initialExpandedId
        ? (() => {
            const ns = namespaces.find((n) => n.id === initialExpandedId);
            if (!ns) return null;
            const stableId = idMapRef.current[ns.id] || genId();
            if (!idMapRef.current[ns.id]) idMapRef.current[ns.id] = stableId;

            return (
              <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
                <Collapse in={true} animateOpacity>
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
                          value={ns.name}
                          onChange={(e) =>
                            onUpdate(ns.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
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
                          value={ns.description ?? ''}
                          onChange={(e) =>
                            onUpdate(ns.id, { description: e.target.value || undefined })
                          }
                          placeholder="Optional"
                        />
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Fields */}
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
                            onClick={() => addField(ns.id)}
                          />
                        </HStack>
                        {ns.fields.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No fields
                          </Text>
                        )}
                        <VStack spacing={1} align="stretch">
                          {ns.fields.map((f, fi) => (
                            <InlineField
                              key={fi}
                              field={f}
                              onChange={(u) => updateField(ns.id, fi, u)}
                              onDelete={() => removeField(ns.id, fi)}
                            />
                          ))}
                        </VStack>
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Functions */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FUNCTIONS
                          </Text>
                          <IconButton
                            aria-label="Add function"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addFn(ns.id)}
                          />
                        </HStack>
                        {ns.functions.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No functions
                          </Text>
                        )}
                        <VStack spacing={2} align="stretch">
                          {ns.functions.map((fn, fi) => (
                            <InlineFunction
                              key={fi}
                              fn={fn}
                              tables={tables}
                              onChange={(u) => updateFn(ns.id, fi, u)}
                              onDelete={() => removeFn(ns.id, fi)}
                            />
                          ))}
                        </VStack>
                      </Box>
                    </VStack>
                  </Box>
                </Collapse>
              </Box>
            );
          })()
        : namespaces.map((ns) => {
            const isExpanded = expandedId === ns.id;
            const stableId = idMapRef.current[ns.id] || genId();
            if (!idMapRef.current[ns.id]) idMapRef.current[ns.id] = stableId;

            return (
              <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
                <HStack
                  px={3}
                  py={1.5}
                  spacing={2}
                  cursor="pointer"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  onClick={() => setExpandedId(isExpanded ? null : ns.id)}
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
                    {ns.name}
                  </Text>
                  <Badge fontSize="9px" colorScheme="cyan" variant="subtle">
                    {ns.fields.length}F {ns.functions.length}fn
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
                      onDelete(ns.id);
                      if (expandedId === ns.id) setExpandedId(null);
                    }}
                  />
                </HStack>

                <Collapse in={isExpanded} animateOpacity>
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
                          value={ns.name}
                          onChange={(e) =>
                            onUpdate(ns.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
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
                          value={ns.description ?? ''}
                          onChange={(e) =>
                            onUpdate(ns.id, { description: e.target.value || undefined })
                          }
                          placeholder="Optional"
                        />
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Fields */}
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
                            onClick={() => addField(ns.id)}
                          />
                        </HStack>
                        {ns.fields.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No fields
                          </Text>
                        )}
                        <VStack spacing={1} align="stretch">
                          {ns.fields.map((f, fi) => (
                            <InlineField
                              key={fi}
                              field={f}
                              onChange={(u) => updateField(ns.id, fi, u)}
                              onDelete={() => removeField(ns.id, fi)}
                            />
                          ))}
                        </VStack>
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Functions */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FUNCTIONS
                          </Text>
                          <IconButton
                            aria-label="Add function"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addFn(ns.id)}
                          />
                        </HStack>
                        {ns.functions.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No functions
                          </Text>
                        )}
                        <VStack spacing={2} align="stretch">
                          {ns.functions.map((fn, fi) => (
                            <InlineFunction
                              key={fi}
                              fn={fn}
                              tables={tables}
                              onChange={(u) => updateFn(ns.id, fi, u)}
                              onDelete={() => removeFn(ns.id, fi)}
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

export default NamespaceEditor;
