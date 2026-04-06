import { buildPatternFromSelection } from './tileUtils';
import type { TilePattern } from './tileUtils';
import type { Tileset } from '../types/schema';

interface SampledPattern {
  tilesetId: string;
  pattern: (number | null)[][];
  width: number;
  height: number;
}

export function getPattern(params: {
  activeTool: string | null;
  sampledPattern: SampledPattern | null;
  selectedTileIndices: number[] | null;
  activeTilesetId: string | null;
  tilesets: Map<string, Tileset>;
}): TilePattern | null {
  const { activeTool, sampledPattern, selectedTileIndices, activeTilesetId, tilesets } = params;

  if (activeTool === 'random') return null;

  // Prefer a sampled pattern if present (including "empty" null patterns).
  // We return the raw sampled pattern irrespective of tileset match —
  // shapeUtils will only paint non-null entries when an active tileset is set.
  if (sampledPattern) {
    return {
      pattern: sampledPattern.pattern,
      patternW: sampledPattern.width,
      patternH: sampledPattern.height,
      minCol: 0,
      minRow: 0,
    };
  }

  if (!selectedTileIndices || selectedTileIndices.length <= 1 || !activeTilesetId) return null;

  const ts = tilesets.get(activeTilesetId);
  if (!ts) return null;

  return buildPatternFromSelection(selectedTileIndices, ts);
}
