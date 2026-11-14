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
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useEditorStore } from '../../../store/useEditorStore';
import { storyValueDiagnostics } from '../../../lib/storyValues';
import { DeclareStoryValueButton } from './DeclareStoryValueButton';
import { conditionTypeIssues } from '../../../lib/conditionTypes';
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
  completionDetail,
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

const color = (token: string) => `var(--chakra-colors-${token})`;

/**
 * Lua token colours. The Lua grammar tags every name as a variable, which oneDark paints red; names stay in the
 * normal text colour so real errors stand out.
 */
const CONDITION_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.variableName, color: color('gray-100') },
  { tag: tags.standard(tags.variableName), color: color('cyan-300') },
  { tag: tags.keyword, color: color('purple-300') },
  { tag: tags.number, color: color('orange-300') },
  { tag: tags.string, color: color('green-300') },
  { tag: tags.comment, color: color('gray-500'), fontStyle: 'italic' },
]);

/**
 * Readable completion list. Selectors start with `&.cm-editor` so they outrank the oneDark theme's rules.
 */
const COMPLETION_THEME = {
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete': {
    background: color('editorPanelBg'),
    border: `1px solid ${color('editorFieldBorderHover')}`,
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  '&.cm-editor .cm-tooltip-autocomplete > ul': {
    fontFamily: 'monospace',
    fontSize: '12px',
    maxHeight: '18em',
    maxWidth: 'min(640px, 90vw)',
    padding: '4px 0',
  },
  '&.cm-editor .cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 10px',
    lineHeight: '1.6',
    color: color('gray-200'),
  },
  '&.cm-editor .cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: color('blue-700'),
    color: color('white'),
  },
  '&.cm-editor .cm-completionIcon': { width: '1.4em', opacity: '0.7', paddingRight: '4px' },
  '&.cm-editor .cm-completionMatchedText': {
    textDecoration: 'none',
    fontWeight: '700',
    color: color('cyan-300'),
  },
  '&.cm-editor li[aria-selected] .cm-completionMatchedText': { color: color('cyan-100') },
  '&.cm-editor .cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: '16px',
    fontStyle: 'normal',
    fontSize: '11px',
    color: color('gray-500'),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '&.cm-editor li[aria-selected] .cm-completionDetail': { color: color('gray-200') },
  '&.cm-editor .cm-tooltip.cm-completionInfo': {
    background: color('editorPanelBg'),
    border: `1px solid ${color('editorFieldBorderHover')}`,
    borderRadius: '6px',
    padding: '6px 10px',
    maxWidth: '360px',
    color: color('gray-300'),
  },
};

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
  const storyIssues = useMemo(
    () => storyValueDiagnostics(value, storyValues ?? []),
    [value, storyValues],
  );
  const storyWarning = storyIssues[0]?.message;
  // The line shows the first issue; declaring it reveals the next one.
  const undeclared = storyIssues[0]?.undeclared;
  const symbols = useMemo(
    () => bindingSymbols(manifest, { ...CONDITION_SCOPE, cutsceneVariables }),
    [manifest, cutsceneVariables],
  );
  const unavailable = useMemo(() => unavailableBindings(manifest, CONDITION_SCOPE), [manifest]);
  const contextIssues = useMemo(
    () => [
      ...bindingDiagnostics(value, manifest, CONDITION_SCOPE),
      ...conditionTypeIssues(value, manifest, storyValues, cutsceneVariables),
    ],
    [value, manifest, storyValues, cutsceneVariables],
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
      if (!q && !context.explicit && !matches.string && !matches.argument && !matches.member)
        return null;
      const scanned = luaCode(text);
      const legacy =
        scanned.blocked || scanned.string || matches.argument || matches.member
          ? []
          : allCompletions
              .filter((c) => c.label.startsWith(q) && !unavailable.has(c.label))
              .map((c) => ({ label: c.label, type: c.type, detail: c.detail }));
      const bindings = matches.options.map((symbol) =>
        symbol.parameters
          ? snippetCompletion(bindingSnippet(symbol), {
              label: symbol.label,
              type: symbol.type,
              detail: completionDetail(symbol.label, symbol.detail),
              info: symbol.description,
            })
          : {
              label: symbol.label,
              type: symbol.type,
              detail: completionDetail(symbol.label, symbol.detail),
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
      Prec.high(syntaxHighlighting(CONDITION_HIGHLIGHT)),
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
        ...COMPLETION_THEME,
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
      <HStack
        h="14px"
        mt="2px"
        spacing={2}
        visibility={(!isValid || !!storyWarning) && value.trim() !== '' ? 'visible' : 'hidden'}
      >
        <Text
          flex={1}
          fontSize="9px"
          color={isValid ? 'orange.300' : 'red.400'}
          fontFamily="mono"
          noOfLines={1}
        >
          {contextError ?? result.error ?? storyWarning ?? ' '}
        </Text>
        {isValid && undeclared && (
          <DeclareStoryValueButton key={undeclared.key} suggestion={undeclared} />
        )}
      </HStack>

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
