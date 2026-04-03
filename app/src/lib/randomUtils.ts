/**
 * Random sampling utilities for tile selection
 */

import { Tileset } from '../types/schema';

/**
 * Sample a tile index from a list using probability weights.
 * @param indices Array of tile indices to choose from
 * @param getWeight Function to get the weight for each index
 * @param random Optional random function (defaults to Math.random)
 * @returns Selected tile index, or null if no valid indices
 */
export function sampleWeightedTile(
  indices: number[],
  getWeight: (idx: number) => number,
  random: () => number = Math.random,
): number | null {
  if (!indices || indices.length === 0) return null;
  if (indices.length === 1) return indices[0];

  const weights = indices.map(getWeight);
  const total = weights.reduce((a, b) => a + b, 0);

  if (total <= 0) return indices[0];

  let r = random() * total;
  for (let i = 0; i < indices.length; i++) {
    r -= weights[i];
    if (r <= 0) return indices[i];
  }
  return indices[indices.length - 1];
}

/**
 * Get probability weight for a tile from a tileset.
 * Returns the tile's probability if defined and > 0, otherwise 1.
 */
export function getTileWeight(tileset: Tileset | undefined, index: number): number {
  const def = tileset?.tiles?.[index];
  return def && typeof def.probability === 'number' && def.probability > 0 ? def.probability : 1;
}

/**
 * Sample a random tile from selected indices using tileset probability weights.
 */
export function sampleRandomTile(
  indices: number[],
  tileset: Tileset | undefined,
  random: () => number = Math.random,
): number | null {
  return sampleWeightedTile(indices, (idx) => getTileWeight(tileset, idx), random);
}

/**
 * Create a seeded random function for stable previews.
 * The same (x, y, seed) will always produce the same result.
 */
export function seededRandom(x: number, y: number, seed: number = 0): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Sample a tile for a specific position with stable seeded randomness.
 * Useful for preview rendering where the same position should show the same tile.
 */
export function sampleSeededTile(
  x: number,
  y: number,
  indices: number[],
  tileset: Tileset | undefined,
  seed: number = 0,
): number | null {
  return sampleRandomTile(indices, tileset, () => seededRandom(x, y, seed));
}
