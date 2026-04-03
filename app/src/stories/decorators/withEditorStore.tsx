import { useEffect } from 'react';
import type { Decorator } from '@storybook/react';
import { useEditorStore } from '../../store/useEditorStore';
import { EditorState } from '../../types/editor';

/**
 * A Storybook Decorator to seed the Zustand store with specific state.
 * Usage in a Story:
 *
 * export const MyStory = {
 *   parameters: {
 *     store: {
 *       activeTool: 'stamp',
 *       currentMap: { ... }
 *     }
 *   }
 * }
 */
export const withStore: Decorator = (Story, context) => {
  const initialState = context.parameters.store as Partial<EditorState>;

  useEffect(() => {
    if (initialState) {
      // 1. Seed the store with the provided state
      useEditorStore.setState(initialState);
    }

    // 2. Cleanup: We could reset here, but typically the next story
    // will overwrite the state or the page reload will clear it.
    // For strict isolation, we would reset to a default state here.

    return () => {
      // Optional: Reset store on unmount if needed
      // useEditorStore.setState(defaultInitialState, true);
    };
  }, [initialState]);

  return <Story />;
};
