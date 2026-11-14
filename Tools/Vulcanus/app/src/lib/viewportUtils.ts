import { Viewport } from 'pixi-viewport';
import { DEFAULT_TILE_SIZE } from '../config/constants';

interface ViewportEventsLike {
  domElement?: Element | null;
}

interface ViewportOptionsLike {
  events?: ViewportEventsLike;
}

function getViewportCanvas(viewport: Viewport): HTMLCanvasElement | null {
  const options = (viewport as Viewport & { options?: ViewportOptionsLike }).options;
  const domEl = options?.events?.domElement;
  if (domEl instanceof HTMLCanvasElement) return domEl;

  const fallback = document.querySelector('canvas');
  return fallback instanceof HTMLCanvasElement ? fallback : null;
}

// Converts screen (client) coordinates to world pixel coordinates using the provided viewport.
export function screenToWorld(
  viewport: Viewport | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!viewport || !viewport.worldTransform) return null;

  try {
    const canvas = getViewportCanvas(viewport);
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const worldPos = viewport.toWorld(x, y);
    return { x: worldPos.x, y: worldPos.y };
  } catch {
    return null;
  }
}

// Converts screen (client) coordinates to tile coordinates using the provided viewport.
export function screenToTile(
  viewport: Viewport | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!viewport || !viewport.worldTransform) return null;

  try {
    const canvas = getViewportCanvas(viewport);
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const worldPos = viewport.toWorld(x, y);
    const tx = Math.floor(worldPos.x / DEFAULT_TILE_SIZE);
    const ty = Math.floor(worldPos.y / DEFAULT_TILE_SIZE);

    return { x: tx, y: ty };
  } catch {
    // Viewport not fully initialized
    return null;
  }
}
