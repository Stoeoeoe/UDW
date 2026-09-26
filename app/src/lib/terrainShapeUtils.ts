import { circularBrush, bresenhamLine } from './algorithms';
import {
  buildTerrainGridFromLayer,
  applyTerrainToTile,
  getCornerTerrainsForTile,
  findBestMatchingTileWithFallback,
} from './terrainUtils';
import type { Map as GameMap, Tileset } from '../types/schema';

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

export async function applyTerrainShape(params: {
  currentMap: GameMap | null;
  selectedLayerId: string | null;
  activeTilesetId: string | null;
  tilesets: Map<string, Tileset>;
  paintTilesBatch: (layerId: string, tiles: TilePaintOp[]) => void;
  eraseTilesBatch: (layerId: string, tiles: TileEraseOp[]) => void;
  /** For terrain layers: persist the painted terrain ID per cell so it can be re-resolved later */
  paintTerrainDataBatch?: (
    layerId: string,
    cells: Array<{ x: number; y: number; terrainId: string | null }>,
  ) => void;
  brushSize: number;
  mode: 'point' | 'rect' | 'circle' | 'line';
  start: { x: number; y: number };
  end: { x: number; y: number };
  terrainId: string | null;
  terrainGridRef: Map<string, string | null>;
  terrainGridInitializedRef?: { current: boolean };
}) {
  const {
    currentMap,
    selectedLayerId,
    activeTilesetId,
    tilesets,
    paintTilesBatch,
    eraseTilesBatch,
    paintTerrainDataBatch,
    brushSize,
    mode,
    start,
    end,
    terrainId,
    terrainGridRef,
    terrainGridInitializedRef,
  } = params;

  if (!currentMap || !selectedLayerId || !activeTilesetId) return;

  const tileset = tilesets.get(activeTilesetId);
  if (!tileset) return;

  const layer = currentMap.layers.find((l) => l.id === selectedLayerId);
  if (!layer) return;

  const effectiveBrushSize = mode === 'point' || mode === 'line' ? brushSize : 1;

  const positions = new Map<number, { x: number; y: number }>();
  const addPosition = (x: number, y: number) => {
    if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
      positions.set(y * currentMap.width + x, { x, y });
    }
  };

  const collectBrush = (cx: number, cy: number) => {
    for (const { x, y } of circularBrush(cx, cy, effectiveBrushSize)) {
      addPosition(x, y);
    }
  };

  if (mode === 'point') {
    collectBrush(end.x, end.y);
  } else if (mode === 'rect') {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        addPosition(x, y);
      }
    }
  } else if (mode === 'circle') {
    const radiusSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    const radius = Math.sqrt(radiusSquared);
    const minX = Math.floor(start.x - radius);
    const maxX = Math.ceil(start.x + radius);
    const minY = Math.floor(start.y - radius);
    const maxY = Math.ceil(start.y + radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if ((x - start.x) ** 2 + (y - start.y) ** 2 <= radiusSquared) {
          addPosition(x, y);
        }
      }
    }
  } else if (mode === 'line') {
    for (const { x, y } of bresenhamLine(start.x, start.y, end.x, end.y)) {
      collectBrush(x, y);
    }
  }

  if (positions.size === 0) return;

  if (!terrainGridInitializedRef?.current) {
    terrainGridRef.clear();
    const built = buildTerrainGridFromLayer(layer.data ?? [], tilesets, currentMap.tilesetRefs);
    for (const [key, value] of built.entries()) {
      terrainGridRef.set(key, value);
    }
    if (terrainGridInitializedRef) terrainGridInitializedRef.current = true;
  }

  const allTilesToUpdate = new Map<string, { tileX: number; tileY: number }>();

  for (const pos of positions.values()) {
    const tilesToUpdate = applyTerrainToTile(
      pos.x,
      pos.y,
      terrainId,
      terrainGridRef,
      currentMap.width,
      currentMap.height,
    );
    for (const tile of tilesToUpdate) {
      allTilesToUpdate.set(`${tile.tileX},${tile.tileY}`, tile);
    }
  }

  const tilesToPaint: TilePaintOp[] = [];
  const tilesToErase: TileEraseOp[] = [];

  for (const { tileX, tileY } of allTilesToUpdate.values()) {
    if (tileX < 0 || tileX >= currentMap.width || tileY < 0 || tileY >= currentMap.height) continue;

    const corners = getCornerTerrainsForTile(tileX, tileY, terrainGridRef);
    const matchingTile = findBestMatchingTileWithFallback(tileset, corners, true);

    if (matchingTile !== null) {
      tilesToPaint.push({
        x: tileX,
        y: tileY,
        tilesetId: activeTilesetId,
        tileIndex: matchingTile,
      });
    } else if (corners.every((c) => c === null)) {
      tilesToErase.push({ x: tileX, y: tileY });
    }
  }

  if (tilesToPaint.length > 0) paintTilesBatch(selectedLayerId!, tilesToPaint);
  if (tilesToErase.length > 0) eraseTilesBatch(selectedLayerId!, tilesToErase);

  // For terrain layers: persist the painted terrain ID so the layer can be re-resolved
  if (paintTerrainDataBatch && positions.size > 0) {
    const terrainCells = Array.from(positions.values(), ({ x, y }) => ({ x, y, terrainId }));
    paintTerrainDataBatch(selectedLayerId!, terrainCells);
  }
}
