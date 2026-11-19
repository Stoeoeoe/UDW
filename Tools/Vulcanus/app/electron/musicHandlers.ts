import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  FluidSynthRenderer,
  assignCueTrack,
  cuePaths,
  deleteCue,
  inspectMidiFile,
  importScore,
  listCues,
  previewCue,
  readCue,
  renderCue,
  replaceCueMidi,
  saveCueConfig,
  type TrackTarget,
} from '../../../Apollo/src/index';

// One renderer for the app's lifetime keeps its worker threads (and their loaded synth) warm.
const renderer = new FluidSynthRenderer({
  // A plain path: Vite would turn `new URL('./musicWorker.js', import.meta.url)` into an inlined asset.
  workerFile: path.join(path.dirname(fileURLToPath(import.meta.url)), 'musicWorker.js'),
});
// Rendered preview stems of the last previewed cue, so repeat previews re-render only what changed.
let previewCache: { cueId: string; stems: Map<string, Buffer> } | undefined;

/** Apollo works on the Unity project; the Vulcanus project lives somewhere below it. */
function unityRoot(vulcanusProjectPath: string): string {
  let dir = path.resolve(vulcanusProjectPath);
  while (!fs.existsSync(path.join(dir, 'Tools/Apollo/package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error(`No Unity project with Tools/Apollo above ${vulcanusProjectPath}.`);
    dir = parent;
  }
  return dir;
}

/** Cue sources live in the Vulcanus project's music folder; exports go to the Unity project. */
function apolloProject(vulcanusProjectPath: string) {
  return {
    unityRoot: unityRoot(vulcanusProjectPath),
    musicDir: path.join(path.resolve(vulcanusProjectPath), 'music'),
  };
}

export function setupMusicHandlers(win: BrowserWindow | null) {
  ipcMain.handle('music:list', (_event, projectPath: string) =>
    listCues(apolloProject(projectPath)),
  );
  ipcMain.handle('music:read', (_event, projectPath: string, cueId: string) =>
    readCue(apolloProject(projectPath), cueId),
  );
  ipcMain.handle(
    'music:save-config',
    (_event, projectPath: string, cueId: string, config: unknown) =>
      saveCueConfig(apolloProject(projectPath), cueId, config),
  );
  ipcMain.handle('music:preview', (_event, projectPath: string, cueId: string, config: unknown) => {
    if (previewCache?.cueId !== cueId) previewCache = { cueId, stems: new Map() };
    return previewCue(apolloProject(projectPath), cueId, config, {
      renderer,
      cache: previewCache.stems,
    });
  });
  ipcMain.handle('music:render', async (_event, projectPath: string, cueId: string) => {
    const root = apolloProject(projectPath);
    const { manifest } = await renderCue(root, cueId, renderer);
    return {
      stems: manifest.stems.length,
      bars: manifest.loopBars,
      sampleRate: manifest.sampleRate,
    };
  });
  ipcMain.handle(
    'music:import',
    async (
      _event,
      projectPath: string,
      request: { cueId: string; midiPath: string; soundFontPath: string; tracks: number[] },
    ) => {
      const root = apolloProject(projectPath);
      await importScore({
        project: root,
        cueId: request.cueId,
        midiPath: request.midiPath,
        soundFont: request.soundFontPath,
        tracks: request.tracks,
        renderer,
      });
    },
  );
  ipcMain.handle('music:inspect-midi', (_event, midiPath: string) => inspectMidiFile(midiPath));
  ipcMain.handle(
    'music:assign-track',
    (
      _event,
      projectPath: string,
      cueId: string,
      config: unknown,
      track: number,
      target: TrackTarget,
    ) => assignCueTrack(apolloProject(projectPath), cueId, config, track, target),
  );
  ipcMain.handle('music:delete', (_event, projectPath: string, cueId: string) => {
    if (previewCache?.cueId === cueId) previewCache = undefined;
    return deleteCue(apolloProject(projectPath), cueId);
  });
  ipcMain.handle(
    'music:replace-midi',
    (_event, projectPath: string, cueId: string, midiPath: string) =>
      replaceCueMidi(apolloProject(projectPath), cueId, midiPath),
  );
  ipcMain.handle('music:reveal-midi', (_event, projectPath: string, cueId: string) => {
    shell.showItemInFolder(
      path.join(cuePaths(apolloProject(projectPath), cueId).source, 'source.mid'),
    );
  });
  ipcMain.handle('music:pick-midi', async () =>
    pickFile(win, 'Select MIDI file', 'MIDI', ['mid', 'midi']),
  );
  ipcMain.handle('music:pick-soundfont', async () =>
    pickFile(win, 'Select SoundFont', 'SoundFont', ['sf2', 'sf3']),
  );
}

async function pickFile(
  win: BrowserWindow | null,
  title: string,
  name: string,
  extensions: string[],
) {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    title,
    filters: [{ name, extensions }],
    properties: ['openFile'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
