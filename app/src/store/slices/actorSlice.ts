import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Actor } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ActorSlice {
  actors: Actor[];
  selectedActorId: string | null;

  setSelectedActor: (id: string | null) => void;
  addActor: (actor: Actor) => Promise<void>;
  updateActor: (id: string, updates: Partial<Actor>) => Promise<void>;
  deleteActor: (id: string) => Promise<void>;
}

export const createActorSlice: ImmerStateCreator<ActorSlice> = (set, get) => ({
  actors: [],
  selectedActorId: null,

  setSelectedActor: (id) =>
    set((state) => {
      state.selectedActorId = id;
    }),

  addActor: async (actor) => {
    set((state) => {
      state.actors.push(castDraft(actor));
    });
    await fileSystem.saveJson('actors', `${actor.id}.actor.json`, {
      $schema: '../../schemas/actor.schema.json',
      ...actor,
    });
  },

  updateActor: async (id, updates) => {
    let updatedActor: Actor | null = null;
    set((state) => {
      const actorIndex = state.actors.findIndex((entry) => entry.id === id);
      if (actorIndex < 0) return;
      const merged = { ...state.actors[actorIndex], ...updates } as Actor;
      updatedActor = merged;
      state.actors[actorIndex] = castDraft(merged);
    });
    const actor = updatedActor ?? get().actors.find((entry) => entry.id === id);
    if (actor) {
      await fileSystem.saveJson('actors', `${actor.id}.actor.json`, {
        $schema: '../../schemas/actor.schema.json',
        ...actor,
      });
    }
  },

  deleteActor: async (id) => {
    set((state) => {
      state.actors = state.actors.filter((a) => a.id !== id);
      if (state.selectedActorId === id) state.selectedActorId = null;
    });
    await fileSystem.deleteJson('actors', `${id}.actor.json`);
  },
});
