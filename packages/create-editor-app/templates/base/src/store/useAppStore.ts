import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * Example application store using Zustand + Immer.
 * Customize this for your own state management needs.
 */

interface AppState {
  // Add your state here
  count: number;

  // Actions
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    count: 0,

    increment: () => set((state) => { state.count += 1; }),
    decrement: () => set((state) => { state.count -= 1; }),
    reset: () => set((state) => { state.count = 0; }),
  }))
);
