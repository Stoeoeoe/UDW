import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { ManifestFileUpdate } from '../src/lib/scriptingManifest';

/** One tool-wide source, independent of project asset watchers and editor screens. */
export class ScriptingManifestWatcher {
  private watcher: FSWatcher | null = null;
  private filename: string | null = null;
  private generation = 0;
  private revision = 0;
  private cancelPendingReady: (() => void) | null = null;
  private watchError: string | null = null;

  constructor(private readonly publish: (update: ManifestFileUpdate) => void) {}

  async watch(filename: string | null): Promise<ManifestFileUpdate | null> {
    const generation = ++this.generation;
    this.cancelPendingReady?.();
    this.cancelPendingReady = null;
    this.watchError = null;
    this.filename = null;
    const previous = this.watcher;
    this.watcher = null;
    await previous?.close();
    if (generation !== this.generation || !filename) return null;
    if (!path.isAbsolute(filename))
      throw new Error('Choose an absolute filesystem path for the Lua manifest.');
    this.filename = filename;
    // Watch the containing directory so deletion/recreation and atomic file
    // replacement keep working even when the selected file does not exist yet.
    const watcher = chokidar.watch(path.dirname(filename), {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
    this.watcher = watcher;
    const fileKey = (value: string) =>
      process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    watcher.on('all', (event, changedPath) => {
      if (
        generation === this.generation &&
        fileKey(changedPath) === fileKey(filename) &&
        ['add', 'change', 'unlink'].includes(event)
      )
        void this.refresh();
    });
    watcher.on('error', (error) => {
      if (generation === this.generation) {
        this.watchError = `Cannot watch Lua manifest: ${String(error)}`;
        this.publish({
          path: filename,
          revision: ++this.revision,
          content: null,
          error: this.watchError,
        });
      }
    });
    // Wait until the OS subscription is ready before reading, including when
    // watching a file which has not been generated yet.
    await new Promise<void>((resolve) => {
      this.cancelPendingReady = resolve;
      watcher.once('ready', resolve);
      watcher.once('error', () => resolve());
    });
    if (generation !== this.generation) return null;
    this.cancelPendingReady = null;
    return this.refresh();
  }

  async refresh(): Promise<ManifestFileUpdate | null> {
    const filename = this.filename;
    if (!filename) return null;
    const generation = this.generation;
    const revision = ++this.revision;
    let content: unknown = null;
    let error: string | null = null;
    try {
      content = JSON.parse(await fs.readFile(filename, 'utf8'));
    } catch (e) {
      error = `Cannot read Lua manifest ${filename}: ${(e as Error).message}`;
    }
    if (generation !== this.generation || revision !== this.revision) return null;
    if (this.watchError) {
      content = null;
      error = this.watchError;
    }
    const update = { path: filename, revision, content, error };
    this.publish(update);
    return update;
  }

  async close(): Promise<void> {
    await this.watch(null);
  }
}
