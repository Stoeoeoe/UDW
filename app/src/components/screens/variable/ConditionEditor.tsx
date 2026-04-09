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
  startCompletion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import { GameVariable } from '../../../types/schema';
import { evalLuaCondition } from '../../../lib/luaRunner';
import { Prec } from '@codemirror/state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VariableTestValue {
  path: string;
  value: unknown;
}

export interface ConditionEditorProps {
  value: string;
  onChange: (expr: string) => void;
  variables: GameVariable[];
  label?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expandPaths(variables: GameVariable[]): string[] {
  const paths: string[] = [];
  for (const v of variables) {
    if (v.type === 'complex' && v.complexFields?.length) {
      for (const f of v.complexFields) paths.push(`${v.key}.${f.key}`);
    } else {
      paths.push(v.key);
    }
  }
  return paths;
}

function effectiveDefault(v: GameVariable): unknown {
  if (v.type === 'complex') return null;
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

function buildDefaultTestValues(variables: GameVariable[]): VariableTestValue[] {
  const out: VariableTestValue[] = [];
  for (const v of variables) {
    if (v.type === 'complex' && v.complexFields?.length) {
      for (const f of v.complexFields)
        out.push({ path: `${v.key}.${f.key}`, value: effectiveFieldDefault(f) });
    } else {
      out.push({ path: v.key, value: effectiveDefault(v) });
    }
  }
  return out;
}

function getFieldType(
  path: string,
  variables: GameVariable[],
): { type: 'boolean' | 'number' | 'string' | 'enum'; enumValues?: string[] } {
  for (const v of variables) {
    if (v.type === 'complex' && v.complexFields) {
      for (const f of v.complexFields) {
        if (`${v.key}.${f.key}` === path) return { type: f.type, enumValues: f.enumValues };
      }
    } else if (v.key === path) {
      const t = v.type === 'number' ? 'number' : (v.type as 'boolean' | 'string' | 'enum');
      return { type: t, enumValues: v.enumValues };
    }
  }
  return { type: 'string' };
}

function formatResult(value: unknown): string {
  if (value === undefined || value === null) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function resultColorScheme(value: unknown): string {
  if (value === true) return 'green';
  if (value === false) return 'yellow';
  return 'blue';
}

// ─── Test panel ───────────────────────────────────────────────────────────────

const TestPanel: React.FC<{
  testValues: VariableTestValue[];
  onChange: (path: string, value: unknown) => void;
  variables: GameVariable[];
}> = ({ testValues, onChange, variables }) => {
  if (testValues.length === 0) {
    return (
      <Text fontSize="10px" color="gray.600" fontStyle="italic">
        No variables defined.
      </Text>
    );
  }
  return (
    <VStack spacing={1} align="stretch">
      {testValues.map(({ path, value }) => {
        const { type, enumValues } = getFieldType(path, variables);
        return (
          <HStack key={path} spacing={2} minH="22px">
            <Text
              fontSize="10px"
              fontFamily="mono"
              color="gray.400"
              flex={1}
              noOfLines={1}
              title={path}
            >
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
      })}
    </VStack>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const ConditionEditor: React.FC<ConditionEditorProps> = ({
  value,
  onChange,
  variables,
  label,
}) => {
  const allPaths = useMemo(() => expandPaths(variables), [variables]);

  const [testValues, setTestValues] = useState<VariableTestValue[]>(() =>
    buildDefaultTestValues(variables),
  );
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    setTestValues((prev) => {
      const existing = new Map(prev.map((tv) => [tv.path, tv.value]));
      return buildDefaultTestValues(variables).map((d) => ({
        path: d.path,
        value: existing.has(d.path) ? existing.get(d.path)! : d.value,
      }));
    });
  }, [variables]);

  const testVarMap = useMemo(
    () => Object.fromEntries(testValues.map((tv) => [tv.path, tv.value])),
    [testValues],
  );

  const result = useMemo(
    () => evalLuaCondition(value, testVarMap as Record<string, unknown>),
    [value, testVarMap],
  );

  const updateTestValue = useCallback((path: string, val: unknown) => {
    setTestValues((prev) => prev.map((tv) => (tv.path === path ? { ...tv, value: val } : tv)));
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
      const word = context.matchBefore(/[\w.]+/);
      if (!word && !context.explicit) return null;

      const from = word ? word.from : context.pos;
      const q = word ? word.text.toLowerCase() : '';
      const options = allPaths
        .filter((p) => !q || p.toLowerCase().includes(q))
        .map((p) => ({ label: p, type: 'variable' }));

      return { from, options };
    };

    return [
      // 1. Register the autocompletion engine with default keys enabled
      autocompletion({
        override: [completionSource],
        defaultKeymap: true, // This explicitly enables Ctrl+Space OOTB
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
              const isCompletionOpen = !!view.state.field(autocompletion, false)?.active;
              if (isCompletionOpen) return false; // Let autocomplete handle it

              e.preventDefault();
              return true;
            }
            return false;
          },
        }),
      ),
    ];
  }, [allPaths]);

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

        {/* Fixed-width result badge slot */}
        <Box w="48px" flexShrink={0}>
          {hasResult && (
            <Badge
              fontSize="9px"
              colorScheme={resultColorScheme(result.value)}
              variant="subtle"
              w="full"
              textAlign="center"
            >
              {formatResult(result.value)}
            </Badge>
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
          {allPaths.length > 0
            ? `${allPaths.length} variable${allPaths.length !== 1 ? 's' : ''} in scope`
            : 'No variables defined'}
        </Text>
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
              onClick={() => setTestValues(buildDefaultTestValues(variables))}
            >
              Reset
            </Button>
          </HStack>
          <TestPanel testValues={testValues} onChange={updateTestValue} variables={variables} />
          {hasResult && (
            <HStack mt={2} pt={2} borderTop="1px" borderColor="whiteAlpha.100" spacing={2}>
              <Text fontSize="9px" color="gray.500">
                Result:
              </Text>
              <Badge fontSize="10px" colorScheme={resultColorScheme(result.value)} variant="subtle">
                {formatResult(result.value)}
              </Badge>
            </HStack>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ConditionEditor;
