import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScriptingManifestStore, watchScriptingManifest } from './useScriptingManifestStore';
import { getManifestActions } from '../lib/scriptingManifest';
import manifest from '../lib/__fixtures__/cutscene-bindings.json';

const invoke = vi.fn();
const on = vi.fn();
const off = vi.fn();
const storage = { setItem: vi.fn(), removeItem: vi.fn() };
const filename = 'C:/Unity/Generated/Scripting/bindings.json';
const update = (revision: number, content: unknown = manifest, path = filename) => ({
  path,
  revision,
  content,
  error: null,
});

describe('shared filesystem Lua manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { ipcRenderer: { invoke, on, off }, localStorage: storage });
    useScriptingManifestStore.setState({
      path: '',
      manifest: null,
      actionsByContext: {},
      status: 'unconfigured',
      error: null,
      revision: -1,
      lastReadAt: null,
    });
    invoke.mockImplementation(async (channel, path) =>
      channel === 'app:scripting-manifest-watch' && path ? update(1, manifest, path) : null,
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('watches a remembered location without copying or importing the file', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    expect(storage.setItem).toHaveBeenCalledWith('vulcanus.scriptingManifestPath', filename);
    expect(invoke).toHaveBeenCalledWith('app:scripting-manifest-watch', filename);
    const state = useScriptingManifestStore.getState();
    expect(state.status).toBe('ready');
    expect(state.actionsByContext.cutscene).toHaveLength(5);
    expect(state.actionsByContext.npcRoutine).toHaveLength(2);
    expect(
      state.manifest!.modules.some((module) => module.methods.some((method) => !method.action)),
    ).toBe(true);
    expect(getManifestActions(state.manifest!, 'cutscene')).toHaveLength(5);
    expect(state.manifest!.modules[0].methods[0].returnType).toBe('nil');
  });

  it('subscribes across screens, reloads changes, and releases the watcher on app teardown', async () => {
    useScriptingManifestStore.setState({ path: filename });
    const stop = watchScriptingManifest();
    await vi.waitFor(() => expect(useScriptingManifestStore.getState().status).toBe('ready'));
    const listener = on.mock.calls[0][1];
    const changed = structuredClone(manifest);
    changed.modules[0].methods[0].action!.displayName = 'Changed face label';
    listener({}, update(2, changed));
    expect(useScriptingManifestStore.getState().actionsByContext.cutscene[0].displayName).toBe(
      'Changed face label',
    );
    stop();
    expect(off).toHaveBeenCalledWith('app:scripting-manifest-changed', listener);
    expect(invoke).toHaveBeenLastCalledWith('app:scripting-manifest-watch', null);
  });

  it('invalidates all consumers for malformed, unsupported and missing sources, then recovers', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    const store = useScriptingManifestStore.getState();
    store.acceptUpdate(update(2, { schemaVersion: 99, modules: [] }));
    expect(useScriptingManifestStore.getState()).toMatchObject({
      status: 'error',
      manifest: null,
      actionsByContext: {},
    });
    expect(useScriptingManifestStore.getState().error).toContain('schemaVersion 2');
    store.acceptUpdate({ ...update(3, null), error: 'File deleted' });
    expect(useScriptingManifestStore.getState().error).toBe('File deleted');
    store.acceptUpdate(update(4));
    expect(useScriptingManifestStore.getState().status).toBe('ready');
  });

  it('ignores stale reads and events from a previously selected location', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    useScriptingManifestStore.getState().acceptUpdate(update(3));
    useScriptingManifestStore
      .getState()
      .acceptUpdate({ ...update(2, null), error: 'stale failure' });
    expect(useScriptingManifestStore.getState().status).toBe('ready');
    const second = 'C:/Other/bindings.json';
    await useScriptingManifestStore.getState().setPath(second);
    useScriptingManifestStore
      .getState()
      .acceptUpdate({ ...update(9, null), error: 'old location deleted' });
    expect(useScriptingManifestStore.getState()).toMatchObject({
      path: second,
      status: 'ready',
      error: null,
    });
  });

  it('re-reads the current source for export and refuses cached data when reading fails', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    invoke.mockResolvedValueOnce({ ...update(2, null), error: 'Cannot read current manifest' });
    await expect(useScriptingManifestStore.getState().refresh()).rejects.toThrow(
      'Cannot read current manifest',
    );
    expect(useScriptingManifestStore.getState().actionsByContext).toEqual({});
    invoke.mockResolvedValueOnce(update(3));
    expect((await useScriptingManifestStore.getState().refresh()).schemaVersion).toBe(2);
  });

  it('clears the preference and stops watching when the location is cleared', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    await useScriptingManifestStore.getState().setPath('');
    expect(storage.removeItem).toHaveBeenCalledWith('vulcanus.scriptingManifestPath');
    expect(invoke).toHaveBeenLastCalledWith('app:scripting-manifest-watch', null);
    expect(useScriptingManifestStore.getState()).toMatchObject({
      path: '',
      manifest: null,
      status: 'unconfigured',
    });
    await expect(useScriptingManifestStore.getState().refresh()).rejects.toThrow('Scripting');
  });

  it('uses a newer validated watch update when it supersedes an in-flight refresh', async () => {
    await useScriptingManifestStore.getState().setPath(filename);
    invoke.mockImplementationOnce(async () => {
      useScriptingManifestStore.getState().acceptUpdate(update(3));
      return null;
    });
    expect((await useScriptingManifestStore.getState().refresh()).schemaVersion).toBe(2);
    expect(useScriptingManifestStore.getState().status).toBe('ready');
  });
});
