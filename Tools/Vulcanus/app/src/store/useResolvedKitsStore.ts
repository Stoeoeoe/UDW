import { create } from 'zustand';
import type { BuildingKit } from '../types/building';
import type { ResolvedKit } from '../lib/buildings/resolveKit';
import { loadKit } from '../lib/buildings/kitSheets';

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

export const sheetsOf = (kit: BuildingKit) => [kit.source, ...Object.values(kit.variations ?? {})];

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
