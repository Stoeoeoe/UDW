/**
 * ContextTypeEditor — list + inline editor for ScriptContextType entries.
 * Defines the shape of `self` for script execution contexts.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  IconButton,
  Flex,
  Badge,
  Tooltip,
  Collapse,
  Divider,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  ScriptContextType,
  ScriptFunction,
  ScriptParam,
  ScriptPrimitiveType,
  GameVariable,
  GameVariableType,
  ScriptTable,
} from '../../../types/schema';
import { SectionLabel } from '../../common/Typography.tsx';
import {
  CompactInput as Input,
  CompactSelect as Select,
  InlineEditorCard,
} from '../../common/Fields';

// ─── Shared inline editors (same as NamespaceEditor) ────────────────────────

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
    <InlineEditorCard>
      <VStack spacing={2} align="stretch">
        <HStack spacing={1}>
          <Input
            fontFamily="mono"
            value={fn.name}
            flex={1}
            onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            placeholder="methodName"
          />
          <Select
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
              <option key={t} value={t}>
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
            value={fn.returnTableId ?? ''}
            onChange={(e) => onChange({ returnTableId: e.target.value || undefined })}
          >
            <option value="">- select table -</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </Select>
        )}
        <Box>
          <HStack mb={1} justify="space-between">
            <SectionLabel textStyle="panelLabel">Params</SectionLabel>
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
                  fontFamily="mono"
                  value={p.name}
                  w="80px"
                  onChange={(e) =>
                    updateParam(pi, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                  }
                />
                <Select
                  w="75px"
                  value={p.type}
                  onChange={(e) => updateParam(pi, { type: e.target.value as ScriptPrimitiveType })}
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>
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
          color="editorMutedText"
          value={fn.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          placeholder="Description"
          _placeholder={{ color: 'gray.700' }}
        />
      </VStack>
    </InlineEditorCard>
  );
};

const InlineField: React.FC<{
  field: GameVariable;
  onChange: (updates: Partial<GameVariable>) => void;
  onDelete: () => void;
}> = ({ field, onChange, onDelete }) => (
  <HStack spacing={1}>
    <Input
      fontFamily="mono"
      value={field.key}
      flex={1}
      onChange={(e) => onChange({ key: e.target.value.replace(/[^a-zA-Z0-9_.]/g, '') })}
      placeholder="fieldName"
    />
    <Select
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
        <option key={t} value={t}>
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

interface ContextTypeEditorProps {
  contextTypes: ScriptContextType[];
  tables: ScriptTable[];
  onAdd: (ct: ScriptContextType) => void;
  onUpdate: (id: string, updates: Partial<ScriptContextType>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  initialExpandedId?: string | null;
}

export const ContextTypeEditor: React.FC<ContextTypeEditorProps> = ({
  contextTypes,
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
  const genId = () => `ctid_${Math.random().toString(36).slice(2, 9)}`;
  for (const ct of contextTypes) {
    if (!idMapRef.current[ct.id]) idMapRef.current[ct.id] = genId();
  }

  const handleAdd = useCallback(() => {
    const id = `ctx_${Date.now()}`;
    const ct: ScriptContextType = {
      id,
      name: 'context',
      description: '',
      fields: [],
      functions: [],
    };
    onAdd(ct);
    setExpandedId(id);
  }, [onAdd]);

  const updateField = (ctId: string, idx: number, updates: Partial<GameVariable>) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    onUpdate(ctId, { fields: ct.fields.map((f, i) => (i === idx ? { ...f, ...updates } : f)) });
  };

  const addField = (ctId: string) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    onUpdate(ctId, {
      fields: [
        ...ct.fields,
        { key: `field${ct.fields.length + 1}`, type: 'string', category: '', defaultValue: '' },
      ],
    });
  };

  const removeField = (ctId: string, idx: number) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    onUpdate(ctId, { fields: ct.fields.filter((_, i) => i !== idx) });
  };

  const updateFn = (ctId: string, fnIdx: number, updates: Partial<ScriptFunction>) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    onUpdate(ctId, {
      functions: ct.functions.map((f, i) => (i === fnIdx ? { ...f, ...updates } : f)),
    });
  };

  const addFn = (ctId: string) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    const id = `ctfn_${Date.now()}`;
    onUpdate(ctId, {
      functions: [...ct.functions, { id, name: 'method', params: [], returnType: 'void' }],
    });
  };

  const removeFn = (ctId: string, idx: number) => {
    const ct = contextTypes.find((c) => c.id === ctId);
    if (!ct) return;
    onUpdate(ctId, { functions: ct.functions.filter((_, i) => i !== idx) });
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
            <SectionLabel textStyle="fieldLabel">Context Types</SectionLabel>
            <Badge fontSize="9px" colorScheme="gray" variant="subtle">
              {contextTypes.length}
            </Badge>
          </HStack>
          <Tooltip label="Add Context Type" hasArrow>
            <IconButton
              aria-label="Add Context Type"
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

      {!initialExpandedId && contextTypes.length === 0 && (
        <Box px={3} py={6} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No context types defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to define a self context (e.g. actor, cutscene)
          </Text>
        </Box>
      )}

      {initialExpandedId
        ? (() => {
            const ct = contextTypes.find((c) => c.id === initialExpandedId);
            if (!ct) return null;
            const stableId = idMapRef.current[ct.id] || genId();
            if (!idMapRef.current[ct.id]) idMapRef.current[ct.id] = stableId;

            return (
              <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
                <Collapse in={true} animateOpacity>
                  <Box px={3} pb={3} pt={2} bg="whiteAlpha.50">
                    <VStack spacing={3} align="stretch">
                      <Box>
                        <SectionLabel textStyle="panelLabel" mb={1}>
                          Name
                        </SectionLabel>
                        <Input
                          fontFamily="mono"
                          value={ct.name}
                          onChange={(e) =>
                            onUpdate(ct.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                          }
                        />
                      </Box>

                      <Box>
                        <SectionLabel textStyle="panelLabel" mb={1}>
                          Description
                        </SectionLabel>
                        <Input
                          value={ct.description ?? ''}
                          onChange={(e) =>
                            onUpdate(ct.id, { description: e.target.value || undefined })
                          }
                          placeholder="e.g. Script context for actor routines"
                        />
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Fields (self.x) */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FIELDS (self.*)
                          </Text>
                          <IconButton
                            aria-label="Add field"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addField(ct.id)}
                          />
                        </HStack>
                        {ct.fields.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No fields
                          </Text>
                        )}
                        <VStack spacing={1} align="stretch">
                          {ct.fields.map((f, fi) => (
                            <InlineField
                              key={fi}
                              field={f}
                              onChange={(u) => updateField(ct.id, fi, u)}
                              onDelete={() => removeField(ct.id, fi)}
                            />
                          ))}
                        </VStack>
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Functions (self:method()) */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FUNCTIONS (self:*)
                          </Text>
                          <IconButton
                            aria-label="Add function"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addFn(ct.id)}
                          />
                        </HStack>
                        {ct.functions.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No functions
                          </Text>
                        )}
                        <VStack spacing={2} align="stretch">
                          {ct.functions.map((fn, fi) => (
                            <InlineFunction
                              key={fi}
                              fn={fn}
                              tables={tables}
                              onChange={(u) => updateFn(ct.id, fi, u)}
                              onDelete={() => removeFn(ct.id, fi)}
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
        : contextTypes.map((ct) => {
            const isExpanded = expandedId === ct.id;
            const stableId = idMapRef.current[ct.id] || genId();
            if (!idMapRef.current[ct.id]) idMapRef.current[ct.id] = stableId;

            return (
              <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
                <HStack
                  px={3}
                  py={1.5}
                  spacing={2}
                  cursor="pointer"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  onClick={() => setExpandedId(isExpanded ? null : ct.id)}
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
                    self ({ct.name})
                  </Text>
                  <Badge fontSize="9px" colorScheme="orange" variant="subtle">
                    {ct.fields.length}F {ct.functions.length}fn
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
                      onDelete(ct.id);
                      if (expandedId === ct.id) setExpandedId(null);
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
                          fontFamily="mono"
                          value={ct.name}
                          onChange={(e) =>
                            onUpdate(ct.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })
                          }
                        />
                      </Box>

                      <Box>
                        <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                          DESCRIPTION
                        </Text>
                        <Input
                          value={ct.description ?? ''}
                          onChange={(e) =>
                            onUpdate(ct.id, { description: e.target.value || undefined })
                          }
                          placeholder="e.g. Script context for actor routines"
                        />
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Fields (self.x) */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FIELDS (self.*)
                          </Text>
                          <IconButton
                            aria-label="Add field"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addField(ct.id)}
                          />
                        </HStack>
                        {ct.fields.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No fields
                          </Text>
                        )}
                        <VStack spacing={1} align="stretch">
                          {ct.fields.map((f, fi) => (
                            <InlineField
                              key={fi}
                              field={f}
                              onChange={(u) => updateField(ct.id, fi, u)}
                              onDelete={() => removeField(ct.id, fi)}
                            />
                          ))}
                        </VStack>
                      </Box>

                      <Divider borderColor="whiteAlpha.100" />

                      {/* Functions (self:method()) */}
                      <Box>
                        <HStack mb={1} justify="space-between">
                          <Text fontSize="9px" color="gray.500" fontWeight="bold">
                            FUNCTIONS (self:*)
                          </Text>
                          <IconButton
                            aria-label="Add function"
                            icon={<AddIcon fontSize="8px" />}
                            size="xs"
                            variant="ghost"
                            color="gray.500"
                            _hover={{ color: 'white' }}
                            onClick={() => addFn(ct.id)}
                          />
                        </HStack>
                        {ct.functions.length === 0 && (
                          <Text fontSize="10px" color="gray.700" fontStyle="italic">
                            No functions
                          </Text>
                        )}
                        <VStack spacing={2} align="stretch">
                          {ct.functions.map((fn, fi) => (
                            <InlineFunction
                              key={fi}
                              fn={fn}
                              tables={tables}
                              onChange={(u) => updateFn(ct.id, fi, u)}
                              onDelete={() => removeFn(ct.id, fi)}
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

export default ContextTypeEditor;
