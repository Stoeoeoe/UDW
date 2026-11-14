/**
 * LuaScriptEditor — Monaco-based Lua code editor with LuaLS language server integration.
 *
 * When LuaLS is available (binary downloaded), provides full language server features:
 *  - Scope-aware completions, type inference, hover, signature help, diagnostics
 *
 * Always provides static completions for game-specific symbols (variables, functions,
 * namespaces, context types) that the language server doesn't know about.
 */
import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { getLspClient, LspDiagnostic, LspCompletionItem } from '../../../lib/lspClient';
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
  SCRIPT_SCOPE,
  bindingParameterDescription,
  type LuaBindingScope,
  type LuaArgumentReferences,
} from '../../../lib/luaBindings';
import { withProjectCharacters } from '../../../lib/scriptingManifest';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface LuaScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  /** Unique identifier for this editor instance (used as LSP document URI) */
  documentId?: string;
  /** Live character bindings available to this script (for example cutscene actors). */
  characterReferences?: readonly { id: string; name: string }[];
  scope?: LuaBindingScope;
  argumentReferences?: LuaArgumentReferences;
  /** Edit a value expression while presenting a complete chunk to LuaLS. */
  expression?: boolean;
  /** Canvas nodes use absolute widgets so React Flow's transform also moves popups. */
  fixedOverflowWidgets?: boolean;
}

// ─── Lua language configuration ──────────────────────────────────────────────

const LUA_LANGUAGE_ID = 'lua';

let languageRegistered = false;

function ensureLuaLanguage(monaco: typeof Monaco) {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: LUA_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(LUA_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.lua',

    keywords: [
      'and',
      'break',
      'do',
      'else',
      'elseif',
      'end',
      'false',
      'for',
      'function',
      'goto',
      'if',
      'in',
      'local',
      'nil',
      'not',
      'or',
      'repeat',
      'return',
      'then',
      'true',
      'until',
      'while',
    ],

    brackets: [
      { open: '{', close: '}', token: 'delimiter.curly' },
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    operators: [
      '+',
      '-',
      '*',
      '/',
      '%',
      '^',
      '#',
      '==',
      '~=',
      '<',
      '>',
      '<=',
      '>=',
      '=',
      ';',
      ':',
      ',',
      '.',
      '..',
      '...',
    ],

    symbols: /[=><!~?:&|+\-*/^%#]+/,

    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[0-9]{1,3})/,

    tokenizer: {
      root: [
        [/--\[([=]*)\[/, 'comment', '@blockComment.$1'],
        [/--.*$/, 'comment'],
        [/\[([=]*)\[/, 'string', '@blockString.$1'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_single'],
        [/0[xX][0-9a-fA-F_]*/, 'number.hex'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': { token: 'keyword.$0' },
              '@default': 'identifier',
            },
          },
        ],
        [/\s+/, 'white'],
        [/[{}()[\]]/, '@brackets'],
        [
          /@symbols/,
          {
            cases: {
              '@operators': 'delimiter',
              '@default': '',
            },
          },
        ],
      ],

      blockComment: [
        [/[^\]]+/, 'comment'],
        [
          /\]([=]*)\]/,
          {
            cases: { '$1==$S2': { token: 'comment', next: '@pop' }, '@default': 'comment' },
          },
        ],
        [/./, 'comment'],
      ],

      blockString: [
        [/[^\]]+/, 'string'],
        [
          /\]([=]*)\]/,
          {
            cases: { '$1==$S2': { token: 'string', next: '@pop' }, '@default': 'string' },
          },
        ],
        [/./, 'string'],
      ],

      string_double: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],

      string_single: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, 'string', '@pop'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(LUA_LANGUAGE_ID, {
    comments: {
      lineComment: '--',
      blockComment: ['--[[', ']]'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(function|if|else|elseif|for|while|repeat|do)\b(?!.*\bend\b)/,
      decreaseIndentPattern: /^\s*(end|else|elseif|until)\b/,
    },
  });
}

// ─── Build static completion items (game-specific) ───────────────────────────

const LSP_TO_MONACO_KIND: Record<number, number> = {
  1: 4, // Text → Value (will be overridden)
  2: 1, // Method
  3: 0, // Function
  4: 3, // Constructor
  5: 4, // Field
  6: 5, // Variable
  7: 7, // Class
  8: 8, // Interface
  9: 9, // Module
  10: 10, // Property
  11: 23, // Unit
  12: 11, // Value
  13: 12, // Enum
  14: 13, // Keyword
  15: 14, // Snippet
  16: 15, // Color
  17: 16, // File
  18: 17, // Reference
  19: 18, // Folder
  20: 19, // EnumMember
  21: 20, // Constant
  22: 21, // Struct
  23: 22, // Event
  24: 23, // Operator
  25: 24, // TypeParameter
};

function lspCompletionToMonaco(
  item: LspCompletionItem,
  range: Monaco.IRange,
  monaco: typeof Monaco,
): Monaco.languages.CompletionItem {
  const kind = item.kind
    ? (LSP_TO_MONACO_KIND[item.kind] ?? monaco.languages.CompletionItemKind.Text)
    : monaco.languages.CompletionItemKind.Text;

  let documentation: string | Monaco.IMarkdownString | undefined;
  if (typeof item.documentation === 'string') {
    documentation = item.documentation;
  } else if (item.documentation && typeof item.documentation === 'object') {
    documentation = { value: item.documentation.value };
  }

  const isSnippet = item.insertTextFormat === 2;

  return {
    label: item.label,
    kind,
    detail: item.detail,
    documentation,
    insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
    insertTextRules: isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    sortText: item.sortText,
    filterText: item.filterText,
    range: item.textEdit
      ? {
          startLineNumber: item.textEdit.range.start.line + 1,
          startColumn: item.textEdit.range.start.character + 1,
          endLineNumber: item.textEdit.range.end.line + 1,
          endColumn: item.textEdit.range.end.character + 1,
        }
      : range,
  };
}

// ─── Dark theme definition ───────────────────────────────────────────────────

const LUA_THEME_NAME = 'lua-dark';

function defineTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme(LUA_THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C678DD', fontStyle: 'bold' },
      { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
      { token: 'string', foreground: '98C379' },
      { token: 'number', foreground: 'D19A66' },
      { token: 'identifier', foreground: 'ABB2BF' },
      { token: 'delimiter', foreground: 'ABB2BF' },
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#ABB2BF',
      'editorCursor.foreground': '#528BFF',
      'editor.selectionBackground': '#3E4451',
      'editor.lineHighlightBackground': '#2C313A',
    },
  });
}

// ─── LSP severity → Monaco severity ─────────────────────────────────────────

function lspSeverityToMonaco(severity: number | undefined, monaco: typeof Monaco): number {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

// ─── LSP initialization (singleton) ──────────────────────────────────────────

let lspInitPromise: Promise<boolean> | null = null;

function initLsp(): Promise<boolean> {
  if (!lspInitPromise) {
    lspInitPromise = (async () => {
      const client = getLspClient();
      try {
        const available = await client.isAvailable();
        if (!available) return false;
        return await client.start();
      } catch {
        return false;
      }
    })();
  }
  return lspInitPromise;
}

// ─── Component ───────────────────────────────────────────────────────────────

let instanceCounter = 0;

export const LuaScriptEditor: React.FC<LuaScriptEditorProps> = ({
  value,
  onChange,
  height = '220px',
  documentId,
  characterReferences,
  scope = SCRIPT_SCOPE,
  argumentReferences,
  expression = false,
  fixedOverflowWidgets = true,
}) => {
  const lspLineOffset = expression ? 1 : 0;
  const lspValue = expression ? `return (\n${value}\n)` : value;
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const disposablesRef = useRef<Monaco.IDisposable[]>([]);
  const [lspReady, setLspReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [instanceId] = useState(() => ++instanceCounter);
  const uri = `inmemory://lua-editor-${instanceId}/${encodeURIComponent(documentId ?? 'script')}.lua`;
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const characters = useEditorStore((s) => s.characters);
  const storyValues = useEditorStore((s) => s.project?.storyValues);
  const symbols = useMemo(() => bindingSymbols(manifest, scope), [manifest, scope]);
  const unavailable = useMemo(() => unavailableBindings(manifest, scope), [manifest, scope]);

  useEffect(() => {
    if (!mounted || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'lua-bindings',
      [
        ...bindingDiagnostics(value, manifest, scope),
        ...storyValueDiagnostics(value, storyValues ?? []),
      ].map((issue) => {
        const start = model.getPositionAt(issue.from);
        const end = model.getPositionAt(issue.to);
        return {
          message: issue.message,
          source: 'Lua bindings',
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        };
      }),
    );
    return () => {
      if (!model.isDisposed()) monaco.editor.setModelMarkers(model, 'lua-bindings', []);
    };
  }, [mounted, value, manifest, scope, uri, storyValues]);

  // Build static game completions
  // Initialize LSP
  useEffect(() => {
    let cancelled = false;
    initLsp().then((ready) => {
      if (!cancelled) setLspReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Open/close LSP document
  useEffect(() => {
    if (!lspReady) return;
    const client = getLspClient();
    client.openDocument(uri, lspValue);
    return () => {
      client.closeDocument(uri);
    };
    // Only open/close on mount/unmount — updates are handled via onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lspReady, uri]);

  useEffect(() => {
    if (lspReady) getLspClient().updateDocument(uri, lspValue);
  }, [lspReady, uri, lspValue]);

  // Sync document content to LSP on change
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange],
  );

  // Set up LSP diagnostics → Monaco markers
  useEffect(() => {
    if (!mounted || !lspReady || !monacoRef.current) return;
    const monaco = monacoRef.current;

    const client = getLspClient();
    const unsubscribe = client.subscribeDiagnostics(
      (diagUri: string, diagnostics: LspDiagnostic[]) => {
        if (diagUri !== uri) return;
        const model = editorRef.current?.getModel();
        if (!model) return;

        const markers: Monaco.editor.IMarkerData[] = diagnostics
          .filter(
            (d) =>
              d.range.start.line >= lspLineOffset &&
              d.range.start.line < lspLineOffset + model.getLineCount(),
          )
          .map((d) => ({
            severity: lspSeverityToMonaco(d.severity, monaco),
            message: d.message,
            startLineNumber: d.range.start.line + 1 - lspLineOffset,
            startColumn: d.range.start.character + 1,
            endLineNumber: Math.min(model.getLineCount(), d.range.end.line + 1 - lspLineOffset),
            endColumn: d.range.end.character + 1,
            source: d.source ?? 'LuaLS',
          }));

        monaco.editor.setModelMarkers(model, 'lua-ls', markers);
      },
    );

    return () => {
      unsubscribe();
      const model = editorRef.current?.getModel();
      if (model) monaco.editor.setModelMarkers(model, 'lua-ls', []);
    };
  }, [mounted, lspReady, uri, lspLineOffset]);

  // Register providers
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!mounted || !monaco) return;

    // Dispose previous registrations
    for (const d of disposablesRef.current) d.dispose();
    disposablesRef.current = [];

    // Completion provider: merges LSP results with static game completions
    disposablesRef.current.push(
      monaco.languages.registerCompletionItemProvider(LUA_LANGUAGE_ID, {
        triggerCharacters: ['.', ':', '"', "'", '(', ',', ' '],
        async provideCompletionItems(model: Monaco.editor.ITextModel, position: Monaco.Position) {
          if (model !== editorRef.current?.getModel()) return { suggestions: [] };
          const word = model.getWordUntilPosition(position);
          const range: Monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const textBefore = model.getValue().slice(0, model.getOffsetAt(position));
          const matches = bindingCompletions(
            textBefore,
            symbols,
            withProjectCharacters(manifest?.resources, characters),
            characterReferences,
            { ...argumentReferences, storyValues },
          );
          const path = textBefore.slice(matches.from);
          const start = model.getPositionAt(matches.from);
          const staticRange = {
            ...range,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
          };
          const suggestions: Monaco.languages.CompletionItem[] = [
            ...matches.options.map((symbol) => ({
              label: symbol.label,
              kind:
                symbol.type === 'function'
                  ? monaco.languages.CompletionItemKind.Function
                  : symbol.type === 'constant'
                    ? monaco.languages.CompletionItemKind.Constant
                    : monaco.languages.CompletionItemKind.Module,
              detail: symbol.detail,
              documentation: symbol.description,
              insertText: bindingSnippet(symbol),
              insertTextRules: symbol.parameters
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              range: staticRange,
            })),
          ];

          // Add LSP completions if available
          if (lspReady && !matches.argument && !matches.member) {
            try {
              const lspItems = await getLspClient().completion(
                uri,
                position.lineNumber - 1 + lspLineOffset,
                position.column - 1,
              );
              for (const item of lspItems) {
                const prefix = path.slice(
                  0,
                  Math.max(path.lastIndexOf('.'), path.lastIndexOf(':')) + 1,
                );
                if (unavailable.has(item.label) || unavailable.has(prefix + item.label)) continue;
                suggestions.push(lspCompletionToMonaco(item, range, monaco));
              }
            } catch {
              // LSP request failed, static completions still work
            }
          }

          return {
            suggestions: [
              ...new Map(
                suggestions.map((item) => [
                  typeof item.label === 'string' ? item.label : item.label.label,
                  item,
                ]),
              ).values(),
            ],
          };
        },
      }),
    );

    disposablesRef.current.push(
      monaco.languages.registerHoverProvider(LUA_LANGUAGE_ID, {
        provideHover(model, position) {
          if (model !== editorRef.current?.getModel()) return null;
          const line = model.getLineContent(position.lineNumber);
          const before = line.slice(0, position.column - 1).match(/[\w.:]*$/)?.[0] ?? '';
          const after = line.slice(position.column - 1).match(/^[\w.:]*/)?.[0] ?? '';
          const symbol = symbols.find((s) => s.label === before + after);
          const scanned = luaCode(model.getValue().slice(0, model.getOffsetAt(position)));
          if (!symbol || scanned.blocked || scanned.string) return null;
          return {
            contents: [
              { value: '```lua\n' + symbol.detail + '\n```' },
              { value: symbol.description ?? '' },
            ],
          };
        },
      }),
      monaco.languages.registerSignatureHelpProvider(LUA_LANGUAGE_ID, {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp(model, position) {
          if (model !== editorRef.current?.getModel()) return null;
          const call = luaCallContext(model.getValue().slice(0, model.getOffsetAt(position)));
          const symbol = symbols.find((s) => s.label === call?.name);
          if (!symbol?.parameters) return null;
          return {
            value: {
              signatures: [
                {
                  label: symbol.detail,
                  documentation: symbol.description,
                  parameters: symbol.parameters.map((p) => ({
                    label: `${p.name}: ${p.type}`,
                    documentation: bindingParameterDescription(p),
                  })),
                },
              ],
              activeSignature: 0,
              activeParameter: Math.min(call!.argument, Math.max(0, symbol.parameters.length - 1)),
            },
            dispose() {},
          };
        },
      }),
    );

    // Hover provider (LSP only)
    if (lspReady) {
      disposablesRef.current.push(
        monaco.languages.registerHoverProvider(LUA_LANGUAGE_ID, {
          async provideHover(_model: Monaco.editor.ITextModel, position: Monaco.Position) {
            if (_model !== editorRef.current?.getModel()) return null;
            try {
              const hover = await getLspClient().hover(
                uri,
                position.lineNumber - 1 + lspLineOffset,
                position.column - 1,
              );
              if (!hover) return null;

              const contents: Monaco.IMarkdownString[] = [];
              const rawContents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];

              for (const c of rawContents) {
                if (typeof c === 'string') {
                  contents.push({ value: c });
                } else if (c && typeof c === 'object' && 'value' in c) {
                  contents.push({ value: c.value });
                }
              }

              return {
                contents,
                range: hover.range
                  ? {
                      startLineNumber: hover.range.start.line + 1 - lspLineOffset,
                      startColumn: hover.range.start.character + 1,
                      endLineNumber: hover.range.end.line + 1 - lspLineOffset,
                      endColumn: hover.range.end.character + 1,
                    }
                  : undefined,
              };
            } catch {
              return null;
            }
          },
        }),
      );

      // Signature help provider (LSP only)
      disposablesRef.current.push(
        monaco.languages.registerSignatureHelpProvider(LUA_LANGUAGE_ID, {
          signatureHelpTriggerCharacters: ['(', ','],
          async provideSignatureHelp(_model: Monaco.editor.ITextModel, position: Monaco.Position) {
            if (_model !== editorRef.current?.getModel()) return null;
            try {
              const sigHelp = await getLspClient().signatureHelp(
                uri,
                position.lineNumber - 1 + lspLineOffset,
                position.column - 1,
              );
              if (!sigHelp) return null;

              return {
                value: {
                  signatures: sigHelp.signatures.map((sig) => ({
                    label: sig.label,
                    documentation:
                      typeof sig.documentation === 'string'
                        ? sig.documentation
                        : sig.documentation
                          ? { value: sig.documentation.value }
                          : undefined,
                    parameters: (sig.parameters ?? []).map((p) => ({
                      label: p.label,
                      documentation:
                        typeof p.documentation === 'string'
                          ? p.documentation
                          : p.documentation
                            ? { value: p.documentation.value }
                            : undefined,
                    })),
                  })),
                  activeSignature: sigHelp.activeSignature ?? 0,
                  activeParameter: sigHelp.activeParameter ?? 0,
                },
                dispose() {},
              };
            } catch {
              return null;
            }
          },
        }),
      );
    }

    return () => {
      for (const d of disposablesRef.current) d.dispose();
      disposablesRef.current = [];
    };
  }, [
    mounted,
    lspReady,
    uri,
    symbols,
    manifest,
    characters,
    characterReferences,
    argumentReferences,
    scope,
    unavailable,
    storyValues,
    lspLineOffset,
  ]);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    ensureLuaLanguage(monaco);
    defineTheme(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setMounted(true);

    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      renderLineHighlight: 'line',
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      fontSize: 13,
      tabSize: 2,
      wordWrap: 'on',
      suggest: {
        showKeywords: true,
        showSnippets: true,
        // Prefer showing above the cursor so popups don't go off-screen at the bottom
        localityBonus: true,
      },
      // Position suggest widget above cursor when near bottom of editor
      fixedOverflowWidgets,
    });
  };

  return (
    <Editor
      height={height}
      path={uri}
      language={LUA_LANGUAGE_ID}
      theme={LUA_THEME_NAME}
      value={value}
      onChange={(v) => handleChange(v ?? '')}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        tabSize: 2,
        wordWrap: 'on',
        fixedOverflowWidgets,
      }}
    />
  );
};
