import { ipcRenderer, contextBridge } from 'electron';

type IpcListener = Parameters<typeof ipcRenderer.on>[1];
const listeners = new Map<string, Map<IpcListener, IpcListener>>();

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    const channelListeners = listeners.get(channel) ?? new Map();
    if (!listeners.has(channel)) listeners.set(channel, channelListeners);
    if (channelListeners.has(listener)) return;
    const wrapped: IpcListener = (event, ...eventArgs) =>
      listener(event, ...eventArgs);
    channelListeners.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args;
    const channelListeners = listeners.get(channel);
    const wrapped = channelListeners?.get(listener);
    if (wrapped) {
      ipcRenderer.off(channel, wrapped);
      channelListeners?.delete(listener);
      if (channelListeners?.size === 0) listeners.delete(channel);
    }
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },

  // You can expose other APTs you need here.
  // ...
});
