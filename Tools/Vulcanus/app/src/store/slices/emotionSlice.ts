import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Emotion } from '../../types/schema';
import { qualifyResourceId } from '../../lib/resourceIds';
import { persistProject } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface EmotionSlice {
  emotions: Emotion[];

  /** Adds an emotion; a bare id such as "angry" becomes "<prefix>:angry". */
  addEmotion: (emotion: Emotion) => Promise<void>;
  updateEmotion: (id: string, updates: Partial<Omit<Emotion, 'id'>>) => Promise<void>;
  deleteEmotion: (id: string) => Promise<void>;
}

export const createEmotionSlice: ImmerStateCreator<EmotionSlice> = (set, get) => {
  const persist = async () => {
    const project = get().project;
    if (!project) return;
    const projectToSave = { ...project, emotions: get().emotions };
    await persistProject(projectToSave);
    set((state) => {
      state.project = castDraft(projectToSave);
    });
  };

  return {
    emotions: [],

    addEmotion: async (emotion) => {
      const id = qualifyResourceId(emotion.id, get().project?.idPrefix);
      if (get().emotions.some((entry) => entry.id === id)) {
        throw new Error(`Emotion "${id}" already exists.`);
      }
      set((state) => {
        state.emotions.push({ ...emotion, id });
      });
      await persist();
    },

    updateEmotion: async (id, updates) => {
      set((state) => {
        const emotion = state.emotions.find((entry) => entry.id === id);
        if (emotion) Object.assign(emotion, updates);
      });
      await persist();
    },

    deleteEmotion: async (id) => {
      set((state) => {
        state.emotions = state.emotions.filter((entry) => entry.id !== id);
      });
      await persist();
    },
  };
};
