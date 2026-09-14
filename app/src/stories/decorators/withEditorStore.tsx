/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react';
import type { Decorator } from '@storybook/react';
import { useEditorStore } from '../../store/useEditorStore';
import { EditorState } from '../../types/editor';

const StoreSeeder: React.FC<{ initialState: Partial<EditorState>; children: React.ReactNode }> = ({
  initialState,
  children,
}) => {
  useEffect(() => {
    if (initialState) {
      useEditorStore.setState(initialState);
    }
  }, [initialState]);

  return <>{children}</>;
};

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

  return (
    <StoreSeeder initialState={initialState}>
      <Story />
    </StoreSeeder>
  );
};
