import { circularBrush, bresenhamLine } from './algorithms';
import {
  buildTerrainGridFromLayer,
  applyTerrainToTile,
  getCornerTerrainsForTile,
  findBestMatchingTileWithFallback,
} from './terrainUtils';

export async function applyTerrainShape(params: {
  currentMap: any;
  selectedLayerId: string | null;
  activeTilesetId: string | null;
  tilesets: Map<string, any>;
  paintTilesBatch: (layerId: string, tiles: any[]) => void;
  eraseTilesBatch: (layerId: string, tiles: any[]) => void;
  brushSize: number;
  mode: 'point' | 'rect' | 'circle' | 'line';
  start: { x: number; y: number };
  end: { x: number; y: number };
  terrainId: string | null;
  terrainGridRef: Map<string, string | null>;
  currentTilesetRefs?: any;
}) {
  const {
    currentMap,
    selectedLayerId,
    activeTilesetId,
    tilesets,
    paintTilesBatch,
    eraseTilesBatch,
    brushSize,
    mode,
    start,
    end,
    terrainId,
    terrainGridRef,
  } = params;

  if (!currentMap || !selectedLayerId || !activeTilesetId) return;

  const tileset = tilesets.get(activeTilesetId);
  if (!tileset) return;

  const layer = currentMap.layers.find((l: any) => l.id === selectedLayerId);
  if (!layer) return;

  const effectiveBrushSize = mode === 'point' || mode === 'line' ? brushSize : 1;

  const collectBrush = (cx: number, cy: number, positions: Array<{ x: number; y: number }>) => {
    for (const { x, y } of circularBrush(cx, cy, effectiveBrushSize)) {
      if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
        positions.push({ x, y });
      }
    }
  };

  const positions: Array<{ x: number; y: number }> = [];

  if (mode === 'point') {
    collectBrush(end.x, end.y, positions);
  } else if (mode === 'rect') {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
          positions.push({ x, y });
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
        if (dist <= radius && x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
          positions.push({ x, y });
        }
      }
    }
  } else if (mode === 'line') {
    for (const { x, y } of bresenhamLine(start.x, start.y, end.x, end.y)) {
      collectBrush(x, y, positions);
    }
  }

  if (positions.length === 0) return;

  terrainGridRef.clear?.();
  // Build terrain grid fresh for this operation
  const built = buildTerrainGridFromLayer(layer.data, tilesets, currentMap.tilesetRefs);
  if (built) {
    // mutate provided ref if available
    if (terrainGridRef && typeof (terrainGridRef as any).set === 'function') {
      // replace contents
      (terrainGridRef as Map<string, string | null>).clear();
      for (const [k, v] of built.entries())
        (terrainGridRef as Map<string, string | null>).set(k, v);
    }
  }

  const allTilesToUpdate = new Map<string, { tileX: number; tileY: number }>();

  for (const pos of positions) {
    const tilesToUpdate = applyTerrainToTile(
      pos.x,
      pos.y,
      terrainId,
      built,
      currentMap.width,
      currentMap.height,
    );
    for (const tile of tilesToUpdate) {
      allTilesToUpdate.set(`${tile.tileX},${tile.tileY}`, tile);
    }
  }

  const tilesToPaint: Array<any> = [];
  const tilesToErase: Array<any> = [];

  for (const { tileX, tileY } of allTilesToUpdate.values()) {
    if (tileX < 0 || tileX >= currentMap.width || tileY < 0 || tileY >= currentMap.height) continue;

    const corners = getCornerTerrainsForTile(tileX, tileY, built);
    const matchingTile = findBestMatchingTileWithFallback(tileset, corners, true);

    if (matchingTile !== null) {
      tilesToPaint.push({
        x: tileX,
        y: tileY,
        tilesetId: activeTilesetId,
        tileIndex: matchingTile,
      });
    } else if (corners.every((c: any) => c === null)) {
      tilesToErase.push({ x: tileX, y: tileY });
    }
  }

  if (tilesToPaint.length > 0) paintTilesBatch(selectedLayerId!, tilesToPaint);
  if (tilesToErase.length > 0) eraseTilesBatch(selectedLayerId!, tilesToErase);
}
