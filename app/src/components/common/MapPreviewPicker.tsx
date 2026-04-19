import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Text, Flex, Spinner, HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { resolveTileAt } from '../../lib/mapUtils';
import { EDITOR_CANVAS_HEX } from '../../lib/editorColors';
import { Map as GameMap, Tileset } from '../../types/schema';
import { useProject } from '../../hooks/useProject';

interface MapPreviewPickerProps {
  /** The map to render and pick from */
  mapId: string;
  /** Currently selected tile position (highlighted in cyan) */
  selectedPosition?: [number, number] | null;
  /** Called when the user clicks a tile */
  onSelect?: (x: number, y: number) => void;
  /** Container display size in px */
  width?: number;
  height?: number;
  /** Whether clicking is enabled */
  interactive?: boolean;
  /** Optional non-tile overlays such as trigger areas or arrival markers */
  overlays?: MapPreviewOverlay[];
}

export type MapPreviewOverlay =
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
  overlays: MapPreviewOverlay[] | undefined,
  tileSize: number,
) {
  const ts = NATIVE_TILE_PX;
  const W = map.width * ts;
  const H = map.height * ts;

  // Background
  ctx.fillStyle = EDITOR_CANVAS_HEX;
  ctx.fillRect(0, 0, W, H);

  // Visual + terrain layers sorted by zOrder
  const layers = [...map.layers]
    .filter((l) => l.visible && (l.kind === 'visual' || l.kind === 'terrain'))
    .sort((a, b) => a.zOrder - b.zOrder);

  ctx.imageSmoothingEnabled = false;

  for (const layer of layers) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const ref = resolveTileAt(map, layer.id, x, y, null);
        if (!ref) continue;

        const colonIdx = ref.indexOf(':');
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

  if (overlays?.length) {
    const drawArrivalArrow = (
      position: [number, number],
      facing: [number, number],
      color: string,
    ) => {
      const centerX = position[0] * ts + ts / 2;
      const centerY = position[1] * ts + ts / 2;
      const [dx, dy] = facing;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const normX = dx / length;
      const normY = dy / length;
      const arrowLength = ts * 0.65;
      const endX = centerX + normX * arrowLength;
      const endY = centerY + normY * arrowLength;
      const wingScale = ts * 0.18;
      const perpX = -normY;
      const perpY = normX;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, ts * 0.16, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - normX * ts * 0.25 + perpX * wingScale,
        endY - normY * ts * 0.25 + perpY * wingScale,
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - normX * ts * 0.25 - perpX * wingScale,
        endY - normY * ts * 0.25 - perpY * wingScale,
      );
      ctx.stroke();
    };

    for (const overlay of overlays) {
      if (overlay.kind === 'trigger') {
        const [x, y] = overlay.position;
        const [w, h] = overlay.size ?? [1, 1];
        const color = overlay.color ?? 'rgba(245, 158, 11, 0.95)';

        ctx.fillStyle = color.replace('0.95', '0.20');
        ctx.fillRect(x * ts, y * ts, w * ts, h * ts);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * ts + 0.75, y * ts + 0.75, w * ts - 1.5, h * ts - 1.5);
      }

      if (overlay.kind === 'anchor') {
        const [ax, ay] = overlay.position;
        const centerX = ax * ts + ts / 2;
        const centerY = ay * ts + ts / 2;
        const color = overlay.color ?? 'rgba(246, 173, 85, 0.95)';
        const markerSize = ts * 0.18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, markerSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX - ts * 0.35, centerY);
        ctx.lineTo(centerX + ts * 0.35, centerY);
        ctx.moveTo(centerX, centerY - ts * 0.35);
        ctx.lineTo(centerX, centerY + ts * 0.35);
        ctx.stroke();
        drawArrivalArrow(overlay.position, overlay.facing ?? [0, 1], color);
      }

      if (overlay.kind === 'arrival') {
        drawArrivalArrow(
          overlay.position,
          overlay.facing ?? [0, 1],
          overlay.color ?? 'rgba(34, 211, 238, 0.95)',
        );
      }
    }
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
  width = 480,
  height = 320,
  interactive = true,
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
  const [zoom, setZoom] = useState(2);
  // Pan offset in CSS pixels (from top-left of the canvas at zoom=1)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const map = maps.find((m) => m.id === mapId);

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
        x: Math.max(minX, Math.min(0, px)),
        y: Math.max(minY, Math.min(0, py)),
      };
    },
    [map, width, height, baseScale],
  );

  // Reset pan when zoom resets to 1
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
    else setPan((p) => clampPan(p.x, p.y, zoom));
  }, [zoom, clampPan]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    if (!canvasRef.current || !map) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    renderToCanvas(
      ctx,
      map,
      tilesets,
      loadedSprites,
      hovered,
      selectedPosition,
      overlays,
      tileSize,
    );
    setIsLoading(false);
  }, [map, tilesets, loadedSprites, hovered, selectedPosition, overlays, tileSize]);

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

  // ── Mouse events ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.mx;
        const dy = e.clientY - panStartRef.current.my;
        setPan(clampPan(panStartRef.current.px + dx, panStartRef.current.py + dy, zoom));
        return;
      }
      if (!interactive) return;
      const tile = getTile(e);
      setHovered(tile);
    },
    [interactive, getTile, clampPan, zoom],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Middle mouse or right mouse → pan
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      }
    },
    [pan],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }
      if (e.button === 0 && interactive && onSelect) {
        const tile = getTile(e);
        if (tile) onSelect(tile[0], tile[1]);
      }
    },
    [interactive, onSelect, getTile],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    isPanningRef.current = false;
  }, []);

  // Scroll wheel zoom — zooms toward cursor position
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
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

  const zoomIn = () => setZoom((z) => Math.min(8, +(z * 1.5).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(1, +(z / 1.5).toFixed(2)));
  const zoomReset = () => {
    setZoom(2);
    setPan({ x: 0, y: 0 });
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
          isPanningRef.current ? 'grabbing' : interactive && onSelect ? 'crosshair' : 'default'
        }
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheelCapture={handleWheel}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        userSelect="none"
        overscrollBehavior="contain"
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
          Scroll to zoom · Right-drag to pan
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
          <Tooltip label="Reset zoom" placement="top" hasArrow>
            <Box
              as="button"
              px={1.5}
              py={0.5}
              fontSize="10px"
              color={zoom !== 1 ? 'cyan.400' : 'gray.600'}
              cursor="pointer"
              onClick={zoomReset}
              borderRadius="sm"
              _hover={{ color: 'white' }}
            >
              {Math.round(zoom * 100)}%
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
