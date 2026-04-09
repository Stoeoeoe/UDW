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
import { GameVariable, GameVariableType } from '../../../types/schema';
import { EmptyScreen } from '../common/EmptyScreen';

const VARIABLE_TYPES: { value: GameVariableType; label: string; badge: string; color: string }[] = [
  { value: 'boolean', label: 'Boolean', badge: '⊘', color: 'yellow' },
  { value: 'number', label: 'Number', badge: '#', color: 'blue' },
  { value: 'string', label: 'String', badge: 'Aa', color: 'green' },
  { value: 'enum', label: 'Enum', badge: '☰', color: 'purple' },
];

function defaultValueForType(type: GameVariableType): boolean | number | string {
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
  onAdd: (v: GameVariable) => void;
  onUpdate: (key: string, updates: Partial<GameVariable>) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

const VariableListEditor: React.FC<VariableListEditorProps> = ({
  variables,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Stable internal ids so editing the key field doesn't lose focus
  const idMapRef = useRef<Record<string, string>>({});
  const genId = () => `vid_${Math.random().toString(36).slice(2, 9)}`;
  for (const v of variables) {
    if (!idMapRef.current[v.key]) idMapRef.current[v.key] = genId();
  }

  const handleAdd = useCallback(() => {
    const key = `variable_${Date.now()}`;
    const v: GameVariable = {
      key,
      type: 'boolean',
      category: 'Game State',
      defaultValue: false,
    };
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
                            defaultValue: defaultValueForType(newType),
                            enumValues:
                              newType === 'enum'
                                ? v.enumValues?.length
                                  ? v.enumValues
                                  : ['option1', 'option2']
                                : undefined,
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

                  {/* Default value */}
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

const VariableGrid: React.FC<{
  variables: GameVariable[];
}> = ({ variables }) => {
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
                    <Text fontSize="10px" color="gray.600" fontFamily="mono" flexShrink={0}>
                      = {String(v.defaultValue)}
                    </Text>
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

// ─── Main screen ─────────────────────────────────────────────────────────────

export const VariableEditor: React.FC = () => {
  const gameVariables = useEditorStore((state) => state.gameVariables);
  const addGameVariable = useEditorStore((state) => state.addGameVariable);
  const updateGameVariable = useEditorStore((state) => state.updateGameVariable);
  const deleteGameVariable = useEditorStore((state) => state.deleteGameVariable);

  // Collect known categories for datalist autocomplete
  const categories = useMemo(() => {
    const s = new Set<string>();
    gameVariables.forEach((v) => {
      if (v.category) s.add(v.category);
    });
    return Array.from(s).sort();
  }, [gameVariables]);

  const handleMove = useCallback(
    (key: string, direction: -1 | 1) => {
      const idx = gameVariables.findIndex((v) => v.key === key);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= gameVariables.length) return;
      // Keys are identity — swap all other fields between the two entries
      const a = gameVariables[idx];
      const b = gameVariables[newIdx];
      const aData = {
        type: a.type,
        category: a.category,
        description: a.description,
        defaultValue: a.defaultValue,
        enumValues: a.enumValues,
      };
      const bData = {
        type: b.type,
        category: b.category,
        description: b.description,
        defaultValue: b.defaultValue,
        enumValues: b.enumValues,
      };
      updateGameVariable(a.key, bData);
      updateGameVariable(b.key, aData);
    },
    [gameVariables, updateGameVariable],
  );

  const content =
    gameVariables.length === 0 ? (
      <EmptyScreen
        icon="📊"
        title="No Variables"
        description="Define named variables the Lua sandbox exposes at runtime — weather, date, game state flags, and more."
        buttonLabel="Add First Variable"
        onCreate={() =>
          addGameVariable({
            key: 'variable_1',
            type: 'boolean',
            category: 'Game State',
            defaultValue: false,
          })
        }
      />
    ) : (
      <VariableGrid variables={gameVariables} />
    );

  const rightPanel = (
    <Box h="full" overflowY="auto" bg="#05060a">
      {/* Category autocomplete datalist */}
      <datalist id="variable-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <VariableListEditor
        variables={gameVariables}
        onAdd={addGameVariable}
        onUpdate={updateGameVariable}
        onDelete={deleteGameVariable}
        onMove={handleMove}
      />
    </Box>
  );

  return (
    <Flex direction="column" h="full" overflow="hidden">
      {/* Header */}
      <HStack
        px={4}
        h="10"
        bg="#03040a"
        borderBottom="1px"
        borderColor="#071018"
        flexShrink={0}
        spacing={3}
      >
        <Text fontWeight="bold" fontSize="sm" color="white">
          Variables
        </Text>
        <Text fontSize="xs" color="gray.600">
          {gameVariables.length} variable{gameVariables.length !== 1 ? 's' : ''} defined
        </Text>
      </HStack>

      {/* Body: grid left, list editor right */}
      <Flex flex={1} overflow="hidden">
        <Box flex={1} overflow="hidden">
          {content}
        </Box>
        <Box w="320px" flexShrink={0} borderLeft="1px" borderColor="#071018" overflow="hidden">
          {rightPanel}
        </Box>
      </Flex>
    </Flex>
  );
};

export default VariableEditor;
