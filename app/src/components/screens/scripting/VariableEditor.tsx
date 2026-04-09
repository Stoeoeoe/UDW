import React, { useState, useCallback, useMemo, useRef } from 'react';
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
import { AddIcon, DeleteIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  GameVariable,
  GameVariableType,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
} from '../../../types/schema';
import { EmptyScreen } from '../common/EmptyScreen';
import { ConditionEditor } from './ConditionEditor';
import { GlobalFunctionEditor } from './GlobalFunctionEditor';
import { NamespaceEditor } from './NamespaceEditor';
import { ContextTypeEditor } from './ContextTypeEditor';
import { TableEditor } from './TableEditor';

type ScriptingTab = 'variables' | 'tables' | 'functions' | 'namespaces' | 'contexts';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIMITIVE_TYPES: {
  value: 'boolean' | 'number' | 'string' | 'enum';
  label: string;
  badge: string;
  color: string;
}[] = [
  { value: 'boolean', label: 'Boolean', badge: '⊘', color: 'yellow' },
  { value: 'number', label: 'Number', badge: '#', color: 'blue' },
  { value: 'string', label: 'String', badge: 'Aa', color: 'green' },
  { value: 'enum', label: 'Enum', badge: '☰', color: 'purple' },
];

const VARIABLE_TYPES: { value: GameVariableType; label: string; badge: string; color: string }[] = [
  ...PRIMITIVE_TYPES,
  { value: 'table', label: 'Table', badge: '{}', color: 'orange' },
];

function defaultValueForPrimitive(
  type: 'boolean' | 'number' | 'string' | 'enum',
): boolean | number | string {
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

// ─── Variable List Editor ───────────────────────────────────────────────────

interface VariableListEditorProps {
  variables: GameVariable[];
  tables: ScriptTable[];
  onAdd: (v: GameVariable) => void;
  onUpdate: (key: string, updates: Partial<GameVariable>) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

const VariableListEditor: React.FC<VariableListEditorProps> = ({
  variables,
  tables,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const idMapRef = useRef<Record<string, string>>({});
  const genId = () => `vid_${Math.random().toString(36).slice(2, 9)}`;
  for (const v of variables) {
    if (!idMapRef.current[v.key]) idMapRef.current[v.key] = genId();
  }

  const handleAdd = useCallback(() => {
    const key = `variable_${Date.now()}`;
    const v: GameVariable = { key, type: 'boolean', category: 'Game State', defaultValue: false };
    onAdd(v);
    setExpandedKey(key);
  }, [onAdd]);

  return (
    <VStack spacing={0} align="stretch">
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
            Variables
          </Text>
          <Badge fontSize="9px" colorScheme="gray" variant="subtle">
            {variables.length}
          </Badge>
        </HStack>
        <Tooltip label="Add Variable" hasArrow>
          <IconButton
            aria-label="Add Variable"
            icon={<AddIcon fontSize="9px" />}
            size="xs"
            variant="ghost"
            color="gray.400"
            _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
            onClick={handleAdd}
          />
        </Tooltip>
      </Flex>

      {variables.length === 0 && (
        <Box px={3} py={6} textAlign="center">
          <Text fontSize="xs" color="gray.600" fontStyle="italic">
            No variables defined
          </Text>
          <Text fontSize="10px" color="gray.700" mt={1}>
            Click + to add a Lua-exposed variable
          </Text>
        </Box>
      )}

      {variables.map((v, idx) => {
        const isExpanded = expandedKey === v.key;
        const stableId = idMapRef.current[v.key] || genId();
        if (!idMapRef.current[v.key]) idMapRef.current[v.key] = stableId;
        const typeInfo = VARIABLE_TYPES.find((t) => t.value === v.type)!;

        return (
          <Box key={stableId} borderTop="1px" borderColor="whiteAlpha.50">
            {/* Collapsed row */}
            <HStack
              px={3}
              py={1.5}
              spacing={2}
              cursor="pointer"
              _hover={{ bg: 'whiteAlpha.50' }}
              onClick={() => setExpandedKey(isExpanded ? null : v.key)}
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
                {v.key}
              </Text>
              {v.category && (
                <Text fontSize="10px" color="gray.600" noOfLines={1}>
                  {v.category}
                </Text>
              )}
              <Badge fontSize="9px" colorScheme={typeInfo.color} variant="subtle">
                {typeInfo.badge} {v.type}
              </Badge>
              <IconButton
                aria-label="Delete Variable"
                icon={<DeleteIcon fontSize="8px" />}
                size="xs"
                variant="ghost"
                color="gray.700"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                _hover={{ color: 'red.300', bg: 'red.900' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v.key);
                  if (expandedKey === v.key) setExpandedKey(null);
                }}
              />
            </HStack>

            {/* Expanded editor */}
            <Collapse in={isExpanded} animateOpacity>
              <Box px={3} pb={3} pt={2} bg="whiteAlpha.50">
                <VStack spacing={3} align="stretch">
                  {/* Key */}
                  <Box>
                    <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                      KEY (Lua path)
                    </Text>
                    <Input
                      size="xs"
                      bg="#0a0a0b"
                      borderColor="#1a1a2e"
                      color="white"
                      fontFamily="mono"
                      value={v.key}
                      onChange={(e) => {
                        const newKey = e.target.value.replace(/[^a-zA-Z0-9_.]/g, '');
                        const oldId = idMapRef.current[v.key];
                        if (oldId) {
                          idMapRef.current[newKey] = oldId;
                          delete idMapRef.current[v.key];
                        }
                        onUpdate(v.key, { key: newKey });
                        setExpandedKey(newKey);
                      }}
                      placeholder="e.g. weather.isRain"
                    />
                  </Box>

                  {/* Type & Category */}
                  <HStack spacing={3}>
                    <Box flex={1}>
                      <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                        TYPE
                      </Text>
                      <Select
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={v.type}
                        onChange={(e) => {
                          const newType = e.target.value as GameVariableType;
                          onUpdate(v.key, {
                            type: newType,
                            defaultValue:
                              newType === 'table'
                                ? ''
                                : defaultValueForPrimitive(
                                    newType as 'boolean' | 'number' | 'string' | 'enum',
                                  ),
                            enumValues:
                              newType === 'enum'
                                ? v.enumValues?.length
                                  ? v.enumValues
                                  : ['option1', 'option2']
                                : undefined,
                            tableId: newType === 'table' ? (v.tableId ?? undefined) : undefined,
                          });
                        }}
                      >
                        {VARIABLE_TYPES.map((t) => (
                          <option key={t.value} value={t.value} style={{ background: '#0a0a0b' }}>
                            {t.badge} {t.label}
                          </option>
                        ))}
                      </Select>
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                        CATEGORY
                      </Text>
                      <Input
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={v.category}
                        onChange={(e) => onUpdate(v.key, { category: e.target.value })}
                        placeholder="e.g. Weather"
                        list="variable-categories"
                      />
                    </Box>
                  </HStack>

                  {/* Table: select a table definition */}
                  {v.type === 'table' && (
                    <Box>
                      <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                        TABLE TYPE
                      </Text>
                      <Select
                        size="xs"
                        bg="#0a0a0b"
                        borderColor="#1a1a2e"
                        color="white"
                        value={v.tableId ?? ''}
                        onChange={(e) => onUpdate(v.key, { tableId: e.target.value || undefined })}
                      >
                        <option value="" style={{ background: '#0a0a0b' }}>
                          — select a table —
                        </option>
                        {tables.map((t) => (
                          <option key={t.id} value={t.id} style={{ background: '#0a0a0b' }}>
                            {t.name} ({t.fields.length} fields)
                          </option>
                        ))}
                      </Select>
                    </Box>
                  )}

                  {/* Primitive: default value */}
                  {v.type !== 'table' && (
                    <Box>
                      <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                        DEFAULT VALUE
                      </Text>
                      {v.type === 'boolean' && (
                        <Switch
                          size="sm"
                          colorScheme="green"
                          isChecked={!!v.defaultValue}
                          onChange={(e) => onUpdate(v.key, { defaultValue: e.target.checked })}
                        />
                      )}
                      {v.type === 'number' && (
                        <NumberInput
                          size="xs"
                          value={typeof v.defaultValue === 'number' ? v.defaultValue : 0}
                          step={1}
                          onChange={(_, val) =>
                            onUpdate(v.key, { defaultValue: isNaN(val) ? 0 : val })
                          }
                        >
                          <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      )}
                      {v.type === 'string' && (
                        <Input
                          size="xs"
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
                          color="white"
                          value={typeof v.defaultValue === 'string' ? v.defaultValue : ''}
                          onChange={(e) => onUpdate(v.key, { defaultValue: e.target.value })}
                        />
                      )}
                      {v.type === 'enum' && (
                        <Select
                          size="xs"
                          bg="#0a0a0b"
                          borderColor="#1a1a2e"
                          color="white"
                          value={typeof v.defaultValue === 'string' ? v.defaultValue : ''}
                          onChange={(e) => onUpdate(v.key, { defaultValue: e.target.value })}
                        >
                          {(v.enumValues || []).map((opt) => (
                            <option key={opt} value={opt} style={{ background: '#0a0a0b' }}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Box>
                  )}

                  {/* Enum values editor */}
                  {v.type === 'enum' && (
                    <Box>
                      <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold">
                        ENUM VALUES
                      </Text>
                      <VStack spacing={1} align="stretch">
                        {(v.enumValues || []).map((opt, optIdx) => (
                          <HStack key={optIdx} spacing={1}>
                            <Input
                              size="xs"
                              bg="#0a0a0b"
                              borderColor="#1a1a2e"
                              color="white"
                              value={opt}
                              onChange={(e) => {
                                const vals = [...(v.enumValues || [])];
                                vals[optIdx] = e.target.value;
                                onUpdate(v.key, { enumValues: vals });
                              }}
                            />
                            <IconButton
                              aria-label="Remove value"
                              icon={<DeleteIcon fontSize="8px" />}
                              size="xs"
                              variant="ghost"
                              color="gray.600"
                              _hover={{ color: 'red.300' }}
                              onClick={() => {
                                const vals = (v.enumValues || []).filter((_, i) => i !== optIdx);
                                onUpdate(v.key, {
                                  enumValues: vals,
                                  ...(v.defaultValue === opt
                                    ? { defaultValue: vals[0] ?? '' }
                                    : {}),
                                });
                              }}
                            />
                          </HStack>
                        ))}
                        <Button
                          size="xs"
                          variant="ghost"
                          color="gray.500"
                          _hover={{ color: 'white' }}
                          leftIcon={<AddIcon fontSize="8px" />}
                          onClick={() => {
                            const vals = [
                              ...(v.enumValues || []),
                              `value_${(v.enumValues?.length || 0) + 1}`,
                            ];
                            onUpdate(v.key, { enumValues: vals });
                          }}
                        >
                          Add Value
                        </Button>
                      </VStack>
                    </Box>
                  )}

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
                      value={v.description ?? ''}
                      onChange={(e) =>
                        onUpdate(v.key, { description: e.target.value || undefined })
                      }
                      placeholder="Optional — shown in editor UI"
                    />
                  </Box>

                  {/* Reorder */}
                  <HStack spacing={1} justify="flex-end">
                    <Tooltip label="Move Up" hasArrow>
                      <IconButton
                        aria-label="Move Up"
                        icon={<ChevronUpIcon />}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        isDisabled={idx === 0}
                        onClick={() => onMove(v.key, -1)}
                      />
                    </Tooltip>
                    <Tooltip label="Move Down" hasArrow>
                      <IconButton
                        aria-label="Move Down"
                        icon={<ChevronDownIcon />}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        isDisabled={idx === variables.length - 1}
                        onClick={() => onMove(v.key, 1)}
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

// ─── Group summary grid ──────────────────────────────────────────────────────

const VariableGrid: React.FC<{ variables: GameVariable[] }> = ({ variables }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, GameVariable[]> = {};
    for (const v of variables) {
      const cat = v.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(v);
    }
    return groups;
  }, [variables]);

  const categories = Object.keys(grouped).sort();

  return (
    <Box p={6} overflowY="auto" h="full">
      <VStack spacing={6} align="stretch" maxW="800px" mx="auto">
        {categories.map((cat) => (
          <Box key={cat}>
            <HStack spacing={2} mb={3}>
              <Text
                fontSize="xs"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                {cat}
              </Text>
              <Badge fontSize="9px" colorScheme="gray" variant="subtle">
                {grouped[cat].length}
              </Badge>
            </HStack>
            <VStack align="stretch" spacing={1}>
              {grouped[cat].map((v) => {
                const typeInfo = VARIABLE_TYPES.find((t) => t.value === v.type)!;
                return (
                  <HStack
                    key={v.key}
                    px={3}
                    py={2}
                    bg="#0a0a0b"
                    borderWidth="1px"
                    borderColor="#1a1a2e"
                    borderRadius="md"
                    spacing={3}
                    align="flex-start"
                  >
                    <Text fontSize="xs" fontFamily="mono" color="gray.200" flex={1}>
                      {v.key}
                    </Text>
                    <Badge
                      fontSize="9px"
                      colorScheme={typeInfo.color}
                      variant="subtle"
                      flexShrink={0}
                    >
                      {typeInfo.badge} {v.type}
                    </Badge>
                    {v.type === 'enum' && v.enumValues && (
                      <Text fontSize="10px" color="gray.600" noOfLines={1} maxW="160px">
                        {v.enumValues.join(', ')}
                      </Text>
                    )}
                    {v.type === 'table' && v.tableId && (
                      <Text fontSize="10px" color="gray.600" noOfLines={1} maxW="200px">
                        table ref
                      </Text>
                    )}
                    {v.type !== 'table' && (
                      <Text fontSize="10px" color="gray.600" fontFamily="mono" flexShrink={0}>
                        = {String(v.defaultValue)}
                      </Text>
                    )}
                  </HStack>
                );
              })}
            </VStack>
          </Box>
        ))}
      </VStack>
    </Box>
  );
};

// ─── Script Tester ───────────────────────────────────────────────────────────

const ScriptTester: React.FC<{
  variables: GameVariable[];
  tables: ScriptTable[];
  functions: ScriptFunction[];
  namespaces: ScriptNamespace[];
  contextTypes: ScriptContextType[];
}> = ({ variables, tables, functions, namespaces, contextTypes }) => {
  const [expr, setExpr] = useState('');
  const [open, setOpen] = useState(true);
  const [selectedContext, setSelectedContext] = useState<string | ''>('');

  const activeContext = contextTypes.find((ct) => ct.id === selectedContext);

  return (
    <Box borderTop="1px" borderColor="#071018" bg="#03040a" flexShrink={0}>
      <HStack
        px={3}
        py={1.5}
        cursor="pointer"
        onClick={() => setOpen((o) => !o)}
        _hover={{ bg: 'whiteAlpha.50' }}
        spacing={2}
      >
        <Text
          fontSize="9px"
          fontWeight="bold"
          textTransform="uppercase"
          letterSpacing="wider"
          color="gray.500"
          flex={1}
        >
          Script Tester
        </Text>
        {open ? <ChevronUpIcon color="gray.600" /> : <ChevronDownIcon color="gray.600" />}
      </HStack>
      <Collapse in={open} animateOpacity>
        <Box px={3} pb={3} pt={1}>
          {contextTypes.length > 0 && (
            <HStack mb={2} spacing={2}>
              <Text fontSize="9px" color="gray.500" fontWeight="bold">
                CONTEXT:
              </Text>
              <Select
                size="xs"
                bg="#0a0a0b"
                borderColor="#1a1a2e"
                color="white"
                w="140px"
                value={selectedContext}
                onChange={(e) => setSelectedContext(e.target.value)}
              >
                <option value="" style={{ background: '#0a0a0b' }}>
                  — none —
                </option>
                {contextTypes.map((ct) => (
                  <option key={ct.id} value={ct.id} style={{ background: '#0a0a0b' }}>
                    self ({ct.name})
                  </option>
                ))}
              </Select>
            </HStack>
          )}
          <ConditionEditor
            value={expr}
            onChange={setExpr}
            variables={variables}
            tables={tables}
            functions={functions}
            namespaces={namespaces}
            activeContextType={activeContext}
          />
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Tab button ─────────────────────────────────────────────────────────────

const TAB_DEFS: {
  id: ScriptingTab;
  label: string;
  badge: (s: ReturnType<typeof useScriptingState>) => number;
}[] = [
  { id: 'variables', label: 'Variables', badge: (s) => s.gameVariables.length },
  { id: 'tables', label: 'Tables', badge: (s) => s.scriptTables.length },
  { id: 'functions', label: 'Functions', badge: (s) => s.scriptFunctions.length },
  { id: 'namespaces', label: 'Namespaces', badge: (s) => s.scriptNamespaces.length },
  { id: 'contexts', label: 'Contexts', badge: (s) => s.scriptContextTypes.length },
];

function useScriptingState() {
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const addGameVariable = useEditorStore((s) => s.addGameVariable);
  const updateGameVariable = useEditorStore((s) => s.updateGameVariable);
  const deleteGameVariable = useEditorStore((s) => s.deleteGameVariable);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const addScriptTable = useEditorStore((s) => s.addScriptTable);
  const updateScriptTable = useEditorStore((s) => s.updateScriptTable);
  const deleteScriptTable = useEditorStore((s) => s.deleteScriptTable);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const addScriptFunction = useEditorStore((s) => s.addScriptFunction);
  const updateScriptFunction = useEditorStore((s) => s.updateScriptFunction);
  const deleteScriptFunction = useEditorStore((s) => s.deleteScriptFunction);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  const addScriptNamespace = useEditorStore((s) => s.addScriptNamespace);
  const updateScriptNamespace = useEditorStore((s) => s.updateScriptNamespace);
  const deleteScriptNamespace = useEditorStore((s) => s.deleteScriptNamespace);
  const scriptContextTypes = useEditorStore((s) => s.scriptContextTypes);
  const addScriptContextType = useEditorStore((s) => s.addScriptContextType);
  const updateScriptContextType = useEditorStore((s) => s.updateScriptContextType);
  const deleteScriptContextType = useEditorStore((s) => s.deleteScriptContextType);
  return {
    gameVariables,
    addGameVariable,
    updateGameVariable,
    deleteGameVariable,
    scriptTables,
    addScriptTable,
    updateScriptTable,
    deleteScriptTable,
    scriptFunctions,
    addScriptFunction,
    updateScriptFunction,
    deleteScriptFunction,
    scriptNamespaces,
    addScriptNamespace,
    updateScriptNamespace,
    deleteScriptNamespace,
    scriptContextTypes,
    addScriptContextType,
    updateScriptContextType,
    deleteScriptContextType,
  };
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export const VariableEditor: React.FC = () => {
  const s = useScriptingState();
  const [activeTab, setActiveTab] = useState<ScriptingTab>('variables');

  const categories = useMemo(() => {
    const set = new Set<string>();
    s.gameVariables.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return Array.from(set).sort();
  }, [s.gameVariables]);

  const handleMove = useCallback(
    (key: string, direction: -1 | 1) => {
      const idx = s.gameVariables.findIndex((v) => v.key === key);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= s.gameVariables.length) return;
      const a = s.gameVariables[idx];
      const b = s.gameVariables[newIdx];
      const aData = {
        type: a.type,
        category: a.category,
        description: a.description,
        defaultValue: a.defaultValue,
        enumValues: a.enumValues,
        tableId: a.tableId,
      };
      const bData = {
        type: b.type,
        category: b.category,
        description: b.description,
        defaultValue: b.defaultValue,
        enumValues: b.enumValues,
        tableId: b.tableId,
      };
      s.updateGameVariable(a.key, bData);
      s.updateGameVariable(b.key, aData);
    },
    [s.gameVariables, s.updateGameVariable],
  );

  // Left panel content depends on active tab
  const mainContent = useMemo(() => {
    switch (activeTab) {
      case 'variables':
        return s.gameVariables.length === 0 ? (
          <EmptyScreen
            icon="📊"
            title="No Variables"
            description="Define named variables the Lua sandbox exposes at runtime."
            buttonLabel="Add First Variable"
            onCreate={() =>
              s.addGameVariable({
                key: 'variable_1',
                type: 'boolean',
                category: 'Game State',
                defaultValue: false,
              })
            }
          />
        ) : (
          <VariableGrid variables={s.gameVariables} />
        );
      case 'tables':
        return s.scriptTables.length === 0 ? (
          <EmptyScreen
            icon="{}"
            title="No Tables"
            description="Define reusable table structures that can be referenced as a type in variables, namespaces, and contexts."
            buttonLabel="Add First Table"
            onCreate={() =>
              s.addScriptTable({ id: `tbl_${Date.now()}`, name: 'table', fields: [] })
            }
          />
        ) : (
          <TableGrid tables={s.scriptTables} />
        );
      case 'functions':
        return s.scriptFunctions.length === 0 ? (
          <EmptyScreen
            icon="⚡"
            title="No Global Functions"
            description="Define functions callable anywhere in the Lua sandbox (e.g. wait, setFlag)."
            buttonLabel="Add First Function"
            onCreate={() =>
              s.addScriptFunction({
                id: `fn_${Date.now()}`,
                name: 'newFunction',
                params: [],
                returnType: 'void',
              })
            }
          />
        ) : (
          <FunctionGrid functions={s.scriptFunctions} tables={s.scriptTables} />
        );
      case 'namespaces':
        return s.scriptNamespaces.length === 0 ? (
          <EmptyScreen
            icon="📦"
            title="No Namespaces"
            description="Define singleton table-like objects (e.g. weather, camera, audio)."
            buttonLabel="Add First Namespace"
            onCreate={() =>
              s.addScriptNamespace({
                id: `ns_${Date.now()}`,
                name: 'namespace',
                fields: [],
                functions: [],
              })
            }
          />
        ) : (
          <NamespaceGrid namespaces={s.scriptNamespaces} tables={s.scriptTables} />
        );
      case 'contexts':
        return s.scriptContextTypes.length === 0 ? (
          <EmptyScreen
            icon="🎭"
            title="No Context Types"
            description="Define the shape of 'self' for script execution contexts (e.g. npc, cutscene)."
            buttonLabel="Add First Context Type"
            onCreate={() =>
              s.addScriptContextType({
                id: `ctx_${Date.now()}`,
                name: 'context',
                fields: [],
                functions: [],
              })
            }
          />
        ) : (
          <ContextGrid contextTypes={s.scriptContextTypes} tables={s.scriptTables} />
        );
    }
  }, [activeTab, s]);

  // Right panel editor depends on active tab
  const sidebarContent = useMemo(() => {
    switch (activeTab) {
      case 'variables':
        return (
          <>
            <datalist id="variable-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <VariableListEditor
              variables={s.gameVariables}
              tables={s.scriptTables}
              onAdd={s.addGameVariable}
              onUpdate={s.updateGameVariable}
              onDelete={s.deleteGameVariable}
              onMove={handleMove}
            />
          </>
        );
      case 'tables':
        return (
          <TableEditor
            tables={s.scriptTables}
            onAdd={s.addScriptTable}
            onUpdate={s.updateScriptTable}
            onDelete={s.deleteScriptTable}
          />
        );
      case 'functions':
        return (
          <GlobalFunctionEditor
            functions={s.scriptFunctions}
            tables={s.scriptTables}
            onAdd={s.addScriptFunction}
            onUpdate={s.updateScriptFunction}
            onDelete={s.deleteScriptFunction}
          />
        );
      case 'namespaces':
        return (
          <NamespaceEditor
            namespaces={s.scriptNamespaces}
            tables={s.scriptTables}
            onAdd={s.addScriptNamespace}
            onUpdate={s.updateScriptNamespace}
            onDelete={s.deleteScriptNamespace}
          />
        );
      case 'contexts':
        return (
          <ContextTypeEditor
            contextTypes={s.scriptContextTypes}
            tables={s.scriptTables}
            onAdd={s.addScriptContextType}
            onUpdate={s.updateScriptContextType}
            onDelete={s.deleteScriptContextType}
          />
        );
    }
  }, [activeTab, s, categories, handleMove]);

  return (
    <Flex direction="column" h="full" overflow="hidden">
      {/* Header with tabs */}
      <HStack
        px={4}
        h="10"
        bg="#03040a"
        borderBottom="1px"
        borderColor="#071018"
        flexShrink={0}
        spacing={1}
      >
        <Text fontWeight="bold" fontSize="sm" color="white" mr={3}>
          Scripting
        </Text>
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.badge(s);
          return (
            <Button
              key={tab.id}
              size="xs"
              variant="ghost"
              color={isActive ? 'blue.300' : 'gray.500'}
              bg={isActive ? 'whiteAlpha.100' : 'transparent'}
              _hover={{ bg: 'whiteAlpha.100', color: isActive ? 'blue.300' : 'gray.300' }}
              onClick={() => setActiveTab(tab.id)}
              px={2}
              h="6"
              fontSize="11px"
              fontWeight={isActive ? 'bold' : 'medium'}
            >
              {tab.label}
              {count > 0 && (
                <Badge
                  ml={1}
                  fontSize="9px"
                  colorScheme={isActive ? 'blue' : 'gray'}
                  variant="subtle"
                >
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </HStack>

      {/* Body */}
      <Flex flex={1} overflow="hidden">
        {/* Main panel + script tester */}
        <Flex flex={1} direction="column" overflow="hidden">
          <Box flex={1} overflow="hidden">
            {mainContent}
          </Box>
          <ScriptTester
            variables={s.gameVariables}
            tables={s.scriptTables}
            functions={s.scriptFunctions}
            namespaces={s.scriptNamespaces}
            contextTypes={s.scriptContextTypes}
          />
        </Flex>

        {/* Right sidebar */}
        <Box
          w="320px"
          flexShrink={0}
          borderLeft="1px"
          borderColor="#071018"
          overflowY="auto"
          bg="#05060a"
        >
          {sidebarContent}
        </Box>
      </Flex>
    </Flex>
  );
};

export default VariableEditor;

// ─── Summary grids for non-variable tabs ────────────────────────────────────

const TableGrid: React.FC<{ tables: import('../../../types/schema').ScriptTable[] }> = ({
  tables,
}) => (
  <Box p={6} overflowY="auto" h="full">
    <VStack spacing={4} align="stretch" maxW="800px" mx="auto">
      {tables.map((tbl) => (
        <Box key={tbl.id}>
          <HStack spacing={2} mb={2}>
            <Text
              fontSize="xs"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="wider"
              color="gray.500"
            >
              {tbl.name}
            </Text>
            <Badge fontSize="9px" colorScheme="orange" variant="subtle">
              {tbl.fields.length} fields
            </Badge>
          </HStack>
          {tbl.description && (
            <Text fontSize="10px" color="gray.600" mb={2}>
              {tbl.description}
            </Text>
          )}
          <VStack align="stretch" spacing={1}>
            {tbl.fields.map((f) => (
              <HStack
                key={f.key}
                px={3}
                py={1}
                bg="#0a0a0b"
                borderWidth="1px"
                borderColor="#1a1a2e"
                borderRadius="md"
                spacing={3}
              >
                <Text fontSize="10px" fontFamily="mono" color="gray.400" flex={1}>
                  {f.key}
                </Text>
                <Badge fontSize="9px" colorScheme="blue" variant="subtle">
                  {f.type}
                </Badge>
                <Text fontSize="10px" color="gray.600" fontFamily="mono">
                  = {String(f.defaultValue)}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  </Box>
);

const getFunctionReturnLabel = (
  fn: import('../../../types/schema').ScriptFunction,
  tables: import('../../../types/schema').ScriptTable[],
): string => {
  if (fn.returnType !== 'table') return fn.returnType;
  if (!fn.returnTableId) return 'table';
  const table = tables.find((t) => t.id === fn.returnTableId);
  return `table:${table?.name ?? '?'}`;
};

const FunctionGrid: React.FC<{
  functions: import('../../../types/schema').ScriptFunction[];
  tables: import('../../../types/schema').ScriptTable[];
}> = ({ functions, tables }) => (
  <Box p={6} overflowY="auto" h="full">
    <VStack spacing={1} align="stretch" maxW="800px" mx="auto">
      {functions.map((fn) => (
        <HStack
          key={fn.id}
          px={3}
          py={2}
          bg="#0a0a0b"
          borderWidth="1px"
          borderColor="#1a1a2e"
          borderRadius="md"
          spacing={3}
        >
          <Text fontSize="xs" fontFamily="mono" color="gray.200" flex={1}>
            {fn.name}({fn.params.map((p) => p.name).join(', ')})
          </Text>
          <Badge fontSize="9px" colorScheme="teal" variant="subtle">
            {getFunctionReturnLabel(fn, tables)}
          </Badge>
          {fn.description && (
            <Text fontSize="10px" color="gray.600" noOfLines={1} maxW="200px">
              {fn.description}
            </Text>
          )}
        </HStack>
      ))}
    </VStack>
  </Box>
);

const NamespaceGrid: React.FC<{
  namespaces: import('../../../types/schema').ScriptNamespace[];
  tables: import('../../../types/schema').ScriptTable[];
}> = ({ namespaces, tables }) => (
  <Box p={6} overflowY="auto" h="full">
    <VStack spacing={4} align="stretch" maxW="800px" mx="auto">
      {namespaces.map((ns) => (
        <Box key={ns.id}>
          <HStack spacing={2} mb={2}>
            <Text
              fontSize="xs"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="wider"
              color="gray.500"
            >
              {ns.name}
            </Text>
            <Badge fontSize="9px" colorScheme="cyan" variant="subtle">
              {ns.fields.length} fields, {ns.functions.length} functions
            </Badge>
          </HStack>
          <VStack align="stretch" spacing={1}>
            {ns.fields.map((f) => (
              <HStack
                key={f.key}
                px={3}
                py={1}
                bg="#0a0a0b"
                borderWidth="1px"
                borderColor="#1a1a2e"
                borderRadius="md"
              >
                <Text fontSize="10px" fontFamily="mono" color="gray.400">
                  {ns.name}.{f.key}
                </Text>
                <Badge fontSize="9px" colorScheme="blue" variant="subtle">
                  {f.type}
                </Badge>
              </HStack>
            ))}
            {ns.functions.map((fn) => (
              <HStack
                key={fn.id}
                px={3}
                py={1}
                bg="#0a0a0b"
                borderWidth="1px"
                borderColor="#1a1a2e"
                borderRadius="md"
              >
                <Text fontSize="10px" fontFamily="mono" color="gray.400">
                  {ns.name}.{fn.name}({fn.params.map((p) => p.name).join(', ')})
                </Text>
                <Badge fontSize="9px" colorScheme="teal" variant="subtle">
                  {getFunctionReturnLabel(fn, tables)}
                </Badge>
              </HStack>
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  </Box>
);

const ContextGrid: React.FC<{
  contextTypes: import('../../../types/schema').ScriptContextType[];
  tables: import('../../../types/schema').ScriptTable[];
}> = ({ contextTypes, tables }) => (
  <Box p={6} overflowY="auto" h="full">
    <VStack spacing={4} align="stretch" maxW="800px" mx="auto">
      {contextTypes.map((ct) => (
        <Box key={ct.id}>
          <HStack spacing={2} mb={2}>
            <Text
              fontSize="xs"
              fontWeight="black"
              textTransform="uppercase"
              letterSpacing="wider"
              color="gray.500"
            >
              self ({ct.name})
            </Text>
            <Badge fontSize="9px" colorScheme="orange" variant="subtle">
              {ct.fields.length} fields, {ct.functions.length} functions
            </Badge>
          </HStack>
          {ct.description && (
            <Text fontSize="10px" color="gray.600" mb={2}>
              {ct.description}
            </Text>
          )}
          <VStack align="stretch" spacing={1}>
            {ct.fields.map((f) => (
              <HStack
                key={f.key}
                px={3}
                py={1}
                bg="#0a0a0b"
                borderWidth="1px"
                borderColor="#1a1a2e"
                borderRadius="md"
              >
                <Text fontSize="10px" fontFamily="mono" color="gray.400">
                  self.{f.key}
                </Text>
                <Badge fontSize="9px" colorScheme="blue" variant="subtle">
                  {f.type}
                </Badge>
              </HStack>
            ))}
            {ct.functions.map((fn) => (
              <HStack
                key={fn.id}
                px={3}
                py={1}
                bg="#0a0a0b"
                borderWidth="1px"
                borderColor="#1a1a2e"
                borderRadius="md"
              >
                <Text fontSize="10px" fontFamily="mono" color="gray.400">
                  self:{fn.name}({fn.params.map((p) => p.name).join(', ')})
                </Text>
                <Badge fontSize="9px" colorScheme="teal" variant="subtle">
                  {getFunctionReturnLabel(fn, tables)}
                </Badge>
              </HStack>
            ))}
          </VStack>
        </Box>
      ))}
    </VStack>
  </Box>
);
