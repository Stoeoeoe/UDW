/**
 * ConditionEditor — Lua condition widget backed by @uiw/react-codemirror.
 */
import React, { useState, useMemo } from 'react';
import { Box, HStack, Text, Switch, Tooltip } from '@chakra-ui/react';
import { CheckIcon, WarningIcon } from '@chakra-ui/icons';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  hoverTooltip,
  keymap,
  showTooltip,
  type Tooltip as CodeTooltip,
} from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useEditorStore } from '../../../store/useEditorStore';
import { storyValueDiagnostics } from '../../../lib/storyValues';
import {
  bindingSymbols,
  bindingCompletions,
  bindingSnippet,
  luaCallContext,
  luaCode,
  bindingDiagnostics,
  unavailableBindings,
  CONDITION_SCOPE,
  bindingParameterDescription,
} from '../../../lib/luaBindings';
import { withProjectCharacters } from '../../../lib/scriptingManifest';
import {
  autocompletion,
  completionStatus,
  startCompletion,
  CompletionContext,
  CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import { validateLuaChunk } from '../../../lib/luaRunner';
import { Prec, StateField, type EditorState } from '@codemirror/state';
import { LUA_STDLIB_COMPLETIONS } from '../../../config/luaStandardLibrary';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConditionEditorProps {
  cutsceneVariables?: readonly { name: string; type: string; nullable?: boolean }[];
  value: string;
  onChange: (expression: string) => void;
  label?: string;
}
export const ConditionEditor: React.FC<ConditionEditorProps> = ({
  cutsceneVariables,
  value,
  onChange,
  label,
}) => {
  const [showAdvancedStdlib, setShowAdvancedStdlib] = useState(false);
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const characters = useEditorStore((s) => s.characters);
  const storyValues = useEditorStore((s) => s.project?.storyValues);
  const storyWarning = useMemo(
    () => storyValueDiagnostics(value, storyValues ?? [])[0]?.message,
    [value, storyValues],
  );
  const symbols = useMemo(
    () => bindingSymbols(manifest, { ...CONDITION_SCOPE, cutsceneVariables }),
    [manifest, cutsceneVariables],
  );
  const unavailable = useMemo(() => unavailableBindings(manifest, CONDITION_SCOPE), [manifest]);
  const contextIssues = useMemo(
    () => bindingDiagnostics(value, manifest, CONDITION_SCOPE),
    [value, manifest],
  );
  const contextError = contextIssues[0]?.message;

  const allCompletions = useMemo(
    () => LUA_STDLIB_COMPLETIONS.filter((entry) => showAdvancedStdlib || !entry.advanced),
    [showAdvancedStdlib],
  );
  const result = useMemo(() => validateLuaChunk(`return (${value || 'true'})`), [value]);
  const isValid = value.trim() === '' || (result.ok && !contextError);
  const extensions = useMemo(() => {
    const completionSource = (context: CompletionContext): CompletionResult | null => {
      const text = context.state.doc.sliceString(0, context.pos);
      const matches = bindingCompletions(
        text,
        symbols,
        withProjectCharacters(manifest?.resources, characters),
        [],
        { storyValues },
      );
      const q = text.slice(matches.from);
      if (!q && !context.explicit && !matches.string && !matches.argument) return null;
      const scanned = luaCode(text);
      const legacy =
        scanned.blocked || scanned.string || matches.argument
          ? []
          : allCompletions
              .filter((c) => c.label.startsWith(q) && !unavailable.has(c.label))
              .map((c) => ({ label: c.label, type: c.type, detail: c.detail }));
      const bindings = matches.options.map((symbol) =>
        symbol.parameters
          ? snippetCompletion(bindingSnippet(symbol), {
              label: symbol.label,
              type: symbol.type,
              detail: symbol.detail,
              info: symbol.description,
            })
          : {
              label: symbol.label,
              type: symbol.type,
              detail: symbol.detail,
              info: symbol.description,
              apply: symbol.insertText ?? symbol.label,
            },
      );
      return {
        from: matches.from,
        options: [...new Map([...legacy, ...bindings].map((c) => [c.label, c])).values()],
      };
    };

    const signatureTooltip = (state: EditorState): readonly CodeTooltip[] => {
      if (!state.selection.main.empty) return [];
      const call = luaCallContext(state.doc.sliceString(0, state.selection.main.head));
      const symbol = symbols.find((s) => s.label === call?.name);
      if (!symbol?.parameters) return [];
      return [
        {
          pos: state.selection.main.head,
          above: true,
          create: () => {
            const dom = document.createElement('div');
            dom.className = 'cm-lua-signature';
            const signature = document.createElement('div');
            signature.textContent = symbol.detail;
            dom.append(signature);
            const parameter = symbol.parameters?.[call!.argument];
            if (parameter) {
              const active = document.createElement('strong');
              active.textContent = `${parameter.name}: ${parameter.type} - ${bindingParameterDescription(parameter)}`;
              dom.append(active);
            }
            return { dom };
          },
        },
      ];
    };
    const signatures = StateField.define<readonly CodeTooltip[]>({
      create: signatureTooltip,
      update: (_value, transaction) => signatureTooltip(transaction.state),
      provide: (field) => showTooltip.computeN([field], (state) => state.field(field)),
    });

    return [
      StreamLanguage.define(lua),
      signatures,
      keymap.of([{ key: 'Ctrl-Space', run: startCompletion }]),
      hoverTooltip((view, pos) => {
        const text = view.state.doc.toString();
        const scanned = luaCode(text.slice(0, pos));
        if (scanned.blocked || scanned.string) return null;
        const before = text.slice(0, pos).match(/[\w.:]*$/)?.[0] ?? '';
        const after = text.slice(pos).match(/^[\w.:]*/)?.[0] ?? '';
        const symbol = symbols.find((s) => s.label === before + after);
        if (!symbol) return null;
        return {
          pos: pos - before.length,
          end: pos + after.length,
          above: true,
          create: () => {
            const dom = document.createElement('div');
            dom.className = 'cm-lua-signature';
            dom.textContent = [symbol.detail, symbol.description].filter(Boolean).join(' - ');
            return { dom };
          },
        };
      }),
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
        '.cm-lua-signature': { padding: '4px 8px', maxWidth: '500px', whiteSpace: 'normal' },
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
  }, [allCompletions, symbols, manifest, characters, unavailable, storyValues]);

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
            '.cm-editor': {
              borderRadius: '4px',
              border: '1px solid var(--chakra-colors-editor-inline-border)',
            },
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
            placeholder="e.g. GameState.Story.Has('met_keeper')"
          />
        </Box>

        {/* Fixed-width validation icon slot */}
        <Box w="16px" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
          {value.trim() !== '' && (
            <Tooltip
              label={isValid ? 'Valid Lua' : (contextError ?? result.error ?? 'Syntax error')}
              hasArrow
            >
              <Box color={isValid ? 'green.400' : 'red.400'} fontSize="xs" lineHeight={1}>
                {isValid ? <CheckIcon /> : <WarningIcon />}
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
        color={isValid ? 'orange.300' : 'red.400'}
        fontFamily="mono"
        noOfLines={1}
        visibility={(!isValid || !!storyWarning) && value.trim() !== '' ? 'visible' : 'hidden'}
      >
        {contextError ?? result.error ?? storyWarning ?? ' '}
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
        </HStack>
      </HStack>
    </Box>
  );
};
export default ConditionEditor;
