import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const execute = promisify(execFile);
export class FluidSynthRenderer implements Renderer {
  private executable: string;
  constructor(executable?: string) {
    const local = fileURLToPath(new URL(`../tools/fluidsynth/bin/${process.platform === 'win32' ? 'fluidsynth.exe' : 'fluidsynth'}`, import.meta.url));
    this.executable = executable ?? process.env.APOLLO_FLUIDSYNTH ?? (existsSync(local) ? local : 'fluidsynth');
  }
  private async run(args: string[]) {
    try {
      return await execute(this.executable, args, { timeout: 600000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    } catch (error) {
      const failure = error as Error & { stderr?: string; stdout?: string };
      throw new Error(`FluidSynth failed (${this.executable}): ${failure.message}\n${failure.stderr ?? ''}\n${failure.stdout ?? ''}`);
    }
  }
  async describe() {
    const result = await this.run(['--version']);
    return { name: 'FluidSynth', version: result.stdout.trim() };
  }
  async render(request: RenderRequest) {
    await this.run(['-ni', '-F', request.outputPath, '-T', 'wav', '-O', 's16', '-E', 'little',
      '-r', String(request.sampleRate), '-g', String(request.gain), '-R', '0', '-C', '0',
      '-o', 'player.timing-source=sample', '-o', 'synth.lock-memory=0',
      '-o', 'synth.cpu-cores=1', '-o', 'synth.midi-bank-select=mma',
      request.soundFont, request.midiPath]);
  }
}
