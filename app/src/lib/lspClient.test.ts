import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuaLspClient } from './lspClient';

afterEach(() => {
  delete (window as Partial<Window>).ipcRenderer;
});

describe('LuaLS diagnostics subscriptions', () => {
  it('keeps other editor subscriptions alive when one editor closes', async () => {
    let receive: (_event: unknown, message: unknown) => void;
    const ipc = {
      on: vi.fn((_channel, listener) => {
        receive = listener;
      }),
      off: vi.fn(),
      send: vi.fn(),
      invoke: vi.fn(async (channel) => (channel === 'lsp:start' ? { ok: true } : { result: {} })),
    };
    Object.defineProperty(window, 'ipcRenderer', { value: ipc, configurable: true });
    const client = new LuaLspClient();
    await client.start();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = client.subscribeDiagnostics(first);
    const unsubscribeSecond = client.subscribeDiagnostics(second);
    const message = {
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: 'inmemory://second.lua',
        diagnostics: [{ message: 'Syntax error' }],
      },
    };
    receive!(null, message);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    unsubscribeFirst();
    receive!(null, message);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribeSecond();
    await client.stop();
    expect(ipc.off).toHaveBeenCalledWith('lsp:message', expect.any(Function));
  });
});
