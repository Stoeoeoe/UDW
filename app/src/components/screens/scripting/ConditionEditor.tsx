/**
 * ConditionEditor — Lua condition widget backed by @uiw/react-codemirror.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  Button,
  Badge,
  Tooltip,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Input,
} from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import {
  autocompletion,
  completionStatus,
  startCompletion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import {
  GameVariable,
  ScriptTable,
  TableField,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
  ScriptPrimitiveType,
} from '../../../types/schema';
import { evalLuaCondition } from '../../../lib/luaRunner';
import { Prec } from '@codemirror/state';
import { LUA_STDLIB_COMPLETIONS } from '../../../config/luaStandardLibrary';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestValue {
  path: string;
  value: unknown;
}

interface FunctionMock {
  path: string; // e.g. "wait", "weather.getHoursOfDay", "self:move"
  returnValue: unknown;
  returnType: ScriptPrimitiveType;
  returnTableId?: string;
}

type FieldType = {
  type: 'boolean' | 'number' | 'string' | 'enum';
  enumValues?: string[];
};

export interface ConditionEditorProps {
  value: string;
  onChange: (expr: string) => void;
  variables: GameVariable[];
  tables?: ScriptTable[];
  functions?: ScriptFunction[];
  namespaces?: ScriptNamespace[];
  activeContextType?: ScriptContextType;
  label?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandPaths(variables: GameVariable[], tables?: ScriptTable[]): string[] {
  const paths: string[] = [];
  for (const v of variables) {
    if (v.type === 'table') {
      // Resolve fields from table reference or legacy complexFields
      const tbl = v.tableId && tables ? tables.find((t) => t.id === v.tableId) : undefined;
      const fields = tbl?.fields ?? v.complexFields ?? [];
      for (const f of fields) paths.push(`${v.key}.${f.key}`);
    } else {
      paths.push(v.key);
    }
  }
  return paths;
}

function effectiveDefault(
  v: GameVariable | { type: string; defaultValue: unknown; enumValues?: string[] },
): unknown {
  if (v.type === 'table') return null;
  if (v.type === 'enum' && (!v.defaultValue || v.defaultValue === '') && v.enumValues?.length) {
    return v.enumValues[0];
  }
  return v.defaultValue;
}

function effectiveFieldDefault(f: {
  type: string;
  defaultValue: unknown;
  enumValues?: string[];
}): unknown {
  if (f.type === 'enum' && (!f.defaultValue || f.defaultValue === '') && f.enumValues?.length) {
    return f.enumValues[0];
  }
  return f.defaultValue;
}

function buildDefaultTestValues(variables: GameVariable[], tables?: ScriptTable[]): TestValue[] {
  const out: TestValue[] = [];
  for (const v of variables) {
    if (v.type === 'table') {
      const tbl = v.tableId && tables ? tables.find((t) => t.id === v.tableId) : undefined;
      const fields = tbl?.fields ?? v.complexFields ?? [];
      for (const f of fields)
        out.push({ path: `${v.key}.${f.key}`, value: effectiveFieldDefault(f) });
    } else {
      out.push({ path: v.key, value: effectiveDefault(v) });
    }
  }
  return out;
}

function buildContextTestValues(ct: ScriptContextType): TestValue[] {
  return ct.fields.map((f) => ({
    path: `self.${f.key}`,
    value: effectiveDefault(f),
  }));
}

function buildNamespaceTestValues(namespaces: ScriptNamespace[]): TestValue[] {
  const out: TestValue[] = [];
  for (const ns of namespaces) {
    for (const f of ns.fields) {
      out.push({ path: `${ns.name}.${f.key}`, value: effectiveDefault(f) });
    }
  }
  return out;
}

function defaultForTableField(field: TableField): unknown {
  if (field.type === 'boolean') return false;
  if (field.type === 'number') return 0;
  if (field.type === 'enum') return field.enumValues?.[0] ?? '';
  return '';
}

function buildDefaultTableValue(
  returnTableId: string | undefined,
  tables: ScriptTable[],
): Record<string, unknown> {
  if (!returnTableId) return {};
  const tbl = tables.find((t) => t.id === returnTableId);
  if (!tbl) return {};
  const out: Record<string, unknown> = {};
  for (const field of tbl.fields) {
    out[field.key] = defaultForTableField(field);
  }
  return out;
}

function defaultForReturnType(
  type: ScriptPrimitiveType,
  returnTableId: string | undefined,
  tables: ScriptTable[],
): unknown {
  if (type === 'boolean') return false;
  if (type === 'number') return 0;
  if (type === 'string') return '';
  if (type === 'table') return buildDefaultTableValue(returnTableId, tables);
  return null; // void
}

function buildFunctionMocks(
  functions: ScriptFunction[],
  namespaces: ScriptNamespace[],
  tables: ScriptTable[],
  contextType?: ScriptContextType,
): FunctionMock[] {
  const out: FunctionMock[] = [];
  for (const fn of functions) {
    if (fn.returnType !== 'void') {
      out.push({
        path: fn.name,
        returnValue: defaultForReturnType(fn.returnType, fn.returnTableId, tables),
        returnType: fn.returnType,
        returnTableId: fn.returnTableId,
      });
    }
  }
  for (const ns of namespaces) {
    for (const fn of ns.functions) {
      if (fn.returnType !== 'void') {
        out.push({
          path: `${ns.name}.${fn.name}`,
          returnValue: defaultForReturnType(fn.returnType, fn.returnTableId, tables),
          returnType: fn.returnType,
          returnTableId: fn.returnTableId,
        });
      }
    }
  }
  if (contextType) {
    for (const fn of contextType.functions) {
      if (fn.returnType !== 'void') {
        out.push({
          path: `self:${fn.name}`,
          returnValue: defaultForReturnType(fn.returnType, fn.returnTableId, tables),
          returnType: fn.returnType,
          returnTableId: fn.returnTableId,
        });
      }
    }
  }
  return out;
}

function getFieldType(
  path: string,
  variables: GameVariable[],
  namespaces?: ScriptNamespace[],
  contextType?: ScriptContextType,
  tables?: ScriptTable[],
): { type: 'boolean' | 'number' | 'string' | 'enum'; enumValues?: string[] } {
  for (const v of variables) {
    if (v.type === 'table') {
      const tbl = v.tableId && tables ? tables.find((t) => t.id === v.tableId) : undefined;
      const fields = tbl?.fields ?? v.complexFields ?? [];
      for (const f of fields) {
        if (`${v.key}.${f.key}` === path) return { type: f.type, enumValues: f.enumValues };
      }
    } else if (v.key === path) {
      const t = v.type === 'number' ? 'number' : (v.type as 'boolean' | 'string' | 'enum');
      return { type: t, enumValues: v.enumValues };
    }
  }
  // Check namespace fields (e.g. "weather.temperature")
  if (namespaces) {
    for (const ns of namespaces) {
      for (const f of ns.fields) {
        if (`${ns.name}.${f.key}` === path) {
          const t = f.type === 'number' ? 'number' : (f.type as 'boolean' | 'string' | 'enum');
          return { type: t, enumValues: f.enumValues };
        }
      }
    }
  }
  // Check context fields (e.g. "self.name")
  if (contextType) {
    for (const f of contextType.fields) {
      if (`self.${f.key}` === path) {
        const t = f.type === 'number' ? 'number' : (f.type as 'boolean' | 'string' | 'enum');
        return { type: t, enumValues: f.enumValues };
      }
    }
  }
  return { type: 'string' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function functionReturnDetail(fn: ScriptFunction, tables: ScriptTable[]): string {
  const args = fn.params.map((p) => p.name).join(', ');
  if (fn.returnType === 'table') {
    const tableName = fn.returnTableId
      ? (tables.find((t) => t.id === fn.returnTableId)?.name ?? 'table')
      : 'table';
    return `${fn.name}(${args}) -> ${tableName}`;
  }
  return `${fn.name}(${args})`;
}

function formatResult(value: unknown): string {
  if (value === undefined || value === null) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '{...}';
    }
  }
  return String(value);
}

function resultColorScheme(value: unknown): string {
  if (value === true) return 'green';
  if (value === false) return 'yellow';
  return 'blue';
}

// ─── Test panel ───────────────────────────────────────────────────────────────

/** Renders a single test value row with type-appropriate control */
const TestValueRow: React.FC<{
  path: string;
  value: unknown;
  fieldType: FieldType;
  onChange: (path: string, value: unknown) => void;
}> = ({ path, value, fieldType, onChange }) => {
  const { type, enumValues } = fieldType;
  return (
    <HStack spacing={2} minH="22px">
      <Text fontSize="10px" fontFamily="mono" color="gray.400" flex={1} noOfLines={1} title={path}>
        {path}
      </Text>
      {type === 'boolean' && (
        <Switch
          size="sm"
          colorScheme="green"
          isChecked={!!value}
          onChange={(e) => onChange(path, e.target.checked)}
        />
      )}
      {type === 'number' && (
        <NumberInput
          size="xs"
          value={typeof value === 'number' ? value : 0}
          step={1}
          w="80px"
          onChange={(_, val) => onChange(path, isNaN(val) ? 0 : val)}
        >
          <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      )}
      {type === 'string' && (
        <Input
          size="xs"
          bg="#0a0a0b"
          borderColor="#1a1a2e"
          color="white"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(path, e.target.value)}
          w="120px"
        />
      )}
      {type === 'enum' && (
        <Select
          size="xs"
          bg="#0a0a0b"
          borderColor="#1a1a2e"
          color="white"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(path, e.target.value)}
          w="120px"
        >
          {(enumValues || []).map((opt) => (
            <option key={opt} value={opt} style={{ background: '#0a0a0b' }}>
              {opt}
            </option>
          ))}
        </Select>
      )}
    </HStack>
  );
};

/** Renders a function mock row — simplified to just return type */
const FnMockRow: React.FC<{
  mock: FunctionMock;
  tables: ScriptTable[];
  onChange: (path: string, value: unknown) => void;
}> = ({ mock, tables, onChange }) => {
  const { path, returnValue, returnType, returnTableId } = mock;
  const returnTable = returnTableId ? tables.find((t) => t.id === returnTableId) : undefined;
  const tableValue = isRecord(returnValue) ? returnValue : {};

  const updateTableField = (field: TableField, value: unknown) => {
    onChange(path, {
      ...tableValue,
      [field.key]: value,
    });
  };

  return (
    <VStack spacing={1} align="stretch">
      <HStack spacing={2} minH="22px">
        <Text
          fontSize="10px"
          fontFamily="mono"
          color="cyan.600"
          flex={1}
          noOfLines={1}
          title={path}
        >
          {path}()
        </Text>
        <Badge fontSize="8px" colorScheme="gray" variant="subtle" flexShrink={0}>
          returns
        </Badge>
        {returnType === 'boolean' && (
          <Switch
            size="sm"
            colorScheme="green"
            isChecked={!!returnValue}
            onChange={(e) => onChange(path, e.target.checked)}
          />
        )}
        {returnType === 'number' && (
          <NumberInput
            size="xs"
            value={typeof returnValue === 'number' ? returnValue : 0}
            step={1}
            w="80px"
            onChange={(_, val) => onChange(path, isNaN(val) ? 0 : val)}
          >
            <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        )}
        {returnType === 'string' && (
          <Input
            size="xs"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={typeof returnValue === 'string' ? returnValue : ''}
            onChange={(e) => onChange(path, e.target.value)}
            w="120px"
          />
        )}
      </HStack>

      {returnType === 'table' && (
        <Box pl={3} borderLeft="1px" borderColor="whiteAlpha.200">
          {!returnTable && (
            <Text fontSize="10px" color="gray.600" fontStyle="italic">
              No return table selected
            </Text>
          )}
          {returnTable && (
            <VStack spacing={1} align="stretch">
              <Text fontSize="9px" color="gray.500">
                {returnTable.name}
              </Text>
              {returnTable.fields.map((field) => {
                const fieldValue = tableValue[field.key] ?? defaultForTableField(field);
                return (
                  <TestValueRow
                    key={`${path}:${field.key}`}
                    path={`${path}().${field.key}`}
                    value={fieldValue}
                    fieldType={{ type: field.type, enumValues: field.enumValues }}
                    onChange={(_, val) => updateTableField(field, val)}
                  />
                );
              })}
            </VStack>
          )}
        </Box>
      )}
    </VStack>
  );
};

const TestPanel: React.FC<{
  testValues: TestValue[];
  contextTestValues: TestValue[];
  nsTestValues: TestValue[];
  fnMocks: FunctionMock[];
  onChangeValue: (path: string, value: unknown) => void;
  onChangeMock: (path: string, value: unknown) => void;
  variables: GameVariable[];
  tables: ScriptTable[];
  namespaces: ScriptNamespace[];
  contextType?: ScriptContextType;
}> = ({
  testValues,
  contextTestValues,
  nsTestValues,
  fnMocks,
  onChangeValue,
  onChangeMock,
  variables,
  tables,
  namespaces,
  contextType,
}) => {
  const allEmpty =
    testValues.length === 0 &&
    contextTestValues.length === 0 &&
    nsTestValues.length === 0 &&
    fnMocks.length === 0;
  if (allEmpty) {
    return (
      <Text fontSize="10px" color="gray.600" fontStyle="italic">
        No symbols defined.
      </Text>
    );
  }
  return (
    <VStack spacing={3} align="stretch">
      {/* Variables */}
      {testValues.length > 0 && (
        <Box>
          <Text fontSize="8px" color="gray.600" fontWeight="bold" textTransform="uppercase" mb={1}>
            Variables
          </Text>
          <VStack spacing={1} align="stretch">
            {testValues.map(({ path, value }) => (
              <TestValueRow
                key={path}
                path={path}
                value={value}
                fieldType={getFieldType(path, variables, namespaces, contextType, tables)}
                onChange={onChangeValue}
              />
            ))}
          </VStack>
        </Box>
      )}
      {/* Context fields (self.*) */}
      {contextTestValues.length > 0 && (
        <Box>
          <Text fontSize="8px" color="gray.600" fontWeight="bold" textTransform="uppercase" mb={1}>
            Context (self)
          </Text>
          <VStack spacing={1} align="stretch">
            {contextTestValues.map(({ path, value }) => (
              <TestValueRow
                key={path}
                path={path}
                value={value}
                fieldType={getFieldType(path, variables, namespaces, contextType, tables)}
                onChange={onChangeValue}
              />
            ))}
          </VStack>
        </Box>
      )}
      {/* Namespace fields */}
      {nsTestValues.length > 0 && (
        <Box>
          <Text fontSize="8px" color="gray.600" fontWeight="bold" textTransform="uppercase" mb={1}>
            Namespaces
          </Text>
          <VStack spacing={1} align="stretch">
            {nsTestValues.map(({ path, value }) => (
              <TestValueRow
                key={path}
                path={path}
                value={value}
                fieldType={getFieldType(path, variables, namespaces, contextType, tables)}
                onChange={onChangeValue}
              />
            ))}
          </VStack>
        </Box>
      )}
      {/* Function mocks */}
      {fnMocks.length > 0 && (
        <Box>
          <Text fontSize="8px" color="gray.600" fontWeight="bold" textTransform="uppercase" mb={1}>
            Function Return Mocks
          </Text>
          <VStack spacing={1} align="stretch">
            {fnMocks.map((m) => (
              <FnMockRow key={m.path} mock={m} tables={tables} onChange={onChangeMock} />
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const ConditionEditor: React.FC<ConditionEditorProps> = ({
  value,
  onChange,
  variables,
  tables = [],
  functions = [],
  namespaces = [],
  activeContextType,
  label,
}) => {
  const [showAdvancedStdlib, setShowAdvancedStdlib] = useState(false);

  const allCompletions = useMemo(() => {
    const items: { label: string; type: string; detail?: string }[] = [];

    // Variables
    for (const p of expandPaths(variables, tables)) {
      items.push({ label: p, type: 'variable' });
    }

    // Global functions
    for (const fn of functions) {
      const sig = functionReturnDetail(fn, tables);
      items.push({ label: fn.name, type: 'function', detail: sig });
    }

    // Namespaces — fields and functions
    for (const ns of namespaces) {
      items.push({ label: ns.name, type: 'namespace' });
      for (const f of ns.fields) {
        items.push({ label: `${ns.name}.${f.key}`, type: 'property', detail: f.type });
      }
      for (const fn of ns.functions) {
        const sig = `${ns.name}.${functionReturnDetail(fn, tables)}`;
        items.push({ label: `${ns.name}.${fn.name}`, type: 'function', detail: sig });
      }
    }

    // Active context type — self.* completions
    if (activeContextType) {
      items.push({ label: 'self', type: 'keyword' });
      for (const f of activeContextType.fields) {
        items.push({ label: `self.${f.key}`, type: 'property', detail: f.type });
      }
      for (const fn of activeContextType.functions) {
        const sig = `self:${functionReturnDetail(fn, tables)}`;
        items.push({ label: `self:${fn.name}`, type: 'method', detail: sig });
      }
    }

    for (const entry of LUA_STDLIB_COMPLETIONS) {
      if (!showAdvancedStdlib && entry.advanced) continue;
      items.push({
        label: entry.label,
        type: entry.type,
        detail: entry.detail,
      });
    }

    const dedupedByLabel = new Map<string, { label: string; type: string; detail?: string }>();
    for (const item of items) {
      if (!dedupedByLabel.has(item.label)) dedupedByLabel.set(item.label, item);
    }

    return Array.from(dedupedByLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [variables, tables, functions, namespaces, activeContextType, showAdvancedStdlib]);

  // Variable test values
  const [testValues, setTestValues] = useState<TestValue[]>(() =>
    buildDefaultTestValues(variables, tables),
  );
  // Context field test values (self.*)
  const [contextTestValues, setContextTestValues] = useState<TestValue[]>([]);
  // Namespace field test values
  const [nsTestValues, setNsTestValues] = useState<TestValue[]>(() =>
    buildNamespaceTestValues(namespaces),
  );
  // Function return mock values
  const [fnMocks, setFnMocks] = useState<FunctionMock[]>(() =>
    buildFunctionMocks(functions, namespaces, tables, activeContextType),
  );
  const [showTest, setShowTest] = useState(false);

  // Sync variable test values
  useEffect(() => {
    setTestValues((prev) => {
      const existing = new Map(prev.map((tv) => [tv.path, tv.value]));
      return buildDefaultTestValues(variables, tables).map((d) => ({
        path: d.path,
        value: existing.has(d.path) ? existing.get(d.path)! : d.value,
      }));
    });
  }, [variables, tables]);

  // Sync context test values when context type changes
  useEffect(() => {
    if (!activeContextType) {
      setContextTestValues([]);
      return;
    }
    setContextTestValues((prev) => {
      const existing = new Map(prev.map((tv) => [tv.path, tv.value]));
      return buildContextTestValues(activeContextType).map((d) => ({
        path: d.path,
        value: existing.has(d.path) ? existing.get(d.path)! : d.value,
      }));
    });
  }, [activeContextType]);

  // Sync namespace test values
  useEffect(() => {
    setNsTestValues((prev) => {
      const existing = new Map(prev.map((tv) => [tv.path, tv.value]));
      return buildNamespaceTestValues(namespaces).map((d) => ({
        path: d.path,
        value: existing.has(d.path) ? existing.get(d.path)! : d.value,
      }));
    });
  }, [namespaces]);

  // Sync function mocks
  useEffect(() => {
    setFnMocks((prev) => {
      const existing = new Map(prev.map((m) => [m.path, m.returnValue]));
      return buildFunctionMocks(functions, namespaces, tables, activeContextType).map((d) => ({
        ...d,
        returnValue: existing.has(d.path) ? existing.get(d.path)! : d.returnValue,
      }));
    });
  }, [functions, namespaces, tables, activeContextType]);

  // Combine all test values into a single var map for Lua
  const testVarMap = useMemo(
    () =>
      Object.fromEntries(
        [...testValues, ...contextTestValues, ...nsTestValues].map((tv) => [tv.path, tv.value]),
      ),
    [testValues, contextTestValues, nsTestValues],
  );

  // Convert function mocks to LuaFunctionStub[]
  const luaStubs = useMemo(
    () => fnMocks.map((m) => ({ path: m.path, returnValue: m.returnValue })),
    [fnMocks],
  );

  const result = useMemo(
    () => evalLuaCondition(value, testVarMap as Record<string, unknown>, luaStubs),
    [value, testVarMap, luaStubs],
  );

  const updateTestValue = useCallback((path: string, val: unknown) => {
    // Check which list this path belongs to
    setTestValues((prev) => {
      const found = prev.find((tv) => tv.path === path);
      return found ? prev.map((tv) => (tv.path === path ? { ...tv, value: val } : tv)) : prev;
    });
    setContextTestValues((prev) => {
      const found = prev.find((tv) => tv.path === path);
      return found ? prev.map((tv) => (tv.path === path ? { ...tv, value: val } : tv)) : prev;
    });
    setNsTestValues((prev) => {
      const found = prev.find((tv) => tv.path === path);
      return found ? prev.map((tv) => (tv.path === path ? { ...tv, value: val } : tv)) : prev;
    });
  }, []);

  const updateFnMock = useCallback((path: string, val: unknown) => {
    setFnMocks((prev) => prev.map((m) => (m.path === path ? { ...m, returnValue: val } : m)));
  }, []);

  const isValid = value.trim() === '' || result.ok;
  const hasResult = value.trim() !== '' && result.ok && result.value !== undefined;

  // Inside ConditionEditor
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);

  // Update your useEffect to bridge the event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        console.log('✅ Forcing Autocomplete via Bridge');
        const view = editorRef.current?.view;
        if (view) {
          // This bypasses the keymap system and calls the command directly
          startCompletion(view);
          // Prevent Chakra or the browser from doing anything else
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    // Keep 'true' for capture phase to beat Chakra's internal listeners
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const extensions = useMemo(() => {
    const completionSource = (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/[\w.:]+/);
      if (!word && !context.explicit) return null;

      const from = word ? word.from : context.pos;
      const q = word ? word.text.toLowerCase() : '';
      const options = allCompletions
        .filter((c) => !q || c.label.toLowerCase().includes(q))
        .map((c) => ({ label: c.label, type: c.type, detail: c.detail }));

      return { from, options };
    };

    return [
      // 1. Register the autocompletion engine with default keys enabled
      autocompletion({
        override: [completionSource],
        defaultKeymap: true,
      }),

      // 2. Your custom theme
      EditorView.theme({
        '&': { fontSize: '12px' },
        '.cm-content': { fontFamily: 'monospace', padding: '3px 6px' },
        '.cm-gutters': { display: 'none' },
      }),

      // 3. The Single-Line Hack (Moved to lowest priority)
      // This ensures it only blocks Enter if Autocomplete didn't use it first
      Prec.lowest(
        EditorView.domEventHandlers({
          keydown(e, view) {
            if (e.key === 'Enter') {
              // Check if the autocomplete tooltip is currently open
              const status = completionStatus(view.state);
              if (status === 'active') return false; // Let autocomplete handle it

              e.preventDefault();
              return true;
            }
            return false;
          },
        }),
      ),
    ];
  }, [allCompletions]);

  return (
    <Box>
      {label && (
        <Text fontSize="9px" color="gray.500" mb={1} fontWeight="bold" textTransform="uppercase">
          {label}
        </Text>
      )}

      {/* Editor + status indicators */}
      <HStack spacing={2} align="center">
        <Box
          flex={1}
          sx={{
            '.cm-editor': { borderRadius: '4px', border: '1px solid #1a1a2e' },
            '.cm-editor.cm-focused': { outline: 'none', border: '1px solid #3182ce' },
          }}
        >
          <CodeMirror
            value={value}
            onChange={onChange}
            theme={oneDark}
            extensions={extensions}
            basicSetup={false}
            height="24px"
            placeholder="e.g. weather.isRain == true"
            ref={editorRef}
          />
        </Box>

        {/* Fixed-width validation icon slot */}
        <Box w="16px" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
          {value.trim() !== '' && (
            <Tooltip label={result.ok ? 'Valid Lua' : (result.error ?? 'Syntax error')} hasArrow>
              <Box color={result.ok ? 'green.400' : 'red.400'} fontSize="xs" lineHeight={1}>
                {result.ok ? <CheckIcon /> : <WarningIcon />}
              </Box>
            </Tooltip>
          )}
        </Box>
      </HStack>

      {/* Fixed-height error line — visibility toggle, no layout shift */}
      <Text
        h="14px"
        mt="2px"
        fontSize="9px"
        color="red.400"
        fontFamily="mono"
        noOfLines={1}
        visibility={!isValid && value.trim() !== '' ? 'visible' : 'hidden'}
      >
        {result.error ?? ' '}
      </Text>

      {/* Footer */}
      <HStack justify="space-between" mt="2px">
        <Text fontSize="10px" color="gray.700">
          {allCompletions.length > 0
            ? `${allCompletions.length} symbol${allCompletions.length !== 1 ? 's' : ''} in scope`
            : 'No symbols defined'}
        </Text>
        <HStack spacing={2}>
          <Text fontSize="10px" color="gray.600">
            Advanced stdlib
          </Text>
          <Switch
            size="sm"
            colorScheme="blue"
            isChecked={showAdvancedStdlib}
            onChange={(e) => setShowAdvancedStdlib(e.target.checked)}
          />
          <Button
            size="xs"
            variant="ghost"
            color={showTest ? 'blue.300' : 'gray.500'}
            _hover={{ color: 'white' }}
            onClick={() => setShowTest((s) => !s)}
            px={1}
            h="5"
            fontSize="10px"
          >
            {showTest ? 'Hide test values' : 'Set test values'}
          </Button>
        </HStack>
      </HStack>

      {/* Test panel */}
      {showTest && (
        <Box mt={2} px={2} py={2} bg="#0a0a0b" borderRadius="md" border="1px" borderColor="#1a1a2e">
          <HStack justify="space-between" mb={2}>
            <Text fontSize="9px" color="gray.500" fontWeight="bold" textTransform="uppercase">
              Test Values
            </Text>
            <Button
              size="xs"
              variant="ghost"
              color="gray.600"
              _hover={{ color: 'white' }}
              onClick={() => {
                setTestValues(buildDefaultTestValues(variables, tables));
                setContextTestValues(
                  activeContextType ? buildContextTestValues(activeContextType) : [],
                );
                setNsTestValues(buildNamespaceTestValues(namespaces));
                setFnMocks(buildFunctionMocks(functions, namespaces, tables, activeContextType));
              }}
            >
              Reset
            </Button>
          </HStack>
          <TestPanel
            testValues={testValues}
            contextTestValues={contextTestValues}
            nsTestValues={nsTestValues}
            fnMocks={fnMocks}
            onChangeValue={updateTestValue}
            onChangeMock={updateFnMock}
            variables={variables}
            tables={tables}
            namespaces={namespaces}
            contextType={activeContextType}
          />
        </Box>
      )}
      <HStack
        mt={2}
        pt={2}
        borderTop="1px"
        borderColor="whiteAlpha.100"
        spacing={2}
        sx={{ minHeight: '24px' }}
      >
        <Text fontSize="9px" color="gray.500">
          Result:
        </Text>
        <Badge fontSize="10px" colorScheme={resultColorScheme(result.value)} variant="subtle">
          {hasResult ? formatResult(result.value) : ''}
        </Badge>
      </HStack>
    </Box>
  );
};

export default ConditionEditor;
