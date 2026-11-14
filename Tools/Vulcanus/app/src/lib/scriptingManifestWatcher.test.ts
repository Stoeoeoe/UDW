// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ScriptingManifestWatcher } from '../../electron/scriptingManifestWatcher';
import type { ManifestFileUpdate } from './scriptingManifest';

describe('Lua manifest filesystem watcher', () => {
  let directory: string;
  let watcher: ScriptingManifestWatcher;
  let updates: ManifestFileUpdate[];
  const source = (marker: string) => JSON.stringify({ schemaVersion: 2, modules: [], marker });
  const latestMarker = () => (updates.at(-1)?.content as { marker?: string } | null)?.marker;
  const waitForMarker = (marker: string) =>
    vi.waitFor(() => expect(latestMarker()).toBe(marker), { timeout: 8000, interval: 50 });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'vulcanus-manifest-test-'));
    updates = [];
    watcher = new ScriptingManifestWatcher((update) => updates.push(update));
  });
  afterEach(async () => {
    await watcher.close();
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith('vulcanus-manifest-test-')
    )
      throw new Error('Unexpected test cleanup directory');
    await fs.rm(resolved, { recursive: true, force: true });
  });

  it('reads in place and re-reads edits, atomic replacement, deletion and recreation', async () => {
    const filename = path.join(directory, 'bindings.json');
    await fs.writeFile(filename, source('initial'));
    const initial = await watcher.watch(filename);
    expect((initial!.content as { marker: string }).marker).toBe('initial');
    await fs.writeFile(filename, source('edited'));
    await waitForMarker('edited');
    await fs.writeFile(filename, '{ invalid json');
    await vi.waitFor(() => expect(updates.at(-1)?.error).toContain(filename), { timeout: 8000 });
    expect(updates.at(-1)?.content).toBeNull();
    const replacement = path.join(directory, 'replacement.json');
    await fs.writeFile(replacement, source('replaced'));
    await fs.rename(replacement, filename);
    await waitForMarker('replaced');
    await fs.unlink(filename);
    await vi.waitFor(() => expect(updates.at(-1)?.error).toContain('Cannot read'), {
      timeout: 8000,
    });
    await fs.writeFile(filename, source('recreated'));
    await waitForMarker('recreated');
  }, 30000);

  it('waits for a missing source to be generated and switches to a different location', async () => {
    const first = path.join(directory, 'first.json');
    expect((await watcher.watch(first))?.error).toContain('Cannot read');
    await fs.writeFile(first, source('generated'));
    await waitForMarker('generated');
    const second = path.join(directory, 'second.json');
    await fs.writeFile(second, source('second'));
    expect((await watcher.watch(second))?.path).toBe(second);
    await fs.writeFile(first, source('old-location'));
    expect((await watcher.refresh())?.path).toBe(second);
    expect(latestMarker()).toBe('second');
    await watcher.close();
    expect(await watcher.refresh()).toBeNull();
  }, 15000);

  it('rejects relative locations', async () => {
    await expect(watcher.watch('bindings.json')).rejects.toThrow('absolute filesystem path');
  });
});
