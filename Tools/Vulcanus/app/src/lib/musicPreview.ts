import type { PreviewResult } from './musicApi';

type Gains = Record<string, Record<string, number>>;

/** Loops a cue's rendered stems together with Web Audio; the mix preset can change while playing. */
export class CuePreview {
  private context: AudioContext;
  private sources: AudioBufferSourceNode[] = [];
  private nodes = new Map<string, GainNode>();
  private startedAt = 0;
  private presetId = '';

  private constructor(
    private buffers: Map<string, AudioBuffer>,
    private gains: Gains,
    context: AudioContext,
  ) {
    this.context = context;
  }

  static async create(result: PreviewResult): Promise<CuePreview> {
    const context = new AudioContext({ sampleRate: result.sampleRate });
    const buffers = new Map<string, AudioBuffer>();
    for (const stem of result.stems) {
      const bytes = stem.wav.buffer.slice(
        stem.wav.byteOffset,
        stem.wav.byteOffset + stem.wav.byteLength,
      );
      buffers.set(stem.id, await context.decodeAudioData(bytes as ArrayBuffer));
    }
    const gains: Gains = {};
    for (const preset of result.presets ?? []) {
      gains[preset.id] = Object.fromEntries(preset.gains.map((g) => [g.stem, g.gain]));
    }
    return new CuePreview(buffers, gains, context);
  }

  /** Length of one loop in seconds. */
  get duration() {
    return [...this.buffers.values()][0].duration;
  }

  /** Seconds into the current loop. */
  get position() {
    return (this.context.currentTime - this.startedAt) % this.duration;
  }

  play(presetId: string, offset = 0) {
    this.stop();
    const when = this.context.currentTime + 0.05;
    this.startedAt = when - offset;
    for (const [id, buffer] of this.buffers) {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const node = this.context.createGain();
      source.connect(node).connect(this.context.destination);
      source.start(when, offset);
      this.sources.push(source);
      this.nodes.set(id, node);
    }
    this.setPreset(presetId);
  }

  /** Jumps to a time in the loop while playing. */
  seek(seconds: number) {
    this.play(this.presetId, seconds);
  }

  setPreset(presetId: string) {
    this.presetId = presetId;
    for (const [id, node] of this.nodes) node.gain.value = this.gains[presetId][id];
  }

  stop() {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.nodes.clear();
  }

  async dispose() {
    this.stop();
    await this.context.close();
  }
}
