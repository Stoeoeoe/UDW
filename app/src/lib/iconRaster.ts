import { Texture } from 'pixi.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as GiIcons from 'react-icons/gi';

/**
 * Cache for icon textures keyed by "iconName:color".
 * Icons are rendered at a fixed high resolution so they look sharp at any display size.
 */
const textureCache = new Map<string, Texture>();

const RASTER_SIZE = 128;

/**
 * Returns a PixiJS Texture for the given react-icons/gi icon name.
 * The SVG is rasterized to a canvas at RASTER_SIZE px and cached.
 *
 * Returns null on first call (async), then calls `onReady` so the
 * caller can re-render. Subsequent calls with the same key return
 * the cached texture immediately.
 */
export function getIconTexture(
  iconName: string,
  color: string,
  onReady: () => void,
): Texture | null {
  const key = `${iconName}:${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const IconComp = (
    GiIcons as Record<string, React.ComponentType<{ size: number; color: string }>>
  )[iconName];
  if (!IconComp) return null;

  // Render the React icon component to an SVG string at the raster size
  const svgMarkup = renderToStaticMarkup(createElement(IconComp, { size: RASTER_SIZE, color }));

  // Load as an image, then draw onto a canvas to get a raster texture
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image(RASTER_SIZE, RASTER_SIZE);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = RASTER_SIZE;
    canvas.height = RASTER_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, RASTER_SIZE, RASTER_SIZE);
    URL.revokeObjectURL(url);

    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'linear';
    textureCache.set(key, texture);
    onReady();
  };
  img.src = url;

  return null;
}
