import { createHash, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { clipSchema, type ClipSpec } from '../src/clips/schema';
import { Filmcraft, filmcraftExe, runFilmcraftCli } from './filmcraft';

export type Revision = {
  id: string;
  clipId: string;
  created: string;
  clip: ClipSpec;
};
export type RenderJob = {
  id: string;
  clipId: string;
  status: 'rendering' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  revision?: Revision;
};
export type TimelineClip = {
  clip: number;
  item: number;
  name: string;
  start: number;
  end: number;
  sourceIn: number;
  sourceOut: number;
  [key: string]: unknown;
};
type Track = {
  id: number;
  name: string;
  items: TimelineClip[];
  locked: boolean;
  transitions: unknown[];
};
export type Sequence = {
  id: number;
  name: string;
  settings: {
    width: number;
    height: number;
    frame_rate: { num: number; den: number };
  };
  video: Track[];
  audio: Track[];
  [key: string]: unknown;
};
type Tree = {
  id?: number;
  item?: number;
  name: string;
  type?: string;
  children?: Tree[];
};
export type Project = {
  name: string;
  path: string | null;
  activeSequence: number | null;
  revision: number;
  root: Tree;
};
export type Connection =
  | {
      connected: true;
      stamp: string;
      project: Project;
      sequence: Sequence | null;
      sequences: Sequence[];
    }
  | { connected: false; error: string };
const flatten = (tree: Tree): Tree[] => [
  tree,
  ...(tree.children ?? []).flatMap(flatten),
];
const revisionId = z.string().regex(/^r\d+-[a-f0-9]{6}$/);
const clipId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const revisionSchema = z
  .object({ id: revisionId, clipId, created: z.string(), clip: clipSchema })
  .strict();
export const handoffSchema = z
  .object({
    mode: z.enum(['import', 'place', 'occurrence', 'all']),
    clipId,
    revisionId,
    stamp: z.string(),
    targetClip: z.number().int().positive().optional(),
    targetItem: z.number().int().positive().optional(),
    track: z.number().int().positive().optional(),
    frame: z.number().int().nonnegative().optional(),
  })
  .strict();
export type Handoff = z.infer<typeof handoffSchema>;
export const sequenceRequestSchema = z
  .object({ name: z.string().trim().min(1).max(100), stamp: z.string().min(1) })
  .strict();
const ticksPerSecond = 254016000000;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const requireCoverage = (sourceOut: number, frames: number) => {
  if (sourceOut > (frames / 30) * ticksPerSecond)
    throw new Error(
      `Replacement is too short: this use needs source through ${(sourceOut / ticksPerSecond).toFixed(3)}s; the revision is ${(frames / 30).toFixed(3)}s.`,
    );
};
export const requireSpace = (track: Track, start: number, end: number) => {
  if (track.locked) throw new Error('The destination track is locked.');
  if (track.items.some((clip) => start < clip.end && end > clip.start))
    throw new Error(
      'That range is occupied. Choose another position or track; existing clips were not moved.',
    );
};

export class ClipService {
  readonly root = resolve(process.cwd());
  readonly media = resolve(
    process.env.MERCURIUS_MEDIA_ROOT ?? resolve(this.root, 'media'),
  );
  readonly recipes = resolve(this.root, 'clips');
  private token =
    process.env.FILMCRAFT_CONTROL_TOKEN ?? randomBytes(32).toString('hex');
  readonly port = Number(process.env.FILMCRAFT_CONTROL_PORT ?? 9876);
  private client = new Filmcraft(this.port, this.token);
  private child?: ChildProcess;
  private renderChild?: ChildProcess;
  private rendering = false;
  private isCancelled() {
    return this.job?.status === 'cancelled';
  }
  private handoffBusy = false;
  job: RenderJob | null = null;
  constructor() {
    process.env.FILMCRAFT_CONTROL_TOKEN = this.token;
  }

  async clips() {
    await mkdir(this.recipes, { recursive: true });
    return Promise.all(
      (await readdir(this.recipes))
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const clip = clipSchema.parse(
            JSON.parse(await readFile(resolve(this.recipes, name), 'utf8')),
          );
          if (name !== `${clip.id}.json`)
            throw new Error(
              `Clip identity does not match its filename: ${name}`,
            );
          return clip;
        }),
    );
  }
  async save(value: unknown) {
    const clip = clipSchema.parse(value);
    await mkdir(this.recipes, { recursive: true });
    const path = resolve(this.recipes, `${clip.id}.json`);
    const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(clip, null, 2) + '\n');
    await rename(temporary, path);
    return clip;
  }
  async revision(id: string, revision: string) {
    clipId.parse(id);
    revisionId.parse(revision);
    const saved = revisionSchema.parse(
      JSON.parse(
        await readFile(resolve(this.media, id, `${revision}.json`), 'utf8'),
      ),
    );
    if (saved.clipId !== id || saved.id !== revision || saved.clip.id !== id)
      throw new Error('Revision identity does not match its file.');
    return saved;
  }
  mediaFile(id: string, revision: string) {
    clipId.parse(id);
    revisionId.parse(revision);
    return resolve(this.media, id, `${revision}.mp4`);
  }
  async revisions() {
    await mkdir(this.media, { recursive: true });
    const results: Revision[] = [];
    for (const directory of await readdir(this.media, {
      withFileTypes: true,
    })) {
      if (!directory.isDirectory() || !clipId.safeParse(directory.name).success)
        continue;
      for (const name of await readdir(resolve(this.media, directory.name))) {
        if (
          name.endsWith('.json') &&
          revisionId.safeParse(name.slice(0, -5)).success
        )
          results.push(await this.revision(directory.name, name.slice(0, -5)));
      }
    }
    return results.sort((a, b) => b.created.localeCompare(a.created));
  }
  async connection(): Promise<Connection> {
    try {
      const project = await this.client.execute<Project>('project.inspect');
      const sequences: Sequence[] = [];
      for (const item of flatten(project.root).filter(
        (item) => item.type === 'Sequence',
      ))
        sequences.push(
          await this.client.execute<Sequence>('sequence.inspect', {
            item: item.item,
          }),
        );
      const sequence =
        sequences.find((sequence) => sequence.id === project.activeSequence) ??
        null;
      return {
        connected: true,
        stamp: hash({ project, sequences }),
        project,
        sequence,
        sequences,
      };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }
  async startFilmcraft(projectPath?: string) {
    if (projectPath) {
      if (!projectPath.toLowerCase().endsWith('.fcproj'))
        throw new Error('Choose a .fcproj project file.');
      await stat(resolve(projectPath));
    }
    if (this.child && this.child.exitCode === null)
      throw new Error(
        'The FilmCraft session launched here is already running. Refresh the connection.',
      );
    const connection = await this.connection();
    if (connection.connected) return connection;
    await mkdir(resolve(this.root, '.local/filmcraft'), { recursive: true });
    this.child = spawn(
      filmcraftExe(),
      [
        '--no-recover',
        '--data-dir',
        resolve(this.root, '.local/filmcraft'),
        '--control',
        String(this.port),
        ...(projectPath ? [resolve(projectPath)] : ['--empty']),
      ],
      {
        env: { ...process.env, FILMCRAFT_CONTROL_TOKEN: this.token },
        stdio: 'ignore',
      },
    );
    let launchError: Error | undefined;
    this.child.on('error', (error) => {
      launchError = error;
    });
    for (let attempt = 0; attempt < 30; attempt++) {
      if (launchError) throw launchError;
      const status = await this.connection();
      if (status.connected) return status;
      if (this.child.exitCode !== null)
        throw new Error(
          'FilmCraft exited before connecting. Check its installation and control port.',
        );
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error(
      'FilmCraft started but did not connect. A different session may be using the control port. Your existing sessions were not closed.',
    );
  }
  async render(id: string) {
    if (this.rendering)
      throw new Error(
        'A render is already running. Finish or cancel it first.',
      );
    clipId.parse(id);
    const clip = clipSchema.parse(
      JSON.parse(await readFile(resolve(this.recipes, `${id}.json`), 'utf8')),
    );
    if (clip.id !== id)
      throw new Error('Clip identity does not match its filename.');
    const revision = {
      id: `r${Date.now()}-${randomBytes(3).toString('hex')}`,
      clipId: id,
      created: new Date().toISOString(),
      clip,
    };
    const job: RenderJob = {
      id: revision.id,
      clipId: id,
      status: 'rendering',
      progress: 0,
    };
    this.job = job;
    this.rendering = true;
    void this.performRender(job, revision);
    return job;
  }
  private async performRender(job: RenderJob, revision: Revision) {
    const directory = resolve(this.media, revision.clipId);
    const final = this.mediaFile(revision.clipId, revision.id);
    const temporary = final.replace('.mp4', '.partial.mp4');
    const props = resolve(this.root, '.local', `${revision.id}.props.json`);
    try {
      await mkdir(directory, { recursive: true });
      await mkdir(resolve(this.root, '.local'), { recursive: true });
      await writeFile(props, JSON.stringify({ clip: revision.clip }));
      if (this.isCancelled()) return;
      await new Promise<void>((accept, reject) => {
        const child = spawn(
          process.execPath,
          [
            resolve(this.root, 'node_modules/@remotion/cli/remotion-cli.js'),
            'render',
            'src/index.ts',
            'MercuriusClip',
            temporary,
            `--props=${props}`,
            '--gl=angle',
            '--concurrency=2',
          ],
          { cwd: this.root, windowsHide: true },
        );
        this.renderChild = child;
        let log = '';
        const output = (chunk: Buffer) => {
          const value = chunk.toString();
          log = (log + value).slice(-12000);
          const matches = [...value.matchAll(/Rendered\s+(\d+)\/(\d+)/g)];
          if (matches.length) {
            const match = matches[matches.length - 1];
            job.progress = Number(match[1]) / Number(match[2]);
          }
        };
        child.stdout.on('data', output);
        child.stderr.on('data', output);
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0
            ? accept()
            : reject(
                new Error(
                  job.status === 'cancelled'
                    ? 'Render cancelled.'
                    : log || `Renderer exited ${code}`,
                ),
              ),
        );
      });
      if (this.isCancelled()) return;
      if ((await stat(temporary)).size === 0)
        throw new Error('The renderer wrote an empty file.');
      const probe = JSON.parse(await runFilmcraftCli(['probe', temporary]));
      if (
        probe.video?.width !== 1080 ||
        probe.video?.height !== 1920 ||
        probe.video?.frame_rate?.num !== 30 ||
        probe.video?.frame_rate?.den !== 1 ||
        probe.duration !== (revision.clip.durationFrames / 30) * ticksPerSecond
      )
        throw new Error(
          'Rendered media does not match the clip dimensions, rate, or duration.',
        );
      if (this.isCancelled()) return;
      await rename(temporary, final);
      await writeFile(
        resolve(directory, `${revision.id}.json.tmp`),
        JSON.stringify(revision, null, 2),
      );
      await rename(
        resolve(directory, `${revision.id}.json.tmp`),
        resolve(directory, `${revision.id}.json`),
      );
      job.status = 'complete';
      job.progress = 1;
      job.revision = revision;
    } catch (error) {
      if (job.status !== 'cancelled') {
        job.status = 'failed';
        job.error = (error as Error).message;
      }
    } finally {
      this.renderChild = undefined;
      await rm(temporary, { force: true });
      await rm(props, { force: true });
      this.rendering = false;
    }
  }
  cancel(id: string) {
    if (this.job?.id !== id || this.job.status !== 'rendering')
      throw new Error('That render is not running.');
    this.job.status = 'cancelled';
    if (this.renderChild?.pid) {
      if (process.platform === 'win32') {
        const killer = spawn(
          'taskkill',
          ['/pid', String(this.renderChild.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' },
        );
        killer.on('error', () => this.renderChild?.kill());
      } else this.renderChild.kill('SIGTERM');
    }
    return this.job;
  }

  async handoff(value: unknown) {
    const request = handoffSchema.parse(value);
    if (this.handoffBusy)
      throw new Error('Another FilmCraft handoff is in progress.');
    this.handoffBusy = true;
    try {
      return await this.performHandoff(request);
    } finally {
      this.handoffBusy = false;
    }
  }
  async createSequence(value: unknown) {
    const request = sequenceRequestSchema.parse(value);
    if (this.handoffBusy)
      throw new Error('Another FilmCraft operation is in progress.');
    this.handoffBusy = true;
    try {
      const before = await this.connection();
      if (!before.connected) throw new Error(before.error);
      if (before.stamp !== request.stamp)
        throw new Error(
          'FilmCraft changed. Refresh the connection before creating a sequence.',
        );
      if (before.sequence)
        throw new Error(
          'A sequence is already open. Use that timeline, or create another sequence inside FilmCraft.',
        );
      await this.client.execute('file.newSequence', {
        name: request.name,
        width: 1080,
        height: 1920,
        fps: 30,
      });
      return this.connection();
    } finally {
      this.handoffBusy = false;
    }
  }
  private async performHandoff(request: Handoff) {
    const revision = await this.revision(request.clipId, request.revisionId);
    const path = this.mediaFile(request.clipId, request.revisionId);
    await stat(path);
    const before = await this.connection();
    if (!before.connected) throw new Error(before.error);
    if (before.stamp !== request.stamp)
      throw new Error(
        'FilmCraft changed since you chose the destination. Refresh and check the target again. No handoff was applied.',
      );
    const sequence = before.sequence;
    if (request.mode !== 'import' && !sequence)
      throw new Error('Open a sequence in FilmCraft first.');
    if (
      sequence &&
      (sequence.settings.width !== 1080 ||
        sequence.settings.height !== 1920 ||
        sequence.settings.frame_rate.num !== 30 ||
        sequence.settings.frame_rate.den !== 1) &&
      request.mode === 'place'
    )
      throw new Error(
        'Placement requires a 1080×1920, 30 FPS sequence. Bin import is available for other sequences.',
      );
    if (request.mode === 'place') {
      const track = sequence!.video.find((track) => track.id === request.track);
      if (!track || request.frame === undefined)
        throw new Error('Choose a video track and start frame.');
      requireSpace(
        track,
        (request.frame / 30) * ticksPerSecond,
        ((request.frame + revision.clip.durationFrames) / 30) * ticksPerSecond,
      );
    }
    if (request.mode === 'occurrence') {
      const track = sequence!.video.find((track) =>
        track.items.some((clip) => clip.clip === request.targetClip),
      );
      const clip = track?.items.find(
        (clip) => clip.clip === request.targetClip,
      );
      if (!clip || track!.locked)
        throw new Error('Choose an existing clip on an unlocked video track.');
      requireCoverage(clip.sourceOut, revision.clip.durationFrames);
    }
    if (request.mode === 'all') {
      if (
        !flatten(before.project.root).some(
          (item) => item.item === request.targetItem && item.type === 'Movie',
        )
      )
        throw new Error('Choose a movie media item.');
      for (const item of flatten(before.project.root).filter(
        (item) => item.type === 'Sequence',
      )) {
        const inspected = await this.client.execute<Sequence>(
          'sequence.inspect',
          { item: item.item },
        );
        for (const track of [...inspected.video, ...inspected.audio])
          for (const clip of track.items)
            if (clip.item === request.targetItem) {
              if (track.locked)
                throw new Error(
                  `A use in “${inspected.name}” is on a locked track.`,
                );
              requireCoverage(clip.sourceOut, revision.clip.durationFrames);
            }
      }
      const current = await this.connection();
      if (!current.connected || current.stamp !== before.stamp)
        throw new Error(
          'FilmCraft changed during preflight. Refresh the destination.',
        );
      return this.client.execute('media.replaceFootage', {
        item: request.targetItem,
        path,
      });
    }
    let bin = flatten(before.project.root).find(
      (node) => node.id !== undefined && node.name === 'Mercurius',
    );
    if (!bin) {
      const created = await this.client.execute<{ bin: number }>(
        'file.newBin',
        { name: 'Mercurius' },
      );
      bin = { id: created.bin, name: 'Mercurius' };
    }
    const imported = await this.client.execute<{
      items: number[];
      errors: unknown[];
    }>('file.import', { paths: [path], bin: bin.id });
    if (imported.errors.length || imported.items.length !== 1)
      throw new Error(
        'FilmCraft did not import the revision. Inspect the bin before retrying.',
      );
    const item = imported.items[0];
    await this.client.execute('clip.rename', {
      item,
      name: `${revision.clip.name} · ${revision.id}`,
    });
    if (request.mode === 'import') return { item, imported: true };
    const current = await this.connection();
    if (
      !current.connected ||
      current.project.path !== before.project.path ||
      current.project.name !== before.project.name ||
      hash(current.sequence) !== hash(sequence)
    )
      throw new Error(
        `The revision was imported as item ${item}, but the timeline changed. Placement/replacement was not applied; refresh before retrying.`,
      );
    if (request.mode === 'place')
      return {
        item,
        ...(await this.client.execute('timeline.place', {
          item,
          track: request.track,
          frame: request.frame,
          audio: false,
          insert: false,
        })),
      };
    return {
      item,
      ...(await this.client.execute('clip.replaceFromBin', {
        clips: [request.targetClip],
        item,
        keepSourceIn: true,
      })),
    };
  }
}
