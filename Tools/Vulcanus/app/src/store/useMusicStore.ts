import { create } from 'zustand';
import {
  musicApi,
  type MusicConfig,
  type MusicCue,
  type MusicCueSummary,
  type TrackTarget,
} from '../lib/musicApi';
import { useSaveStore } from '../lib/saveManager';
import { registerWorkspaceTabSaveOverride } from '../lib/workspaceSaveActions';
import { useEditorStore } from './useEditorStore';

interface CueDraft extends MusicCue {
  /** The config as last read from or written to Apollo's config.json. */
  saved: MusicConfig;
}

interface MusicState {
  /** Cues found in the project's music folder, with their display names. */
  cues: MusicCueSummary[];
  /** False until the cue list has been read for the current project. */
  loaded: boolean;
  /** Open cues with their unsaved edits (config is the draft). */
  drafts: Record<string, CueDraft>;
  refresh: (projectPath: string) => Promise<void>;
  load: (projectPath: string, cueId: string) => Promise<void>;
  /** Re-reads only the MIDI info, keeping unsaved config edits. */
  reloadMidi: (projectPath: string, cueId: string) => Promise<void>;
  edit: (cueId: string, config: MusicConfig) => void;
  /** Moves a MIDI track to another stem, a new stem or the ignored tracks (an edit, saved by the global Save). */
  assignTrack: (
    projectPath: string,
    cueId: string,
    track: number,
    target: TrackTarget,
  ) => Promise<void>;
  /** Sets the display name; like any edit it is written by the global Save. */
  rename: (projectPath: string, cueId: string, name: string) => Promise<void>;
  /** Deletes the cue's source, Unity export and unused stems. */
  remove: (projectPath: string, cueId: string) => Promise<void>;
  save: (cueId: string) => Promise<void>;
  discard: (cueId: string) => void;
  clear: () => void;
}

const saveUnit = (cueId: string) => `music:${cueId}`;

/** Updates one cue's name in the explorer list without re-reading the disk. */
const withName = (cues: MusicCueSummary[], cueId: string, name: string | undefined) =>
  cues.map((cue) => (cue.id === cueId ? { ...cue, name: name ?? cueId } : cue));

export const useMusicStore = create<MusicState>((set, get) => ({
  cues: [],
  loaded: false,
  drafts: {},
  refresh: async (projectPath) => set({ cues: await musicApi.list(projectPath), loaded: true }),
  load: async (projectPath, cueId) => {
    const cue = await musicApi.read(projectPath, cueId);
    set((state) => ({
      drafts: { ...state.drafts, [cueId]: { ...cue, saved: cue.config } },
    }));
  },
  reloadMidi: async (projectPath, cueId) => {
    const { midi } = await musicApi.read(projectPath, cueId);
    set((state) => ({
      drafts: { ...state.drafts, [cueId]: { ...state.drafts[cueId], midi } },
    }));
  },
  edit: (cueId, config) => {
    const draft = get().drafts[cueId];
    set((state) => ({
      drafts: { ...state.drafts, [cueId]: { ...draft, config } },
      cues: withName(state.cues, cueId, config.name),
    }));
    const dirty = JSON.stringify(config) !== JSON.stringify(draft.saved);
    if (dirty) useSaveStore.getState().markDirty(saveUnit(cueId));
    else useSaveStore.getState().clearUnit(saveUnit(cueId));
  },
  rename: async (projectPath, cueId, name) => {
    if (!get().drafts[cueId]) await get().load(projectPath, cueId);
    get().edit(cueId, { ...get().drafts[cueId].config, name });
  },
  assignTrack: async (projectPath, cueId, track, target) => {
    const config = await musicApi.assignTrack(
      projectPath,
      cueId,
      get().drafts[cueId].config,
      track,
      target,
    );
    get().edit(cueId, config);
  },
  remove: async (projectPath, cueId) => {
    await musicApi.delete(projectPath, cueId);
    useSaveStore.getState().clearUnit(saveUnit(cueId));
    set((state) => ({
      cues: state.cues.filter((cue) => cue.id !== cueId),
      drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => id !== cueId)),
    }));
  },
  save: async (cueId) => {
    const projectPath = useEditorStore.getState().projectPath;
    const draft = get().drafts[cueId];
    if (!projectPath || !draft) return;
    const saves = useSaveStore.getState();
    saves.markSaving(saveUnit(cueId));
    try {
      await musicApi.saveConfig(projectPath, cueId, draft.config);
      set((state) => ({
        drafts: { ...state.drafts, [cueId]: { ...draft, saved: draft.config } },
      }));
      saves.markSaved(saveUnit(cueId));
    } catch (error) {
      saves.markError(saveUnit(cueId), (error as Error).message);
      throw error;
    }
  },
  discard: (cueId) => {
    const draft = get().drafts[cueId];
    if (!draft) return;
    set((state) => ({
      drafts: { ...state.drafts, [cueId]: { ...draft, config: draft.saved } },
      cues: withName(state.cues, cueId, draft.saved.name),
    }));
    useSaveStore.getState().clearUnit(saveUnit(cueId));
  },
  clear: () => set({ cues: [], loaded: false, drafts: {} }),
}));

// Music joins the global Save / Save All like every other document.
registerWorkspaceTabSaveOverride('music', {
  saveTab: async (tab) => {
    if (tab.document.kind === 'music') await useMusicStore.getState().save(tab.document.cueId);
  },
  saveAll: async () => {
    const { drafts, save } = useMusicStore.getState();
    for (const cueId of Object.keys(drafts)) {
      if (useSaveStore.getState().saveUnits[saveUnit(cueId)]?.dirty) await save(cueId);
    }
  },
  discardTab: async (tab) => {
    if (tab.document.kind === 'music') useMusicStore.getState().discard(tab.document.cueId);
  },
});
