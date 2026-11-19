import type { RenderConfig } from '../../../../Apollo/src/config';
import type {
  assignCueTrack,
  inspectMidiFile,
  listCues,
  previewCue,
  readCue,
} from '../../../../Apollo/src/project';
import type { SoundFontPreset } from '../../../../Apollo/src/soundfont';

export type MusicConfig = RenderConfig;
export type MidiInfo = Awaited<ReturnType<typeof readCue>>['midi'];
export type MidiFileInfo = Awaited<ReturnType<typeof inspectMidiFile>>;
export type TrackTarget = Parameters<typeof assignCueTrack>[4];
export type MusicCueSummary = Awaited<ReturnType<typeof listCues>>[number];
export type MusicCue = { config: MusicConfig; instruments: SoundFontPreset[]; midi: MidiInfo };
export type PreviewResult = Awaited<ReturnType<typeof previewCue>>;
export type RenderSummary = { stems: number; bars: number; sampleRate: number };

// Apollo runs in the Electron main process; these are thin IPC calls.
const call = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
  try {
    return (await window.ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    // Electron prefixes errors raised in the main process; show only the message.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
};

export const musicApi = {
  list: (projectPath: string) => call<MusicCueSummary[]>('music:list', projectPath),
  delete: (projectPath: string, cueId: string) => call<void>('music:delete', projectPath, cueId),
  read: (projectPath: string, cueId: string) => call<MusicCue>('music:read', projectPath, cueId),
  saveConfig: (projectPath: string, cueId: string, config: MusicConfig) =>
    call<void>('music:save-config', projectPath, cueId, config),
  preview: (projectPath: string, cueId: string, config: MusicConfig) =>
    call<PreviewResult>('music:preview', projectPath, cueId, config),
  render: (projectPath: string, cueId: string) =>
    call<RenderSummary>('music:render', projectPath, cueId),
  import: (
    projectPath: string,
    request: { cueId: string; midiPath: string; soundFontPath: string; tracks: number[] },
  ) => call<void>('music:import', projectPath, request),
  inspectMidi: (midiPath: string) => call<MidiFileInfo>('music:inspect-midi', midiPath),
  assignTrack: (
    projectPath: string,
    cueId: string,
    config: MusicConfig,
    track: number,
    target: TrackTarget,
  ) => call<MusicConfig>('music:assign-track', projectPath, cueId, config, track, target),
  replaceMidi: (projectPath: string, cueId: string, midiPath: string) =>
    call<void>('music:replace-midi', projectPath, cueId, midiPath),
  revealMidi: (projectPath: string, cueId: string) =>
    call<void>('music:reveal-midi', projectPath, cueId),
  pickMidi: () => call<string | null>('music:pick-midi'),
  pickSoundFont: () => call<string | null>('music:pick-soundfont'),
};
