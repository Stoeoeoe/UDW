import { create } from 'zustand';
import {
  getManifestActions,
  parseScriptingManifest,
  type ManifestFileUpdate,
  type ScriptingAction,
  type ScriptingManifest,
} from '../lib/scriptingManifest';

const STORAGE_KEY = 'vulcanus.scriptingManifestPath';
function savedPath(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
const missingSource = 'Configure the Lua manifest filesystem location in Scripting → Lua Manifest.';

interface ScriptingManifestStore {
  path: string;
  manifest: ScriptingManifest | null;
  actionsByContext: Record<string, ScriptingAction[]>;
  status: 'unconfigured' | 'loading' | 'ready' | 'error';
  error: string | null;
  revision: number;
  lastReadAt: string | null;
  setPath: (path: string) => Promise<void>;
  acceptUpdate: (update: ManifestFileUpdate) => void;
  refresh: () => Promise<ScriptingManifest>;
}

export const useScriptingManifestStore = create<ScriptingManifestStore>((set, get) => ({
  path: savedPath(),
  manifest: null,
  actionsByContext: {},
  status: 'unconfigured',
  error: null,
  revision: -1,
  lastReadAt: null,
  acceptUpdate: (update) => {
    if (update.path !== get().path || update.revision <= get().revision) return;
    try {
      if (update.error) throw new Error(update.error);
      const manifest = parseScriptingManifest(update.content);
      const actions = getManifestActions(manifest);
      const contexts = new Set(actions.flatMap((a) => a.contexts));
      set({
        manifest,
        actionsByContext: Object.fromEntries(
          [...contexts].map((context) => [
            context,
            actions.filter((a) => a.contexts.includes(context)),
          ]),
        ),
        status: 'ready',
        error: null,
        revision: update.revision,
        lastReadAt: new Date().toISOString(),
      });
    } catch (e) {
      // Invalid/deleted sources invalidate consumers immediately; no stale palette.
      set({
        manifest: null,
        actionsByContext: {},
        status: 'error',
        error: (e as Error).message,
        revision: update.revision,
        lastReadAt: new Date().toISOString(),
      });
    }
  },
  setPath: async (input) => {
    const filename = input.trim();
    set({
      path: filename,
      manifest: null,
      actionsByContext: {},
      status: filename ? 'loading' : 'unconfigured',
      error: null,
      revision: -1,
      lastReadAt: null,
    });
    try {
      if (filename) window.localStorage.setItem(STORAGE_KEY, filename);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* The current session still works without persistent preferences. */
    }
    try {
      if (!('ipcRenderer' in window)) {
        if (filename)
          throw new Error('Filesystem manifest watching is available in the desktop editor.');
        return;
      }
      const update = (await window.ipcRenderer.invoke(
        'app:scripting-manifest-watch',
        filename || null,
      )) as ManifestFileUpdate | null;
      if (update) get().acceptUpdate(update);
    } catch (e) {
      if (get().path === filename) set({ status: 'error', error: (e as Error).message });
    }
  },
  refresh: async () => {
    const filename = get().path;
    const previousRevision = get().revision;
    if (!filename) throw new Error(missingSource);
    try {
      if (!('ipcRenderer' in window))
        throw new Error('Filesystem manifest watching is available in the desktop editor.');
      const update = (await window.ipcRenderer.invoke(
        'app:scripting-manifest-refresh',
      )) as ManifestFileUpdate | null;
      if (get().path !== filename)
        throw new Error('The Lua manifest location changed during validation. Try again.');
      if (!update) {
        const latest = get();
        if (latest.revision > previousRevision && latest.status === 'ready' && latest.manifest)
          return latest.manifest;
        throw new Error('The Lua manifest changed while being read. Try again.');
      }
      get().acceptUpdate(update);
      const state = get();
      if (!state.manifest || state.status !== 'ready')
        throw new Error(state.error ?? missingSource);
      return state.manifest;
    } catch (e) {
      if (get().path === filename)
        set({ manifest: null, actionsByContext: {}, status: 'error', error: (e as Error).message });
      throw e;
    }
  },
}));

/** Subscribe for the lifetime of the app, including while other screens are open. */
export function watchScriptingManifest(): () => void {
  if (!('ipcRenderer' in window)) return () => {};
  const ipc = window.ipcRenderer;
  const listener = (_event: unknown, update: ManifestFileUpdate) =>
    useScriptingManifestStore.getState().acceptUpdate(update);
  ipc.on('app:scripting-manifest-changed', listener);
  void useScriptingManifestStore.getState().setPath(useScriptingManifestStore.getState().path);
  return () => {
    ipc.off('app:scripting-manifest-changed', listener);
    void ipc.invoke('app:scripting-manifest-watch', null).catch(() => undefined);
  };
}
