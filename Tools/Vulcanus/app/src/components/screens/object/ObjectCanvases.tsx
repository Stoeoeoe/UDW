import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { sheetRectangle } from '../../../lib/objects';
import type { Tileset, TileDefinition, TilesetObjectTile } from '../../../types/schema';

const PREVIEW_SCALE = 3;
const SHEET_SCALE = 2;
const COLLISION_FILL = 'rgba(239, 68, 68, 0.35)';
const COLLISION_STROKE = 'rgba(248, 113, 113, 0.9)';
const SORT_LINE = 'rgba(250, 204, 21, 0.95)';
const SELECTED_FILL = 'rgba(74, 222, 128, 0.3)';
const SELECTED_STROKE = 'rgba(134, 239, 172, 1)';
const GRID = 'rgba(255, 255, 255, 0.08)';

/** A tile's collision, drawn over the tile at (x, y), `size` pixels square. */
function drawCollision(
  ctx: CanvasRenderingContext2D,
  tile: TileDefinition | undefined,
  x: number,
  y: number,
  size: number,
) {
  const collision = tile?.collision;
  if (!collision || collision.type === 'none') return;
  ctx.fillStyle = COLLISION_FILL;
  ctx.strokeStyle = COLLISION_STROKE;
  ctx.lineWidth = 1;
  if (collision.type === 'full') {
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    return;
  }
  for (const shape of collision.shapes ?? []) {
    const points = shape.points ?? [];
    if (points.length < 3) continue;
    ctx.beginPath();
    points.forEach(([px, py], i) =>
      (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * size, y + py * size),
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

const source = (tileset: Tileset, tileIndex: number, tileSize: number) => ({
  sx: (tileIndex % tileset.columns) * tileSize,
  sy: Math.floor(tileIndex / tileset.columns) * tileSize,
});

/** The object as it is placed: its tiles, their collision and the line it sorts by. */
export function ObjectPreview({
  tiles,
  tileset,
  sprite,
  tileSize,
}: {
  tiles: TilesetObjectTile[];
  tileset: Tileset;
  sprite: HTMLImageElement;
  tileSize: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = (Math.max(...tiles.map((tile) => tile.x)) + 1) * tileSize * PREVIEW_SCALE;
  const height = (Math.max(...tiles.map((tile) => tile.y)) + 1) * tileSize * PREVIEW_SCALE;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const size = tileSize * PREVIEW_SCALE;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    for (const tile of tiles) {
      const { sx, sy } = source(tileset, tile.tileIndex, tileSize);
      ctx.drawImage(sprite, sx, sy, tileSize, tileSize, tile.x * size, tile.y * size, size, size);
    }
    for (const tile of tiles)
      drawCollision(ctx, tileset.tiles[tile.tileIndex], tile.x * size, tile.y * size, size);
    ctx.strokeStyle = SORT_LINE;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height - 1);
    ctx.lineTo(width, height - 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [height, sprite, tileSize, tiles, tileset, width]);

  return (
    <Box alignSelf="flex-start" p={3} bg="editorPanelBg" borderRadius="md">
      <canvas
        ref={ref}
        width={width}
        height={height}
        className="image-pixelated"
        aria-label="Object preview"
      />
    </Box>
  );
}

/** The tileset's sheet; drag to choose cells, Shift to add, Shift-click a chosen cell to remove it. */
export function ObjectSheetPicker({
  tileset,
  sprite,
  tileSize,
  selected,
  onChange,
}: {
  tileset: Tileset;
  sprite: HTMLImageElement;
  tileSize: number;
  selected: Set<number>;
  onChange: (tileIndices: number[]) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; adding: boolean } | null>(null);
  const columns = tileset.columns;
  const rows = Math.ceil(tileset.tileCount / columns);
  const size = tileSize * SHEET_SCALE;
  const width = columns * size;
  const height = rows * size;

  const shown = useMemo(
    () =>
      drag
        ? new Set([
            ...(drag.adding ? selected : []),
            ...sheetRectangle(drag.from, drag.to, columns),
          ])
        : selected,
    [columns, drag, selected],
  );

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, 0, 0, columns * tileSize, rows * tileSize, 0, 0, width, height);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let col = 1; col < columns; col++) {
      ctx.beginPath();
      ctx.moveTo(col * size + 0.5, 0);
      ctx.lineTo(col * size + 0.5, height);
      ctx.stroke();
    }
    for (let row = 1; row < rows; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * size + 0.5);
      ctx.lineTo(width, row * size + 0.5);
      ctx.stroke();
    }
    for (const tileIndex of shown) {
      const x = (tileIndex % columns) * size;
      const y = Math.floor(tileIndex / columns) * size;
      ctx.fillStyle = SELECTED_FILL;
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = SELECTED_STROKE;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }, [columns, height, rows, shown, size, sprite, tileSize, width]);

  const cellAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * columns);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
    const index =
      Math.min(rows - 1, Math.max(0, row)) * columns + Math.min(columns - 1, Math.max(0, col));
    return index < tileset.tileCount ? index : null;
  };

  return (
    <Box alignSelf="flex-start" overflow="auto" maxW="full">
      <canvas
        ref={ref}
        width={width}
        height={height}
        className="image-pixelated"
        aria-label="Tileset sheet"
        style={{ cursor: 'crosshair', display: 'block' }}
        onPointerDown={(event) => {
          const cell = cellAt(event);
          if (cell === null) return;
          if (event.shiftKey && selected.has(cell)) {
            onChange([...selected].filter((index) => index !== cell));
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ from: cell, to: cell, adding: event.shiftKey });
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          const cell = cellAt(event);
          if (cell !== null && cell !== drag.to) setDrag({ ...drag, to: cell });
        }}
        onPointerUp={() => {
          if (!drag) return;
          onChange([...shown]);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      />
    </Box>
  );
}
