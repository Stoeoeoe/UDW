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
import {
  GameVariable,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
} from '../../../types/schema';
import { getLspClient, LspDiagnostic, LspCompletionItem } from '../../../lib/lspClient';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface LuaScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  gameVariables?: GameVariable[];
  scriptTables?: ScriptTable[];
  scriptFunctions?: ScriptFunction[];
  scriptNamespaces?: ScriptNamespace[];
  activeContextType?: ScriptContextType | null;
  /** Unique identifier for this editor instance (used as LSP document URI) */
  documentId?: string;
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

function buildGameCompletionItems(
  monaco: typeof Monaco,
  gameVariables: GameVariable[],
  scriptTables: ScriptTable[],
  scriptFunctions: ScriptFunction[],
  scriptNamespaces: ScriptNamespace[],
  activeContextType: ScriptContextType | null | undefined,
): Monaco.languages.CompletionItem[] {
  const items: Monaco.languages.CompletionItem[] = [];
  const range = undefined!;

  for (const variable of gameVariables) {
    items.push({
      label: variable.key,
      kind: monaco.languages.CompletionItemKind.Variable,
      detail: `(${variable.type}) ${variable.description ?? ''}`.trim(),
      insertText: variable.key,
      range,
    });

    if (variable.type === 'table') {
      const table = variable.tableId
        ? scriptTables.find((t) => t.id === variable.tableId)
        : undefined;
      const fields = table?.fields ?? variable.complexFields ?? [];
      for (const field of fields) {
        const fullKey = `${variable.key}.${field.key}`;
        items.push({
          label: fullKey,
          kind: monaco.languages.CompletionItemKind.Field,
          detail: `(${field.type}) ${field.description ?? ''}`.trim(),
          insertText: fullKey,
          range,
        });
      }
    }
  }

  for (const fn of scriptFunctions) {
    const paramList = fn.params.map((p) => p.name).join(', ');
    items.push({
      label: fn.name,
      kind: monaco.languages.CompletionItemKind.Function,
      detail: `(${fn.returnType}) ${fn.name}(${paramList})`,
      documentation: fn.description,
      insertText: fn.name + '($0)',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    });
  }

  for (const ns of scriptNamespaces) {
    items.push({
      label: ns.name,
      kind: monaco.languages.CompletionItemKind.Module,
      detail: ns.description ?? `namespace ${ns.name}`,
      insertText: ns.name,
      range,
    });

    for (const field of ns.fields) {
      const fullKey = `${ns.name}.${field.key}`;
      items.push({
        label: fullKey,
        kind: monaco.languages.CompletionItemKind.Field,
        detail: `(${field.type}) ${field.description ?? ''}`.trim(),
        insertText: fullKey,
        range,
      });
    }

    for (const fn of ns.functions) {
      const paramList = fn.params.map((p) => p.name).join(', ');
      const fullName = `${ns.name}.${fn.name}`;
      items.push({
        label: fullName,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: `(${fn.returnType}) ${fullName}(${paramList})`,
        documentation: fn.description,
        insertText: fullName + '($0)',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      });
    }
  }

  if (activeContextType) {
    items.push({
      label: 'self',
      kind: monaco.languages.CompletionItemKind.Keyword,
      detail: `context: ${activeContextType.name}`,
      documentation: activeContextType.description,
      insertText: 'self',
      range,
    });

    for (const field of activeContextType.fields) {
      const fullKey = `self.${field.key}`;
      items.push({
        label: fullKey,
        kind: monaco.languages.CompletionItemKind.Field,
        detail: `(${field.type}) ${field.description ?? ''}`.trim(),
        insertText: fullKey,
        range,
      });
    }

    for (const fn of activeContextType.functions) {
      const paramList = fn.params.map((p) => p.name).join(', ');
      const fullName = `self:${fn.name}`;
      items.push({
        label: fullName,
        kind: monaco.languages.CompletionItemKind.Method,
        detail: `(${fn.returnType}) ${fullName}(${paramList})`,
        documentation: fn.description,
        insertText: `self:${fn.name}($0)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      });
    }
  }

  return items;
}

// ─── LSP completion → Monaco completion conversion ───────────────────────────

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
    insertText: item.insertText ?? item.label,
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
      const available = await client.isAvailable();
      if (!available) return false;
      return client.start();
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
  gameVariables = [],
  scriptTables = [],
  scriptFunctions = [],
  scriptNamespaces = [],
  activeContextType = null,
  documentId,
}) => {
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const disposablesRef = useRef<Monaco.IDisposable[]>([]);
  const [lspReady, setLspReady] = useState(false);
  const documentUri = useRef(documentId ?? `inmemory://lua-editor-${++instanceCounter}.lua`);

  // Build static game completions
  const gameCompletionItems = useMemo(() => {
    if (!monacoRef.current) return [];
    return buildGameCompletionItems(
      monacoRef.current,
      gameVariables,
      scriptTables,
      scriptFunctions,
      scriptNamespaces,
      activeContextType,
    );
  }, [gameVariables, scriptTables, scriptFunctions, scriptNamespaces, activeContextType]);

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
    const uri = documentUri.current;
    client.openDocument(uri, value);
    return () => {
      client.closeDocument(uri);
    };
    // Only open/close on mount/unmount — updates are handled via onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lspReady]);

  // Sync document content to LSP on change
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      if (lspReady) {
        getLspClient().updateDocument(documentUri.current, newValue);
      }
    },
    [onChange, lspReady],
  );

  // Set up LSP diagnostics → Monaco markers
  useEffect(() => {
    if (!lspReady || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const uri = documentUri.current;

    const client = getLspClient();
    client.setDiagnosticsHandler((diagUri: string, diagnostics: LspDiagnostic[]) => {
      if (diagUri !== uri) return;
      const model = editorRef.current?.getModel();
      if (!model) return;

      const markers: Monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
        severity: lspSeverityToMonaco(d.severity, monaco),
        message: d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        source: d.source ?? 'LuaLS',
      }));

      monaco.editor.setModelMarkers(model, 'lua-ls', markers);
    });

    return () => {
      client.setDiagnosticsHandler(() => {});
    };
  }, [lspReady]);

  // Register providers
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    // Dispose previous registrations
    for (const d of disposablesRef.current) d.dispose();
    disposablesRef.current = [];

    // Completion provider: merges LSP results with static game completions
    disposablesRef.current.push(
      monaco.languages.registerCompletionItemProvider(LUA_LANGUAGE_ID, {
        triggerCharacters: ['.', ':', '"', "'"],
        async provideCompletionItems(model: Monaco.editor.ITextModel, position: Monaco.Position) {
          const word = model.getWordUntilPosition(position);
          const range: Monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // Start with static game completions
          const lineContent = model.getLineContent(position.lineNumber);
          const textBefore = lineContent.substring(0, position.column - 1);
          const dotMatch = textBefore.match(/([\w]+)[.:]$/);

          let staticItems = gameCompletionItems;
          if (dotMatch) {
            const prefix = dotMatch[1];
            const sep = dotMatch[0].slice(-1);
            staticItems = gameCompletionItems.filter((item) => {
              const label = typeof item.label === 'string' ? item.label : item.label.label;
              return label.startsWith(prefix + sep);
            });
          }

          const suggestions: Monaco.languages.CompletionItem[] = staticItems.map((item) => ({
            ...item,
            range,
          }));

          // Add LSP completions if available
          if (lspReady) {
            try {
              const lspItems = await getLspClient().completion(
                documentUri.current,
                position.lineNumber - 1,
                position.column - 1,
              );
              for (const item of lspItems) {
                suggestions.push(lspCompletionToMonaco(item, range, monaco));
              }
            } catch {
              // LSP request failed, static completions still work
            }
          }

          return { suggestions };
        },
      }),
    );

    // Hover provider (LSP only)
    if (lspReady) {
      disposablesRef.current.push(
        monaco.languages.registerHoverProvider(LUA_LANGUAGE_ID, {
          async provideHover(_model: Monaco.editor.ITextModel, position: Monaco.Position) {
            try {
              const hover = await getLspClient().hover(
                documentUri.current,
                position.lineNumber - 1,
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
                      startLineNumber: hover.range.start.line + 1,
                      startColumn: hover.range.start.character + 1,
                      endLineNumber: hover.range.end.line + 1,
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
            try {
              const sigHelp = await getLspClient().signatureHelp(
                documentUri.current,
                position.lineNumber - 1,
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
  }, [gameCompletionItems, lspReady]);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    ensureLuaLanguage(monaco);
    defineTheme(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;

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
      fixedOverflowWidgets: true,
    });
  };

  return (
    <Editor
      height={height}
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
        fixedOverflowWidgets: true,
      }}
    />
  );
};
