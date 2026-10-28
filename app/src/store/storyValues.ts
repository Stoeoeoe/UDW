import type { StoryValueDefinition } from '../types/schema';
import { validateStoryValueDeclarations } from '../lib/storyValues';
import { useEditorStore } from './useEditorStore';
import { persistProject } from './storeHelpers';

/** Shared by Data and inline declarations in cutscene actions. */
export function saveStoryValueDeclarations(values: StoryValueDefinition[]): void {
  validateStoryValueDeclarations(values);
  const project = useEditorStore.getState().project;
  if (!project) throw new Error('Story declarations require an open project.');
  const updated = { ...project, storyValues: values };
  useEditorStore.setState((state) => {
    state.project = updated;
  });
  void persistProject(updated);
}
