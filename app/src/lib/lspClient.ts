/**
 * Lightweight LSP client for the renderer process.
 *
 * Communicates with lua-language-server via Electron IPC (main process relay).
 * Provides a high-level API that integrates with Monaco editor.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  source?: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  insertTextFormat?: number; // 1=PlainText, 2=Snippet
  textEdit?: {
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    newText: string;
  };
  sortText?: string;
  filterText?: string;
}

export interface LspHover {
  contents:
    | string
    | { kind: string; value: string }
    | Array<string | { kind: string; value: string }>;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LspSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string | { kind: string; value: string };
    parameters?: Array<{
      label: string | [number, number];
      documentation?: string | { kind: string; value: string };
    }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}

type MessageHandler = (msg: LspServerMessage) => void;

interface LspServerMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Client ──────────────────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.ipcRenderer;
}

export class LuaLspClient {
  private nextId = 1;
  private initialized = false;
  private onDiagnostics: ((uri: string, diagnostics: LspDiagnostic[]) => void) | null = null;
  private messageHandlers: MessageHandler[] = [];
  private openDocuments = new Map<string, { version: number; content: string }>();
  private listening = false;
  private readonly handleIpcMessage = (_event: unknown, msg: LspServerMessage) => {
    this.handleServerMessage(msg);
  };

  /** Register a diagnostics callback */
  setDiagnosticsHandler(handler: (uri: string, diagnostics: LspDiagnostic[]) => void) {
    this.onDiagnostics = handler;
  }

  /** Start the language server and initialize the LSP session */
  async start(workspacePath?: string): Promise<boolean> {
    if (!isElectron()) return false;
    if (this.initialized) return true;

    // Listen for server messages
    if (!this.listening) {
      window.ipcRenderer.on('lsp:message', this.handleIpcMessage);
      this.listening = true;
    }

    // Start the server process
    let result: { ok: boolean };
    try {
      result = (await window.ipcRenderer.invoke('lsp:start', workspacePath)) as { ok: boolean };
    } catch (error) {
      this.removeIpcListener();
      throw error;
    }
    if (!result.ok) {
      this.removeIpcListener();
      return false;
    }

    // Send initialize request
    const initResult = await this.sendRequest('initialize', {
      processId: null,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              resolveSupport: { properties: ['documentation', 'detail'] },
            },
            contextSupport: true,
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
            },
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      rootUri: workspacePath ? `file:///${workspacePath.replace(/\\/g, '/')}` : null,
      workspaceFolders: workspacePath
        ? [{ uri: `file:///${workspacePath.replace(/\\/g, '/')}`, name: 'workspace' }]
        : null,
    });

    if (initResult) {
      // Send initialized notification
      this.sendNotification('initialized', {});
      this.initialized = true;
    }

    if (!this.initialized) this.removeIpcListener();
    return this.initialized;
  }

  /** Stop the language server */
  async stop() {
    if (!isElectron()) return;

    if (this.initialized) {
      try {
        await this.sendRequest('shutdown', null);
        this.sendNotification('exit', null);
      } catch {
        // Server may already be dead
      }
    }

    try {
      await window.ipcRenderer.invoke('lsp:stop');
    } finally {
      this.removeIpcListener();
    }
    this.initialized = false;
    this.openDocuments.clear();
  }

  private removeIpcListener() {
    if (!this.listening) return;
    window.ipcRenderer.off('lsp:message', this.handleIpcMessage);
    this.listening = false;
  }

  /** Check if the LuaLS binary is available */
  async isAvailable(): Promise<boolean> {
    if (!isElectron()) return false;
    const result = (await window.ipcRenderer.invoke('lsp:check')) as { available: boolean };
    return result.available;
  }

  get isInitialized() {
    return this.initialized;
  }

  // ─── Document sync ───────────────────────────────────────────────────────

  /** Open a document in the language server */
  openDocument(uri: string, content: string) {
    if (!this.initialized) return;

    this.openDocuments.set(uri, { version: 1, content });
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'lua',
        version: 1,
        text: content,
      },
    });
  }

  /** Update a document's content */
  updateDocument(uri: string, content: string) {
    if (!this.initialized) return;

    const doc = this.openDocuments.get(uri);
    const version = (doc?.version ?? 0) + 1;
    this.openDocuments.set(uri, { version, content });

    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  /** Close a document */
  closeDocument(uri: string) {
    if (!this.initialized) return;

    this.openDocuments.delete(uri);
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  // ─── LSP features ─────────────────────────────────────────────────────────

  /** Request completions at a position */
  async completion(uri: string, line: number, character: number): Promise<LspCompletionItem[]> {
    if (!this.initialized) return [];

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    });

    if (!result) return [];

    // Result can be CompletionList or CompletionItem[]
    const items = Array.isArray(result) ? result : (result as { items: LspCompletionItem[] }).items;
    return items ?? [];
  }

  /** Request hover info at a position */
  async hover(uri: string, line: number, character: number): Promise<LspHover | null> {
    if (!this.initialized) return null;

    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });

    return (result as LspHover) ?? null;
  }

  /** Request signature help at a position */
  async signatureHelp(
    uri: string,
    line: number,
    character: number,
  ): Promise<LspSignatureHelp | null> {
    if (!this.initialized) return null;

    const result = await this.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position: { line, character },
    });

    return (result as LspSignatureHelp) ?? null;
  }

  // ─── Low-level JSON-RPC ────────────────────────────────────────────────────

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };

    try {
      const response = (await window.ipcRenderer.invoke('lsp:request', msg)) as LspServerMessage;
      if (response.error) {
        console.warn(`[LSP] Error in ${method}:`, response.error);
        return null;
      }
      return response.result;
    } catch (err) {
      console.warn(`[LSP] Request failed for ${method}:`, err);
      return null;
    }
  }

  private sendNotification(method: string, params: unknown) {
    const msg = { jsonrpc: '2.0', method, params };
    window.ipcRenderer.send('lsp:send', msg);
  }

  private handleServerMessage(msg: LspServerMessage) {
    // Handle diagnostics notifications
    if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
      const { uri, diagnostics } = msg.params as { uri: string; diagnostics: LspDiagnostic[] };
      this.onDiagnostics?.(uri, diagnostics);
    }

    // Forward to registered handlers
    for (const handler of this.messageHandlers) {
      handler(msg);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance: LuaLspClient | null = null;

export function getLspClient(): LuaLspClient {
  if (!instance) {
    instance = new LuaLspClient();
  }
  return instance;
}
