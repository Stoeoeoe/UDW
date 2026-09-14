import { useEditorStore } from '../store/useEditorStore';
import { DEFAULT_TILE_SIZE } from '../config/constants';
import type { Project } from '../types/schema';

/** Returns the current project, falling back to safe defaults for key values. */
export function useProject(): { project: Project | null; tileSize: number } {
  const project = useEditorStore((state) => state.project);
  const tileSize = project?.tileSize ?? DEFAULT_TILE_SIZE;
  return { project, tileSize };
}
