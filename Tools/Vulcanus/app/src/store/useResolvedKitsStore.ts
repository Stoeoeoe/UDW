import { create } from 'zustand';
import type { BuildingKit } from '../types/building';
import type { ResolvedKit } from '../lib/buildings/resolveKit';
import { loadKit } from '../lib/buildings/kitSheets';
import { useEditorStore } from './useEditorStore';

export type ResolvedKitState =
  | { status: 'loading' }
  | { status: 'ready'; kit: ResolvedKit }
  | { status: 'error'; error: string };

/**
 * Kits cut into pieces, kept apart from the editor store: they are pixels derived from the kit's sheets, not
 * documents with history.
 */
interface ResolvedKitsStore {
  kits: Record<string, ResolvedKitState>;
  /** Sheets each kit was last read from, to tell which kits a changed file or edit concerns. */
  sources: Record<string, string[]>;
  resolve: (kit: BuildingKit) => Promise<void>;
  reset: () => void;
}

const sheetsOf = (kit: BuildingKit) => [kit.source, ...Object.values(kit.variations ?? {})];

/** The latest request per kit; an older one that finishes later is dropped. */
const latestRequest = new Map<string, number>();

export const useResolvedKitsStore = create<ResolvedKitsStore>((set) => ({
  kits: {},
  sources: {},
  resolve: async (kit) => {
    const request = (latestRequest.get(kit.id) ?? 0) + 1;
    latestRequest.set(kit.id, request);
    const sources = sheetsOf(kit);
    set((state) => ({
      kits: { ...state.kits, [kit.id]: { status: 'loading' } },
      sources: { ...state.sources, [kit.id]: sources },
    }));
    let next: ResolvedKitState;
    if (!kit.source) next = { status: 'error', error: 'Choose a base sheet.' };
    else {
      try {
        next = { status: 'ready', kit: await loadKit(kit) };
      } catch (error) {
        next = { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (latestRequest.get(kit.id) !== request) return;
    set((state) => ({ kits: { ...state.kits, [kit.id]: next } }));
  },
  reset: () => set({ kits: {}, sources: {} }),
}));

const sameSheets = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && a.every((path, i) => path === b[i]);

/**
 * Keeps resolved kits in step with the kits in the editor and with their sheet files on disk. Returns the cleanup, for
 * a React effect.
 */
export function watchBuildingKits(): () => void {
  const sync = (kits: BuildingKit[]) => {
    const resolved = useResolvedKitsStore.getState();
    for (const kit of kits)
      if (!sameSheets(resolved.sources[kit.id], sheetsOf(kit))) void resolved.resolve(kit);
    const ids = new Set(kits.map((kit) => kit.id));
    const stale = Object.keys(resolved.kits).filter((id) => !ids.has(id));
    if (stale.length)
      useResolvedKitsStore.setState((state) => ({
        kits: Object.fromEntries(Object.entries(state.kits).filter(([id]) => ids.has(id))),
        sources: Object.fromEntries(Object.entries(state.sources).filter(([id]) => ids.has(id))),
      }));
  };
  sync(useEditorStore.getState().buildingKits);
  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (state.projectPath !== previous.projectPath) useResolvedKitsStore.getState().reset();
    if (state.buildingKits !== previous.buildingKits) sync(state.buildingKits);
  });

  if (!('ipcRenderer' in window)) return unsubscribe;
  const onAssetChanged = (_event: unknown, payload: { relativePath: string }) => {
    for (const kit of useEditorStore.getState().buildingKits)
      if (sheetsOf(kit).includes(payload.relativePath))
        void useResolvedKitsStore.getState().resolve(kit);
  };
  window.ipcRenderer.on('app:asset-changed', onAssetChanged);
  return () => {
    unsubscribe();
    window.ipcRenderer.off('app:asset-changed', onAssetChanged);
  };
}
