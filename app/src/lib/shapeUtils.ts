import { circularBrush, bresenhamLine } from './algorithms';
import { sampleRandomTile } from './randomUtils';
import type { Map as GameMap, Tileset } from '../types/schema';
import type { TilePattern } from './tileUtils';

interface TilePaintOp {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

interface TileEraseOp {
  x: number;
  y: number;
}

export async function applyShape(params: {
  currentMap: GameMap | null;
  selectedLayerId: string | null;
  activeTilesetId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[] | null;
  activeTool: string | null;
  tilesets: Map<string, Tileset>;
  paintTilesBatch: (layerId: string, tiles: TilePaintOp[]) => void;
  eraseTilesBatch: (layerId: string, tiles: TileEraseOp[]) => void;
  getPattern: () => TilePattern | null;
  brushSize: number;
  mode: 'point' | 'rect' | 'circle' | 'line';
  start: { x: number; y: number };
  end: { x: number; y: number };
  action: 'paint' | 'erase';
}) {
  const {
    currentMap,
    selectedLayerId,
    activeTilesetId,
    selectedTileIndex,
    selectedTileIndices,
    activeTool,
    tilesets,
    paintTilesBatch,
    eraseTilesBatch,
    getPattern,
    brushSize,
    mode,
    start,
    end,
    action,
  } = params;

  if (!currentMap || !selectedLayerId) return;
  const patternData = getPattern();
  // Only block paint when there's no pattern AND no active tileset/selection
  if (
    action === 'paint' &&
    !patternData &&
    (!activeTilesetId ||
      (selectedTileIndex === null && (!selectedTileIndices || selectedTileIndices.length === 0)))
  )
    return;
  const pattern = patternData?.pattern;
  const patternW = patternData?.patternW || 1;
  const patternH = patternData?.patternH || 1;

  const ts = activeTilesetId ? tilesets.get(activeTilesetId) : undefined;

  const tilesToPaint: TilePaintOp[] = [];
  const tilesToErase: TileEraseOp[] = [];

  const collectTile = (tx: number, ty: number) => {
    if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return;
    if (action === 'paint') {
      if (pattern && patternW > 0 && patternH > 0) {
        for (let py = 0; py < patternH; py++) {
          for (let px = 0; px < patternW; px++) {
            const tileIdx = pattern[py][px];
            if (tileIdx !== null) {
              const nx = tx + px,
                ny = ty + py;
              if (nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height) {
                tilesToPaint.push({
                  x: nx,
                  y: ny,
                  tilesetId: activeTilesetId,
                  tileIndex: tileIdx,
                });
              }
            } else {
              // Null in sampled pattern = explicit erase when stamping
              const nx = tx + px,
                ny = ty + py;
              if (nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height) {
                tilesToErase.push({ x: nx, y: ny });
              }
            }
          }
        }
      } else if (activeTool === 'random' && activeTilesetId) {
        if (selectedTileIndices && selectedTileIndices.length > 0) {
          const chosen = sampleRandomTile(selectedTileIndices, ts);
          if (chosen !== null)
            tilesToPaint.push({
              x: tx,
              y: ty,
              tilesetId: activeTilesetId,
              tileIndex: chosen,
            });
        } else if (selectedTileIndex !== null) {
          tilesToPaint.push({
            x: tx,
            y: ty,
            tilesetId: activeTilesetId,
            tileIndex: selectedTileIndex,
          });
        }
      } else if (activeTilesetId && selectedTileIndex !== null) {
        tilesToPaint.push({
          x: tx,
          y: ty,
          tilesetId: activeTilesetId,
          tileIndex: selectedTileIndex,
        });
      }
    } else {
      if (pattern && patternW > 0 && patternH > 0) {
        for (let py = 0; py < patternH; py++) {
          for (let px = 0; px < patternW; px++) {
            const nx = tx + px,
              ny = ty + py;
            if (nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height) {
              tilesToErase.push({ x: nx, y: ny });
            }
          }
        }
      } else {
        tilesToErase.push({ x: tx, y: ty });
      }
    }
  };

  const collectBrush = (cx: number, cy: number, radius: number) => {
    if (pattern && patternW > 0 && patternH > 0) {
      collectTile(cx, cy);
      return;
    }

    for (const { x, y } of circularBrush(cx, cy, radius)) {
      collectTile(x, y);
    }
  };

  const effectiveBrushSize = mode === 'point' || mode === 'line' ? brushSize : 1;

  if (mode === 'point') {
    collectBrush(end.x, end.y, effectiveBrushSize);
  } else if (mode === 'rect') {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pattern && patternW > 0 && patternH > 0) {
          const dx = x - start.x;
          const dy = y - start.y;
          const px = ((dx % patternW) + patternW) % patternW;
          const py = ((dy % patternH) + patternH) % patternH;
          const tileIdx = pattern[py][px];
          if (action === 'paint') {
            if (tileIdx !== null && activeTilesetId) {
              tilesToPaint.push({
                x,
                y,
                tilesetId: activeTilesetId,
                tileIndex: tileIdx,
              });
            } else if (tileIdx === null) {
              tilesToErase.push({ x, y });
            }
          } else if (action === 'erase') {
            tilesToErase.push({ x, y });
          }
        } else {
          collectTile(x, y);
        }
      }
    }
  } else if (mode === 'circle') {
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    const minX = Math.floor(start.x - radius);
    const maxX = Math.ceil(start.x + radius);
    const minY = Math.floor(start.y - radius);
    const maxY = Math.ceil(start.y + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
        if (dist <= radius) {
          if (pattern && patternW > 0 && patternH > 0) {
            const dx = x - start.x;
            const dy = y - start.y;
            const px = ((dx % patternW) + patternW) % patternW;
            const py = ((dy % patternH) + patternH) % patternH;
            const tileIdx = pattern[py][px];
            if (action === 'paint') {
              if (tileIdx !== null && activeTilesetId) {
                tilesToPaint.push({
                  x,
                  y,
                  tilesetId: activeTilesetId,
                  tileIndex: tileIdx,
                });
              } else if (tileIdx === null) {
                tilesToErase.push({ x, y });
              }
            } else if (action === 'erase') {
              tilesToErase.push({ x, y });
            }
          } else {
            collectTile(x, y);
          }
        }
      }
    }
  } else if (mode === 'line') {
    for (const { x, y } of bresenhamLine(start.x, start.y, end.x, end.y)) {
      collectBrush(x, y, effectiveBrushSize);
    }
  }

  if (tilesToPaint.length > 0) {
    paintTilesBatch(selectedLayerId!, tilesToPaint);
  }
  if (tilesToErase.length > 0) {
    eraseTilesBatch(selectedLayerId!, tilesToErase);
  }
}
