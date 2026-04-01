import { Viewport } from 'pixi-viewport';
import { DEFAULT_TILE_SIZE } from '../config/constants';

// Converts screen (client) coordinates to tile coordinates using the provided viewport.
export function screenToTile(
  viewport: Viewport | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!viewport || !(viewport as any).worldTransform) return null;

  try {
    const canvas =
      (viewport as any).options?.events?.domElement ||
      document.querySelector('canvas');
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const worldPos = viewport.toWorld(x, y);
    const tx = Math.floor(worldPos.x / DEFAULT_TILE_SIZE);
    const ty = Math.floor(worldPos.y / DEFAULT_TILE_SIZE);

    return { x: tx, y: ty };
  } catch (e) {
    // Viewport not fully initialized
    return null;
  }
}
