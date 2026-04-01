import { buildPatternFromSelection } from './tileUtils';

export function getPattern(params: {
  activeTool: string | null;
  sampledPattern: any;
  selectedTileIndices: number[] | null;
  activeTilesetId: string | null;
  tilesets: Map<string, any>;
}): {
  pattern: (number | null)[][];
  patternW: number;
  patternH: number;
  minCol: number;
  minRow: number;
} | null {
  const {
    activeTool,
    sampledPattern,
    selectedTileIndices,
    activeTilesetId,
    tilesets,
  } = params;

  if (activeTool === 'random') return null;

  if (sampledPattern && sampledPattern.tilesetId === activeTilesetId) {
    return {
      pattern: sampledPattern.pattern,
      patternW: sampledPattern.width,
      patternH: sampledPattern.height,
      minCol: 0,
      minRow: 0,
    };
  }

  if (
    !selectedTileIndices ||
    selectedTileIndices.length <= 1 ||
    !activeTilesetId
  )
    return null;

  const ts = tilesets.get(activeTilesetId);
  if (!ts) return null;

  return buildPatternFromSelection(selectedTileIndices, ts);
}
