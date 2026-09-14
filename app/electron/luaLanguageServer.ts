/**
 * LuaLS (lua-language-server) process manager for the Electron main process.
 *
 * Spawns the language server in --stdio mode and relays JSON-RPC messages
 * between the child process and the renderer via Electron IPC.
 */
import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, BrowserWindow, app } from 'electron';

// ─── JSON-RPC message framing ────────────────────────────────────────────────

/**
 * Parses LSP JSON-RPC messages from a raw data buffer.
 * LSP messages use HTTP-style headers: `Content-Length: N\r\n\r\n{...}`
 */
class JsonRpcReader {
  private buffer = '';
  private onMessage: (msg: unknown) => void;

  constructor(onMessage: (msg: unknown) => void) {
    this.onMessage = onMessage;
  }

  feed(data: string) {
    this.buffer += data;
    this.drain();
  }

  private drain() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Malformed header — skip past it
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;

      if (this.buffer.length < bodyStart + contentLength) {
        break; // Need more data
      }

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        this.onMessage(JSON.parse(body));
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

function encodeJsonRpc(msg: unknown): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`;
}

// ─── LuaLS executable resolution ────────────────────────────────────────────

function findLuaLSExecutable(): string | null {
  const appRoot = process.env.APP_ROOT ?? path.join(__dirname, '..');
  const exeName = process.platform === 'win32' ? 'lua-language-server.exe' : 'lua-language-server';

  // Check several locations in priority order:
  const candidates = [
    // 1. resources/ folder (dev mode, after running download script)
    path.join(appRoot, 'resources', 'lua-language-server', 'bin', exeName),
    // 2. extraResources in production build
    path.join(process.resourcesPath ?? '', 'lua-language-server', 'bin', exeName),
    // 3. Root of the resources dir (some builds flatten)
    path.join(appRoot, 'resources', 'lua-language-server', exeName),
    path.join(process.resourcesPath ?? '', 'lua-language-server', exeName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ─── LuaLS session management ────────────────────────────────────────────────

let luaProcess: ChildProcess | null = null;
let reader: JsonRpcReader | null = null;
let win: BrowserWindow | null = null;
// Track pending requests from the renderer so we can resolve them
const pendingRequests = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function killLuaProcess() {
  if (luaProcess) {
    luaProcess.kill();
    luaProcess = null;
  }
  reader = null;
  pendingRequests.clear();
}

function spawnLuaLS(workspacePath?: string): boolean {
  killLuaProcess();

  const exePath = findLuaLSExecutable();
  if (!exePath) {
    console.warn(
      '[LuaLS] lua-language-server executable not found. Run: node scripts/download-lua-language-server.mjs',
    );
    return false;
  }

  console.log('[LuaLS] Spawning:', exePath);

  const args = ['--stdio'];
  if (workspacePath) {
    args.push(`--logpath=${path.join(workspacePath, '.luals-log')}`);
  }

  luaProcess = spawn(exePath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: workspacePath || undefined,
  });

  reader = new JsonRpcReader((msg) => {
    // Forward all server messages to the renderer
    win?.webContents.send('lsp:message', msg);

    // If this is a response (has id), resolve the pending promise
    const rpcMsg = msg as { id?: number };
    if (rpcMsg.id !== undefined && pendingRequests.has(rpcMsg.id)) {
      pendingRequests.get(rpcMsg.id)!.resolve(msg);
      pendingRequests.delete(rpcMsg.id);
    }
  });

  luaProcess.stdout?.setEncoding('utf-8');
  luaProcess.stdout?.on('data', (data: string) => {
    reader?.feed(data);
  });

  luaProcess.stderr?.setEncoding('utf-8');
  luaProcess.stderr?.on('data', (data: string) => {
    // Log LuaLS stderr for debugging, don't forward
    console.warn('[LuaLS stderr]', data);
  });

  luaProcess.on('exit', (code) => {
    console.log('[LuaLS] Process exited with code', code);
    luaProcess = null;
  });

  return true;
}

function sendToLuaLS(msg: unknown) {
  if (!luaProcess?.stdin?.writable) return;
  luaProcess.stdin.write(encodeJsonRpc(msg));
}

// ─── IPC setup ───────────────────────────────────────────────────────────────

export function setupLuaLSHandlers(browserWindow: BrowserWindow) {
  win = browserWindow;

  // Start/restart the language server (optionally with a workspace path)
  ipcMain.handle('lsp:start', async (_event, workspacePath?: string) => {
    const ok = spawnLuaLS(workspacePath);
    return { ok, executable: ok ? findLuaLSExecutable() : null };
  });

  // Send a JSON-RPC message to the language server
  ipcMain.on('lsp:send', (_event, msg: unknown) => {
    sendToLuaLS(msg);
  });

  // Send a request and wait for the response
  ipcMain.handle('lsp:request', async (_event, msg: unknown) => {
    return new Promise((resolve, reject) => {
      const rpcMsg = msg as { id: number };
      pendingRequests.set(rpcMsg.id, { resolve, reject });
      sendToLuaLS(msg);

      // Timeout after 10s
      setTimeout(() => {
        if (pendingRequests.has(rpcMsg.id)) {
          pendingRequests.delete(rpcMsg.id);
          reject(new Error('LSP request timed out'));
        }
      }, 10_000);
    });
  });

  // Stop the language server
  ipcMain.handle('lsp:stop', async () => {
    killLuaProcess();
    return { ok: true };
  });

  // Check if LuaLS binary is available
  ipcMain.handle('lsp:check', async () => {
    const exe = findLuaLSExecutable();
    return { available: exe !== null, path: exe };
  });

  // Cleanup on app quit
  app.on('before-quit', () => {
    killLuaProcess();
  });
}
