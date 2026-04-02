import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  VStack,
  HStack,
  Text,
  Button,
  ButtonGroup,
  Box,
  Textarea,
} from '@chakra-ui/react';
import { CollisionDefinition } from '../../types/schema';
import {
  FULL_TILE_POLYGON,
  NormalizedPoint,
  buildPolygonCollision,
  clamp01,
  getPolygonFromCollision,
  isValidPolygon,
} from '../../lib/collisionUtils';

type CollisionMode = 'none' | 'full' | 'polygon';

const CANVAS_SIZE = 180;
const HANDLE_RADIUS = 6;
const DRAW_PADDING = 14;

interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TileCollisionEditorProps {
  tileWidth: number;
  tileHeight: number;
  tileIndex?: number | null;
  tilesetColumns?: number;
  sprite?: HTMLImageElement;
  collision?: CollisionDefinition;
  onChange: (next: CollisionDefinition) => void;
}

function detectMode(collision?: CollisionDefinition): CollisionMode {
  if (!collision || collision.type === 'none') return 'none';
  if (collision.type === 'full') return 'full';
  return 'polygon';
}

function findNearestHandle(
  points: NormalizedPoint[],
  pointerX: number,
  pointerY: number,
  drawRect: DrawRect,
): number {
  let nearest = -1;
  let nearestDistance = Infinity;
  const threshold = HANDLE_RADIUS + 2;

  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    const drawX = drawRect.x + px * drawRect.width;
    const drawY = drawRect.y + py * drawRect.height;
    const distance = Math.hypot(drawX - pointerX, drawY - pointerY);
    if (distance <= threshold && distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  }

  return nearest;
}

function pointsToRaw(points: NormalizedPoint[]): string {
  return JSON.stringify(points, null, 2);
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function quantizeNormalizedPoint(
  point: NormalizedPoint,
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint {
  const stepX = 1 / Math.max(1, tileWidth);
  const stepY = 1 / Math.max(1, tileHeight);
  const x = clamp01(roundToStep(point[0], stepX));
  const y = clamp01(roundToStep(point[1], stepY));
  return [Number(x.toFixed(6)), Number(y.toFixed(6))];
}

function getDrawRect(tileWidth: number, tileHeight: number): DrawRect {
  const maxW = CANVAS_SIZE - DRAW_PADDING * 2;
  const maxH = CANVAS_SIZE - DRAW_PADDING * 2;
  const aspect = tileWidth / Math.max(1, tileHeight);

  let width = maxW;
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }

  return {
    x: (CANVAS_SIZE - width) / 2,
    y: (CANVAS_SIZE - height) / 2,
    width,
    height,
  };
}

function toCanvasPoint(point: NormalizedPoint, drawRect: DrawRect) {
  return {
    x: drawRect.x + point[0] * drawRect.width,
    y: drawRect.y + point[1] * drawRect.height,
  };
}

function distanceToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(point.x - projX, point.y - projY);
}

function findInsertionIndex(
  points: NormalizedPoint[],
  point: NormalizedPoint,
  drawRect: DrawRect,
): number {
  if (points.length < 2) return points.length;

  const testPoint = toCanvasPoint(point, drawRect);
  let bestIndex = points.length;
  let bestDistance = Infinity;
  const closed = points.length >= 3;
  const segmentCount = closed ? points.length : points.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const nextIndex = (i + 1) % points.length;
    const a = toCanvasPoint(points[i], drawRect);
    const b = toCanvasPoint(points[nextIndex], drawRect);
    const distance = distanceToSegment(testPoint, a, b);
    const insertAt = nextIndex === 0 ? points.length : nextIndex;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = insertAt;
    }
  }

  return bestIndex;
}

function parseRawPoints(
  raw: string,
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected JSON array of [x, y] points.');
    }

    return parsed.map((value, index) => {
      if (!Array.isArray(value) || value.length < 2) {
        throw new Error(`Point at index ${index} is invalid.`);
      }
      const x = Number(value[0]);
      const y = Number(value[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Point at index ${index} has invalid numeric values.`);
      }
      return quantizeNormalizedPoint(
        [clamp01(x), clamp01(y)] as NormalizedPoint,
        tileWidth,
        tileHeight,
      );
    });
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const [xRaw, yRaw] = line.split(',').map((value) => value.trim());
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(
        `Line ${index + 1} must use "x,y" with numeric values between 0 and 1.`,
      );
    }
    return quantizeNormalizedPoint(
      [clamp01(x), clamp01(y)] as NormalizedPoint,
      tileWidth,
      tileHeight,
    );
  });
}

export const TileCollisionEditor: React.FC<TileCollisionEditorProps> = ({
  tileWidth,
  tileHeight,
  tileIndex,
  tilesetColumns,
  sprite,
  collision,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<CollisionMode>(() => detectMode(collision));
  const [points, setPoints] = useState<NormalizedPoint[]>(() =>
    getPolygonFromCollision(collision, tileWidth, tileHeight),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showRawView, setShowRawView] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const [isEditingRaw, setIsEditingRaw] = useState(false);

  const polygonValid = useMemo(() => isValidPolygon(points), [points]);

  useEffect(() => {
    const nextMode = detectMode(collision);
    setMode(nextMode);

    const incomingPoints = getPolygonFromCollision(collision, tileWidth, tileHeight);
    if (nextMode === 'polygon' && incomingPoints.length > 0) {
      setPoints(incomingPoints);
    }
    if (nextMode !== 'polygon') {
      setPoints(incomingPoints);
    }
  }, [collision, tileHeight, tileWidth]);

  useEffect(() => {
    if (!isEditingRaw) {
      setRawText(pointsToRaw(points));
      setRawError(null);
    }
  }, [points, isEditingRaw]);

  const emitPolygonCollision = useCallback(
    (nextPoints: NormalizedPoint[]) => {
      if (isValidPolygon(nextPoints)) {
        onChange(buildPolygonCollision(nextPoints));
      }
    },
    [onChange],
  );

  const setModeAndEmit = useCallback(
    (nextMode: CollisionMode) => {
      setMode(nextMode);
      if (nextMode === 'none') {
        onChange({ type: 'none' });
        return;
      }
      if (nextMode === 'full') {
        onChange({ type: 'full' });
        return;
      }

      const seed = points.length >= 3 ? points : FULL_TILE_POLYGON;
      setPoints(seed);
      emitPolygonCollision(seed);
    },
    [emitPolygonCollision, onChange, points],
  );

  const getPointerFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const getNormalizedFromPointer = useCallback(
    (pointer: { x: number; y: number }) => {
      const drawRect = getDrawRect(tileWidth, tileHeight);
      const x = clamp01((pointer.x - drawRect.x) / Math.max(1, drawRect.width));
      const y = clamp01((pointer.y - drawRect.y) / Math.max(1, drawRect.height));
      return quantizeNormalizedPoint([x, y], tileWidth, tileHeight);
    },
    [tileHeight, tileWidth],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (mode !== 'polygon') return;
      const pointer = getPointerFromEvent(e);
      if (!pointer) return;
      const normalized = getNormalizedFromPointer(pointer);
      const drawRect = getDrawRect(tileWidth, tileHeight);
      const nearest = findNearestHandle(
        points,
        pointer.x,
        pointer.y,
        drawRect,
      );

      if (e.button === 2) {
        if (nearest >= 0 && points.length > 3) {
          const next = points.filter((_, idx) => idx !== nearest);
          setPoints(next);
          emitPolygonCollision(next);
        }
        return;
      }

      if (nearest >= 0) {
        setDragIndex(nearest);
        return;
      }

      const next = [...points];
      const insertIndex = findInsertionIndex(points, normalized, drawRect);
      next.splice(insertIndex, 0, normalized);
      setPoints(next);
      emitPolygonCollision(next);
    },
    [
      emitPolygonCollision,
      getNormalizedFromPointer,
      getPointerFromEvent,
      mode,
      points,
      tileHeight,
      tileWidth,
    ],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragIndex === null || mode !== 'polygon') return;
      const pointer = getPointerFromEvent(e);
      if (!pointer) return;
      const normalized = getNormalizedFromPointer(pointer);

      const next = points.map((point, index) => {
        if (index !== dragIndex) return point;
        return normalized;
      });

      setPoints(next);
      emitPolygonCollision(next);
    },
    [
      dragIndex,
      emitPolygonCollision,
      getNormalizedFromPointer,
      getPointerFromEvent,
      mode,
      points,
    ],
  );

  useEffect(() => {
    if (dragIndex === null) return;

    const onMouseUp = () => setDragIndex(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragIndex, handleMouseMove]);

  const applyFullPolygon = useCallback(() => {
    const next = FULL_TILE_POLYGON.map(([x, y]) => [x, y] as NormalizedPoint);
    setPoints(next);
    emitPolygonCollision(next);
  }, [emitPolygonCollision]);

  const removeLastPoint = useCallback(() => {
    if (points.length <= 3) return;
    const next = points.slice(0, -1);
    setPoints(next);
    emitPolygonCollision(next);
  }, [emitPolygonCollision, points]);

  const applyRawPoints = useCallback(() => {
    try {
      const parsed = parseRawPoints(rawText, tileWidth, tileHeight);
      if (!isValidPolygon(parsed)) {
        setRawError('Raw polygon must have at least 3 distinct points and non-zero area.');
        return;
      }
      setRawError(null);
      setPoints(parsed);
      emitPolygonCollision(parsed);
    } catch (error) {
      setRawError(
        error instanceof Error
          ? error.message
          : 'Failed to parse raw points.',
      );
    }
  }, [emitPolygonCollision, rawText, tileHeight, tileWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = '#090b10';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const drawRect = getDrawRect(tileWidth, tileHeight);

    if (
      mode === 'polygon' &&
      sprite &&
      tileIndex !== null &&
      tileIndex !== undefined &&
      tileIndex >= 0 &&
      tilesetColumns &&
      tilesetColumns > 0
    ) {
      const sourceX = (tileIndex % tilesetColumns) * tileWidth;
      const sourceY = Math.floor(tileIndex / tilesetColumns) * tileHeight;

      context.imageSmoothingEnabled = false;
      context.drawImage(
        sprite,
        sourceX,
        sourceY,
        tileWidth,
        tileHeight,
        drawRect.x,
        drawRect.y,
        drawRect.width,
        drawRect.height,
      );

      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.fillRect(
        drawRect.x,
        drawRect.y,
        drawRect.width,
        drawRect.height,
      );
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    context.lineWidth = 1;
    for (let i = 1; i < tileWidth; i++) {
      const pos = drawRect.x + (drawRect.width * i) / Math.max(1, tileWidth);
      context.beginPath();
      context.moveTo(pos, drawRect.y);
      context.lineTo(pos, drawRect.y + drawRect.height);
      context.stroke();
    }

    for (let i = 1; i < tileHeight; i++) {
      const pos =
        drawRect.y + (drawRect.height * i) / Math.max(1, tileHeight);
      context.beginPath();
      context.moveTo(drawRect.x, pos);
      context.lineTo(drawRect.x + drawRect.width, pos);
      context.stroke();
    }

    context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    context.lineWidth = 1;
    context.strokeRect(
      drawRect.x + 0.5,
      drawRect.y + 0.5,
      drawRect.width - 1,
      drawRect.height - 1,
    );

    if (mode !== 'polygon') return;

    if (points.length >= 3) {
      const first = toCanvasPoint(points[0], drawRect);
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const next = toCanvasPoint(points[i], drawRect);
        context.lineTo(next.x, next.y);
      }
      context.closePath();
      context.fillStyle = 'rgba(255, 140, 60, 0.28)';
      context.fill();
      context.strokeStyle = 'rgba(255, 179, 113, 0.95)';
      context.lineWidth = 2;
      context.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      const point = toCanvasPoint(points[i], drawRect);
      context.beginPath();
      context.arc(point.x, point.y, HANDLE_RADIUS / 2, 0, Math.PI * 2);
      context.fillStyle = i === dragIndex ? '#ffd299' : '#ffb26b';
      context.fill();
      context.strokeStyle = '#2a1300';
      context.lineWidth = 1;
      context.stroke();
    }
  }, [
    dragIndex,
    mode,
    points,
    sprite,
    tileIndex,
    tileWidth,
    tileHeight,
    tilesetColumns,
  ]);

  return (
    <VStack align="stretch" spacing={3} mt={2} p={3} borderWidth="1px" borderColor="gray.800" rounded="md" bg="#07090f">
      <Text fontSize="10px" color="gray.500" textTransform="uppercase" letterSpacing="wide">
        Collision Shape
      </Text>

      <ButtonGroup size="xs" isAttached variant="outline">
        <Button
          onClick={() => setModeAndEmit('none')}
          colorScheme={mode === 'none' ? 'orange' : undefined}
          variant={mode === 'none' ? 'solid' : 'outline'}
        >
          None
        </Button>
        <Button
          onClick={() => setModeAndEmit('full')}
          colorScheme={mode === 'full' ? 'orange' : undefined}
          variant={mode === 'full' ? 'solid' : 'outline'}
        >
          Full Tile
        </Button>
        <Button
          onClick={() => setModeAndEmit('polygon')}
          colorScheme={mode === 'polygon' ? 'orange' : undefined}
          variant={mode === 'polygon' ? 'solid' : 'outline'}
        >
          Polygon
        </Button>
      </ButtonGroup>

      {mode === 'polygon' && (
        <>
          <Text fontSize="11px" color="gray.400">
            Click near an edge to insert a snapped vertex. Drag handles to move on pixel grid. Right-click a handle to remove it.
          </Text>
          <Box borderWidth="1px" borderColor="gray.800" rounded="sm" overflow="hidden" w={`${CANVAS_SIZE}px`}>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onContextMenu={(e) => e.preventDefault()}
              style={{ display: 'block', width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`, cursor: 'crosshair' }}
            />
          </Box>
          <HStack spacing={2}>
            <Button size="xs" onClick={applyFullPolygon} variant="outline">
              Full-Tile Polygon
            </Button>
            <Button
              size="xs"
              onClick={removeLastPoint}
              variant="outline"
              isDisabled={points.length <= 3}
            >
              Remove Last Vertex
            </Button>
            <Button
              size="xs"
              onClick={() => setShowRawView((prev) => !prev)}
              variant="outline"
            >
              {showRawView ? 'Hide Raw' : 'Raw View'}
            </Button>
          </HStack>
          {showRawView && (
            <VStack align="stretch" spacing={2}>
              <Text fontSize="10px" color="gray.500">
                Edit normalized points as JSON array of [x, y], values in 0..1.
              </Text>
              <Textarea
                size="sm"
                minH="120px"
                fontFamily="mono"
                fontSize="11px"
                value={rawText}
                onFocus={() => setIsEditingRaw(true)}
                onBlur={() => setIsEditingRaw(false)}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setRawError(null);
                }}
                bg="#05060a"
                borderColor="#0b1116"
                color="white"
              />
              <HStack spacing={2}>
                <Button size="xs" variant="outline" onClick={applyRawPoints}>
                  Apply Raw
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setRawText(pointsToRaw(points));
                    setRawError(null);
                  }}
                >
                  Reset Raw
                </Button>
              </HStack>
              {rawError && (
                <Text fontSize="11px" color="red.300">
                  {rawError}
                </Text>
              )}
            </VStack>
          )}
          {!polygonValid && (
            <Text fontSize="11px" color="orange.300">
              Polygon needs at least 3 distinct points with non-zero area.
            </Text>
          )}
        </>
      )}

      {(mode === 'none' || mode === 'full') && (
        <Text fontSize="11px" color="gray.500">
          {mode === 'none'
            ? 'Tile has no collider.'
            : 'Tile is fully blocked using one box collider.'}
        </Text>
      )}
    </VStack>
  );
};

export default TileCollisionEditor;
