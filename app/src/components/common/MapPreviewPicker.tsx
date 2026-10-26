import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Text, Flex, Spinner, HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { MapPreviewAnnotations } from './MapPreviewAnnotations';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { resolveTileAt } from '../../lib/mapUtils';
import { EDITOR_CANVAS_HEX } from '../../lib/editorColors';
import { Map as GameMap, Tileset } from '../../types/schema';
import { useProject } from '../../hooks/useProject';
import { pickMapPosition, type MapPosition, type PlacementMode } from '../../lib/mapPosition';

export interface MapPositionPick {
  mode: PlacementMode;
  onPick: (position: MapPosition) => void;
  onHover: (position: MapPosition | null) => void;
}
interface MapPreviewPickerProps {
  /** The map to render and pick from */
  mapId: string;
  /** Currently selected tile position (highlighted in cyan) */
  selectedPosition?: [number, number] | null;
  /** Called when the user clicks a tile */
  onSelect?: (x: number, y: number) => void;
  positionPick?: MapPositionPick;
  /** Container display size in px */
  width?: number;
  height?: number;
  /** Whether clicking is enabled */
  interactive?: boolean;
  /** Disable wheel capture in scrollable editors; explicit zoom controls remain available. */
  wheelZoom?: boolean;
  /** Use the primary mouse button to navigate a standalone preview rather than pick tiles. */
  leftDragPan?: boolean;
  initialZoom?: number;
  /** Tile coordinates to frame when the selected step changes. */
  focusPositions?: [number, number][];
  focusKey?: string;
  /** Optional non-tile overlays such as trigger areas or arrival markers */
  overlays?: MapPreviewOverlay[];
}

export type MapPreviewOverlay =
  | { kind: 'waypoint'; position: [number, number]; label: string; opacity?: number }
  | { kind: 'placement'; position: [number, number]; label: string; icon?: string }
  | {
      kind: 'character';
      characterId?: string;
      icon?: string;
      position: [number, number];
      label: string;
      facing?: [number, number] | null;
      ghost?: boolean;
      opacity?: number;
    }
  | {
      kind: 'segment';
      from: [number, number];
      to: [number, number];
      label: string;
      dashed?: boolean;
      opacity?: number;
    }
  | {
      kind: 'trigger';
      position: [number, number];
      size?: [number, number];
      color?: string;
    }
  | {
      kind: 'anchor';
      position: [number, number];
      facing?: [number, number];
      color?: string;
    }
  | {
      kind: 'arrival';
      position: [number, number];
      facing?: [number, number];
      color?: string;
    };

// Native canvas resolution per tile — drawn at this size, then CSS-scaled
const NATIVE_TILE_PX = 16;

// ─── Pure render function (no React) ──────────────────────────────────────────

function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  tilesets: Map<string, Tileset>,
  sprites: Map<string, HTMLImageElement>,
  hovered: [number, number] | null,
  selectedPosition: [number, number] | null | undefined,
  tileSize: number,
) {
  const ts = NATIVE_TILE_PX;
  const W = map.width * ts;
  const H = map.height * ts;

  // Background
  ctx.fillStyle = EDITOR_CANVAS_HEX;
  ctx.fillRect(0, 0, W, H);

  // Visual-style layers sorted by zOrder
  const layers = [...map.layers]
    .filter(
      (l) => l.visible && (l.kind === 'visual' || l.kind === 'terrain' || l.kind === 'object'),
    )
    .sort((a, b) => a.zOrder - b.zOrder);

  ctx.imageSmoothingEnabled = false;

  for (const layer of layers) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const ref = resolveTileAt(map, layer.id, x, y, null, tilesets);
        if (!ref) continue;

        const colonIdx = ref.lastIndexOf(':');
        if (colonIdx === -1) continue;
        const tilesetId = ref.slice(0, colonIdx);
        const tileIndex = parseInt(ref.slice(colonIdx + 1), 10);

        const tileset = tilesets.get(tilesetId);
        if (!tileset) continue;

        const img = sprites.get(tileset.spriteSheet);
        if (!img || !img.complete || img.naturalWidth === 0) continue;

        const col = tileIndex % tileset.columns;
        const row = Math.floor(tileIndex / tileset.columns);

        ctx.drawImage(
          img,
          col * tileSize,
          row * tileSize,
          tileSize,
          tileSize,
          x * ts,
          y * ts,
          ts,
          ts,
        );
      }
    }
  }

  // Grid (very subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= map.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * ts, 0);
    ctx.lineTo(x * ts, H);
    ctx.stroke();
  }
  for (let y = 0; y <= map.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * ts);
    ctx.lineTo(W, y * ts);
    ctx.stroke();
  }

  // Selected tile
  if (selectedPosition) {
    const [sx, sy] = selectedPosition;
    ctx.fillStyle = 'rgba(6,182,212,0.35)';
    ctx.fillRect(sx * ts, sy * ts, ts, ts);
    ctx.strokeStyle = 'rgba(6,182,212,0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx * ts + 0.75, sy * ts + 0.75, ts - 1.5, ts - 1.5);
    // Crosshair
    ctx.strokeStyle = 'rgba(6,182,212,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, sy * ts + ts / 2);
    ctx.lineTo(W, sy * ts + ts / 2);
    ctx.moveTo(sx * ts + ts / 2, 0);
    ctx.lineTo(sx * ts + ts / 2, H);
    ctx.stroke();
  }

  // Hover tile
  if (hovered) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(hovered[0] * ts, hovered[1] * ts, ts, ts);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MapPreviewPicker: React.FC<MapPreviewPickerProps> = ({
  mapId,
  selectedPosition,
  onSelect,
  positionPick,
  width = 480,
  height = 320,
  interactive = true,
  wheelZoom = true,
  leftDragPan = false,
  initialZoom = 2,
  focusPositions,
  focusKey,
  overlays,
}) => {
  const { tileSize } = useProject();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maps = useEditorStore((s) => s.maps);
  const tilesets = useEditorStore((s) => s.tilesets);
  const loadedSprites = useEditorStore((s) => s.loadedSprites);

  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Zoom: CSS scale factor applied to the canvas (1 = fit-to-container, higher = zoom in)
  const [zoom, setZoom] = useState(initialZoom);
  // Pan offset in CSS pixels (from top-left of the canvas at zoom=1)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const currentMap = useEditorStore((s) => s.currentMap);
  const map = currentMap?.id === mapId ? currentMap : maps.find((m) => m.id === mapId);

  // Fit-to-container base scale: make the whole map visible at zoom=1
  const baseScale = map
    ? Math.min(width / (map.width * NATIVE_TILE_PX), height / (map.height * NATIVE_TILE_PX))
    : 1;

  const effectiveScale = baseScale * zoom;
  const canvasDisplayW = map ? map.width * NATIVE_TILE_PX * effectiveScale : width;
  const canvasDisplayH = map ? map.height * NATIVE_TILE_PX * effectiveScale : height;

  // Clamp pan so we can't pan the map completely out of view
  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      if (!map) return { x: 0, y: 0 };
      const dw = map.width * NATIVE_TILE_PX * baseScale * z;
      const dh = map.height * NATIVE_TILE_PX * baseScale * z;
      const minX = Math.min(0, width - dw);
      const minY = Math.min(0, height - dh);
      return {
        x: dw < width ? (width - dw) / 2 : Math.max(minX, Math.min(0, px)),
        y: dh < height ? (height - dh) / 2 : Math.max(minY, Math.min(0, py)),
      };
    },
    [map, width, height, baseScale],
  );

  // Keep a fitted map centered as the pane changes size.
  useEffect(() => {
    setPan((p) => clampPan(p.x, p.y, zoom));
  }, [zoom, clampPan]);

  const focusSignature = JSON.stringify(focusPositions ?? []);
  useEffect(() => {
    const points: [number, number][] = JSON.parse(focusSignature);
    if (!map || !points.length) return;
    const xs = points.map((p) => p[0] * NATIVE_TILE_PX),
      ys = points.map((p) => p[1] * NATIVE_TILE_PX);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const scale = Math.min(
      Math.max(1, width - 96) / Math.max(160, maxX - minX),
      Math.max(1, height - 96) / Math.max(160, maxY - minY),
    );
    const next = Math.max(1, Math.min(8, scale / baseScale));
    setZoom(next);
    setPan(
      clampPan(
        width / 2 - ((minX + maxX) / 2) * baseScale * next,
        height / 2 - ((minY + maxY) / 2) * baseScale * next,
        next,
      ),
    );
  }, [focusSignature, focusKey, map, width, height, baseScale, clampPan]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    if (!canvasRef.current || !map) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    renderToCanvas(ctx, map, tilesets, loadedSprites, hovered, selectedPosition, tileSize);
    setIsLoading(false);
  }, [map, tilesets, loadedSprites, hovered, selectedPosition, tileSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ── Tile from pointer event ───────────────────────────────────────────────
  const getTile = useCallback(
    (e: React.MouseEvent | MouseEvent): [number, number] | null => {
      if (!map || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      // Position within the container
      const cx = e.clientX - rect.left - pan.x;
      const cy = e.clientY - rect.top - pan.y;
      // Convert to tile coords
      const tx = Math.floor(cx / (NATIVE_TILE_PX * effectiveScale));
      const ty = Math.floor(cy / (NATIVE_TILE_PX * effectiveScale));
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
      return [tx, ty];
    },
    [map, pan, effectiveScale],
  );

  const getPosition = useCallback(
    (e: React.MouseEvent): MapPosition | null => {
      if (!map || !containerRef.current || !positionPick) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / (NATIVE_TILE_PX * effectiveScale);
      const y = (e.clientY - rect.top - pan.y) / (NATIVE_TILE_PX * effectiveScale);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
      return pickMapPosition(x, y, tileSize, positionPick.mode);
    },
    [map, pan, effectiveScale, tileSize, positionPick],
  );

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.mx;
        const dy = e.clientY - panStartRef.current.my;
        setPan(clampPan(panStartRef.current.px + dx, panStartRef.current.py + dy, zoom));
        return;
      }
      if (positionPick) {
        positionPick.onHover(getPosition(e));
        return;
      }
      if (!interactive) return;
      const tile = getTile(e);
      setHovered(tile);
    },
    [interactive, getTile, clampPan, zoom, positionPick, getPosition],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && leftDragPan)) {
        e.preventDefault();
        isPanningRef.current = true;
        setIsPanning(true);
        panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      }
    },
    [pan, leftDragPan],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const dragged =
        Math.hypot(e.clientX - panStartRef.current.mx, e.clientY - panStartRef.current.my) >= 4;
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        if (e.button === 0 && !dragged && positionPick) {
          const point = getPosition(e);
          if (point) positionPick.onPick(point);
        }
        return;
      }
      if (e.button === 0 && positionPick) {
        const point = getPosition(e);
        if (point) positionPick.onPick(point);
        return;
      }
      if (e.button === 0 && interactive && onSelect) {
        const tile = getTile(e);
        if (tile) onSelect(tile[0], tile[1]);
      }
    },
    [interactive, onSelect, getTile, positionPick, getPosition],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    positionPick?.onHover(null);
    isPanningRef.current = false;
    setIsPanning(false);
  }, [positionPick]);

  // Scroll wheel zoom — zooms toward cursor position
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!map || !containerRef.current) return;

      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      setZoom((prev) => {
        const next = Math.max(1, Math.min(8, prev * factor));
        // Zoom toward cursor
        const rect = containerRef.current!.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const scaleRatio = (baseScale * next) / (baseScale * prev);
        const newPanX = cx - scaleRatio * (cx - pan.x);
        const newPanY = cy - scaleRatio * (cy - pan.y);
        const clamped = clampPan(newPanX, newPanY, next);
        setPan(clamped);
        return next;
      });
    },
    [map, pan, baseScale, clampPan],
  );

  // A native non-passive listener lets wheel zoom consume scrolling inside the preview.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !wheelZoom) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel, wheelZoom, map]);

  const zoomIn = () => setZoom((z) => Math.min(8, +(z * 1.5).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(1, +(z / 1.5).toFixed(2)));
  const zoomReset = () => {
    setZoom(1);
    setPan(clampPan(0, 0, 1));
  };

  if (!map) {
    return (
      <Flex
        w={`${width}px`}
        h={`${Math.min(height, 120)}px`}
        align="center"
        justify="center"
        bg="editorCanvasBg"
        borderRadius="md"
        border="1px"
        borderColor="whiteAlpha.100"
      >
        <Text fontSize="xs" color="gray.600">
          Map not found
        </Text>
      </Flex>
    );
  }

  return (
    <Box w={`${width}px`}>
      {/* Canvas viewport — clips zoomed/panned canvas */}
      <Box
        ref={containerRef}
        w={`${width}px`}
        h={`${height}px`}
        position="relative"
        overflow="hidden"
        bg="editorCanvasBg"
        borderRadius="md"
        border="1px solid rgba(255,255,255,0.08)"
        cursor={
          isPanning
            ? 'grabbing'
            : positionPick
              ? 'crosshair'
              : leftDragPan
                ? 'grab'
                : interactive && onSelect
                  ? 'crosshair'
                  : 'default'
        }
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
        userSelect="none"
        overscrollBehavior={wheelZoom ? 'contain' : undefined}
      >
        {isLoading && (
          <Flex position="absolute" inset={0} align="center" justify="center" zIndex={2}>
            <Spinner size="sm" color="cyan.400" />
          </Flex>
        )}

        {/* The canvas sits inside, positioned/scaled by pan+zoom */}
        <canvas
          ref={canvasRef}
          width={map.width * NATIVE_TILE_PX}
          height={map.height * NATIVE_TILE_PX}
          style={{
            position: 'absolute',
            top: `${pan.y}px`,
            left: `${pan.x}px`,
            width: `${canvasDisplayW}px`,
            height: `${canvasDisplayH}px`,
            imageRendering: 'pixelated',
            pointerEvents: 'none', // container handles events
          }}
        />

        <MapPreviewAnnotations
          overlays={overlays}
          width={width}
          height={height}
          scale={effectiveScale}
          pan={pan}
        />

        {/* Coords overlay */}
        {selectedPosition && (
          <Box
            position="absolute"
            bottom="6px"
            left="6px"
            px={1.5}
            py={0.5}
            bg="blackAlpha.700"
            borderRadius="sm"
            fontSize="10px"
            color="cyan.300"
            fontFamily="mono"
            pointerEvents="none"
            zIndex={3}
          >
            ({selectedPosition[0]}, {selectedPosition[1]})
          </Box>
        )}

        {/* Zoom level badge */}
        <Box
          position="absolute"
          bottom="6px"
          right="6px"
          px={1.5}
          py={0.5}
          bg="blackAlpha.700"
          borderRadius="sm"
          fontSize="10px"
          color="gray.400"
          pointerEvents="none"
          zIndex={3}
        >
          {Math.round(zoom * 100)}%
        </Box>
      </Box>

      {/* Zoom controls below canvas */}
      <HStack spacing={1} mt={1} justify="space-between">
        <Text fontSize="10px" color="gray.600">
          {wheelZoom ? 'Scroll to zoom · ' : ''}
          {leftDragPan ? 'Drag to pan' : 'Right-drag to pan'}
        </Text>
        <HStack spacing={1}>
          <Tooltip label="Zoom out" placement="top" hasArrow>
            <IconButton
              aria-label="Zoom out"
              icon={<MinusIcon fontSize="8px" />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={zoomOut}
              isDisabled={zoom <= 1}
            />
          </Tooltip>
          <Tooltip label="Fit map" placement="top" hasArrow>
            <Box
              as="button"
              aria-label="Fit map"
              px={1.5}
              py={0.5}
              fontSize="10px"
              color={zoom !== 1 ? 'cyan.400' : 'gray.600'}
              cursor="pointer"
              onClick={zoomReset}
              borderRadius="sm"
              _hover={{ color: 'white' }}
            >
              Fit
            </Box>
          </Tooltip>
          <Tooltip label="Zoom in" placement="top" hasArrow>
            <IconButton
              aria-label="Zoom in"
              icon={<AddIcon fontSize="8px" />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={zoomIn}
              isDisabled={zoom >= 8}
            />
          </Tooltip>
        </HStack>
      </HStack>
    </Box>
  );
};

export default MapPreviewPicker;
