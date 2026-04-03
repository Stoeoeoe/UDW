/**
 * Application-wide constants
 */

/**
 * Default tile size in pixels.
 * Used for map rendering calculations when tileset-specific size is not available.
 */
export const DEFAULT_TILE_SIZE = 16;

/**
 * Minimum and maximum zoom levels for canvas viewports
 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

/**
 * Default zoom level for new viewports
 */
export const ZOOM_DEFAULT = 1.5;

/**
 * Panel size defaults (in pixels)
 */
export const PANEL_SIZES = {
  leftWidth: 240,
  rightWidth: 280,
  bottomHeight: 220,
} as const;

/**
 * Animation durations (in milliseconds)
 */
export const ANIMATION = {
  fast: 100,
  normal: 200,
  slow: 300,
} as const;
