import { ipcRenderer, contextBridge } from 'electron'

// Explicit allowlist — only these channels may be invoked from the renderer.
const ALLOWED_CHANNELS = [
  'app:open-project',
  'app:load-project-by-path',
  'app:create-project',
  'app:fs-read-dir',
  'app:fs-write-json',
  'app:fs-read-json',
  'app:fs-delete-json',
  'app:fs-write-asset',
  'app:fs-read-asset',
  'app:select-asset',
  'app:read-file-buffer',
] as const;

function assertAllowed(channel: string): void {
  if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`IPC channel not permitted: "${channel}"`);
  }
}

// --------- Expose a restricted API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    assertAllowed(channel);
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    assertAllowed(channel);
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    assertAllowed(channel);
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    assertAllowed(channel);
    return ipcRenderer.invoke(channel, ...omit);
  },
})
