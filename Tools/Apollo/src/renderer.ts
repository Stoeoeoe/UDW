import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type * as JSSynth from 'js-synthesizer';
import { pcmWav } from './wav.js';

export interface RenderRequest {
  midiPath: string;
  soundFont: string;
  outputPath: string;
  sampleRate: number;
  gain: number;
}
export interface Renderer {
  describe(): Promise<{ name: string; version: string }>;
  render(request: RenderRequest): Promise<void>;
}

// Loaded at run time (not bundled) so Electron resolves them from node_modules.
const require = createRequire(import.meta.url);
const FLUIDSYNTH_VERSION = '2.4.6';
const BLOCK_FRAMES = 4096;
const toArrayBuffer = (bytes: Buffer) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

// libfluidsynth's player status values: 0 ready, 1 playing, 2 stopping, 3 done.
interface FluidSynthModule { _fluid_player_get_status(player: number): number }

let ready: Promise<{ js: typeof JSSynth; module: FluidSynthModule }> | undefined;
function loadSynthesizer() {
  ready ??= (async () => {
    const js = require('js-synthesizer') as typeof JSSynth;
    const module = require('js-synthesizer/libfluidsynth') as FluidSynthModule;
    js.Synthesizer.initializeWithFluidSynthModule(module);
    await js.waitForReady();
    return { js, module };
  })();
  return ready;
}

const pcm16 = (sample: number) => Math.max(-32768, Math.min(32767, Math.round(sample * 32768)));

/** Renders one MIDI file with FluidSynth (WebAssembly) on the calling thread and writes a 16-bit stereo WAV. */
export async function renderOffline(request: RenderRequest) {
  const { js, module } = await loadSynthesizer();
  const synth = new js.Synthesizer();
  try {
    synth.init(request.sampleRate, { chorusActive: false, reverbActive: false, midiBankSelect: 'mma', initialGain: request.gain });
    await synth.loadSFont(toArrayBuffer(await readFile(request.soundFont)));
    await synth.addSMFDataToPlayer(toArrayBuffer(await readFile(request.midiPath)));
    await synth.playPlayer();
    const blocks: Buffer[] = [];
    // Render until the score has finished and every release tail has decayed to digital silence.
    for (let silent = 0; silent < 2;) {
      const left = new Float32Array(BLOCK_FRAMES), right = new Float32Array(BLOCK_FRAMES);
      synth.render([left, right]);
      const block = Buffer.alloc(BLOCK_FRAMES * 4);
      let audible = false;
      for (let i = 0; i < BLOCK_FRAMES; i++) {
        const l = pcm16(left[i]), r = pcm16(right[i]);
        audible ||= l !== 0 || r !== 0;
        block.writeInt16LE(l, i * 4); block.writeInt16LE(r, i * 4 + 2);
      }
      blocks.push(block);
      const scoreRunning = [1, 2].includes(module._fluid_player_get_status(synth.getRawPlayer()!));
      silent = scoreRunning || audible ? 0 : silent + 1;
    }
    await writeFile(request.outputPath, pcmWav(Buffer.concat(blocks), request.sampleRate));
  } finally {
    synth.close();
  }
}

type Reply = { error?: string };

/**
 * Renders on a small pool of worker threads, so stems render in parallel and the calling
 * thread (Electron's main process) is never blocked. Workers are started on demand and kept warm.
 * `workerFile` runs `renderWorker`; a bundler has to emit it as its own file.
 */
export class FluidSynthRenderer implements Renderer {
  private workerFile: string;
  private threads: number;
  private pool: Worker[] = [];
  private free: Worker[] = [];
  private waiting: ((worker: Worker) => void)[] = [];

  constructor(options: { workerFile?: string; threads?: number } = {}) {
    this.workerFile = options.workerFile ?? fileURLToPath(new URL('./renderWorker.js', import.meta.url));
    this.threads = options.threads ?? Math.max(1, Math.min(4, availableParallelism() - 1));
  }

  async describe() {
    return { name: 'FluidSynth (WebAssembly)', version: FLUIDSYNTH_VERSION };
  }

  async render(request: RenderRequest) {
    const worker = await this.acquire();
    let healthy = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = () => { worker.off('message', onMessage); worker.off('error', onError); };
        const onMessage = (reply: Reply) => { finish(); reply.error ? reject(new Error(reply.error)) : resolve(); };
        const onError = (error: Error) => { finish(); healthy = false; reject(error); };
        worker.on('message', onMessage);
        worker.on('error', onError);
        worker.postMessage(request);
      });
    } finally {
      if (healthy) this.release(worker);
      else {
        // A crashed worker leaves the pool; a waiting render starts a replacement.
        void worker.terminate();
        this.pool = this.pool.filter(other => other !== worker);
        const next = this.waiting.shift();
        if (next) void this.acquire().then(next);
      }
    }
  }

  private acquire(): Promise<Worker> {
    const idle = this.free.pop();
    if (idle) return Promise.resolve(idle);
    if (this.pool.length < this.threads) {
      const worker = new Worker(this.workerFile);
      worker.unref(); // idle workers must not keep the process alive
      this.pool.push(worker);
      return Promise.resolve(worker);
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  private release(worker: Worker) {
    const next = this.waiting.shift();
    if (next) next(worker); else this.free.push(worker);
  }
}
