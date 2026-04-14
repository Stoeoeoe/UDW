/**
 * Map3DLayerView
 *
 * A simple pseudo-3D visualisation of map layers stacked along the Z axis.
 * Uses Canvas 2D with a manual projection — no extra dependencies.
 *
 * Controls:
 *   Left-drag   — orbit (tilt up/down, rotate left/right)
 *   Scroll      — zoom in/out
 *   Right-drag  — pan
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  HStack,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { Layer } from '../../../types/schema';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';

// ─── Projection helpers ────────────────────────────────────────────────────────

interface Camera {
  rotX: number; // tilt (radians) — how much the view is tilted back
  rotY: number; // spin (radians) — rotation around vertical axis
  zoom: number; // scale factor
  panX: number; // screen-space pan
  panY: number; // screen-space pan
}

/** Project a 3D point [x,y,z] to 2D screen coords given a camera */
function project(
  x: number,
  y: number,
  z: number,
  cam: Camera,
  cx: number,
  cy: number,
): [number, number] {
  // Rotate around Y axis (spin)
  const cosY = Math.cos(cam.rotY);
  const sinY = Math.sin(cam.rotY);
  const rx = x * cosY - z * sinY;
  const rz = x * sinY + z * cosY;

  // Rotate around X axis (tilt)
  const cosX = Math.cos(cam.rotX);
  const sinX = Math.sin(cam.rotX);
  const ry2 = y * cosX - rz * sinX;
  // rz2 = y * sinX + rz * cosX;  // depth — not needed for ortho

  return [cx + rx * cam.zoom + cam.panX, cy + ry2 * cam.zoom + cam.panY];
}

// ─── Layer colour palette ──────────────────────────────────────────────────────

const LAYER_COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#84cc16', // lime-500
];

function layerColor(index: number, alpha: number): string {
  const hex = LAYER_COLORS[index % LAYER_COLORS.length];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Draw a single layer plane ─────────────────────────────────────────────────

function drawLayerPlane(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  colorIndex: number,
  mapW: number,
  mapH: number,
  zPos: number,
  cam: Camera,
  cx: number,
  cy: number,
  tileSize: number,
) {
  // Four corners of the map rectangle in 3D space
  // Centre the map at origin so rotation looks nice
  const hw = (mapW * tileSize) / 2;
  const hh = (mapH * tileSize) / 2;

  const corners3D: [number, number, number][] = [
    [-hw, -hh, zPos],
    [hw, -hh, zPos],
    [hw, hh, zPos],
    [-hw, hh, zPos],
  ];

  const pts = corners3D.map(([x, y, z]) => project(x, y, z, cam, cx, cy));

  // Fill face
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = layerColor(colorIndex, 0.18);
  ctx.fill();

  // Border
  ctx.strokeStyle = layerColor(colorIndex, 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw tile grid lines (every tile) — very faint
  ctx.strokeStyle = layerColor(colorIndex, 0.08);
  ctx.lineWidth = 0.5;

  for (let gx = 0; gx <= mapW; gx++) {
    const wx = -hw + gx * tileSize;
    const top = project(wx, -hh, zPos, cam, cx, cy);
    const bot = project(wx, hh, zPos, cam, cx, cy);
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(bot[0], bot[1]);
    ctx.stroke();
  }
  for (let gy = 0; gy <= mapH; gy++) {
    const wy = -hh + gy * tileSize;
    const left = project(-hw, wy, zPos, cam, cx, cy);
    const right = project(hw, wy, zPos, cam, cx, cy);
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.stroke();
  }

  // Label — positioned at the top-left corner of the plane
  const labelPt = project(-hw - 4, -hh, zPos, cam, cx, cy);
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = layerColor(colorIndex, 1);
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(layer.name, labelPt[0], labelPt[1] + 4);
  ctx.restore();
}

// ─── Draw vertical connectors (thin lines at corners) ─────────────────────────

function drawVerticalConnectors(
  ctx: CanvasRenderingContext2D,
  layers: { layer: Layer; zPos: number; colorIndex: number }[],
  mapW: number,
  mapH: number,
  cam: Camera,
  cx: number,
  cy: number,
  tileSize: number,
) {
  if (layers.length < 2) return;
  const hw = (mapW * tileSize) / 2;
  const hh = (mapH * tileSize) / 2;
  const corners2D: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  const minZ = layers[0].zPos;
  const maxZ = layers[layers.length - 1].zPos;

  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';

  for (const [cx2D, cy2D] of corners2D) {
    const top = project(cx2D, cy2D, maxZ, cam, cx, cy);
    const bot = project(cx2D, cy2D, minZ, cam, cx, cy);
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(bot[0], bot[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ─── Render loop ───────────────────────────────────────────────────────────────

function render(
  canvas: HTMLCanvasElement,
  layers: Layer[],
  mapW: number,
  mapH: number,
  tileSize: number,
  cam: Camera,
  layerGap: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  // canvas.width/height are physical pixels; divide by dpr to get logical (CSS) pixels
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  if (width === 0 || height === 0) return;

  // Reset transform to identity then scale once for DPR
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, width, height);

  // Only show visual + terrain layers (data layers have no visual representation)
  const visibleLayers = layers
    .filter((l) => l.kind === 'visual' || l.kind === 'terrain')
    .sort((a, b) => a.zOrder - b.zOrder);

  if (visibleLayers.length === 0) {
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('No visual or terrain layers to display', width / 2, height / 2);
    return;
  }

  const cx = width / 2;
  const cy = height / 2;

  // Distribute layers evenly along Z based on their zOrder
  const zMin = visibleLayers[0].zOrder;
  const zMax = visibleLayers[visibleLayers.length - 1].zOrder;
  const zRange = zMax - zMin || 1;

  const layerEntries = visibleLayers.map((layer, i) => ({
    layer,
    zPos: -((layer.zOrder - zMin) / zRange) * (visibleLayers.length - 1) * layerGap,
    colorIndex: i,
  }));

  // Draw back-to-front so closer layers paint on top
  // In our coordinate system, more negative zPos = further away (higher layers are further)
  const sorted = [...layerEntries].sort((a, b) => a.zPos - b.zPos);

  drawVerticalConnectors(ctx, sorted, mapW, mapH, cam, cx, cy, tileSize);

  for (const entry of sorted) {
    drawLayerPlane(
      ctx,
      entry.layer,
      entry.colorIndex,
      mapW,
      mapH,
      entry.zPos,
      cam,
      cx,
      cy,
      tileSize,
    );
  }

  // HUD — controls hint
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'left';
  ctx.fillText('Drag to orbit  •  Scroll to zoom  •  Right-drag to pan', 12, height - 12);
}

// ─── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_CAM: Camera = { rotX: 0.55, rotY: 0.4, zoom: 1, panX: 0, panY: 0 };

export const Map3DLayerView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ ...DEFAULT_CAM });
  const dragRef = useRef<{
    type: 'orbit' | 'pan';
    startX: number;
    startY: number;
    camSnap: Camera;
  } | null>(null);

  const currentMap = useEditorStore((state) => state.currentMap);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);

  const [layerGap, setLayerGap] = useState(60);

  // Layers and dimensions live on the map itself; resolveMapContext only gives metadata overrides
  const layers = currentMap?.layers ?? [];
  const mapW = currentMap?.width ?? 0;
  const mapH = currentMap?.height ?? 0;

  // draw() reads canvas dimensions at call time — always up to date
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentMap) return;
    render(canvas, layers, mapW, mapH, projectTileSize, camRef.current, layerGap);
  }, [currentMap, layers, mapW, mapH, projectTileSize, layerGap]);

  // Keep a stable ref so the ResizeObserver can call the latest draw without re-subscribing
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Resize observer — sets canvas backing-store size then immediately redraws
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Size the backing store to physical pixels; CSS size is set by the element itself
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        drawRef.current();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Redraw whenever data / camera-related state changes (but NOT on every mouse move — that calls draw() directly)
  useEffect(() => {
    draw();
  }, [draw]);

  // ── Mouse controls ────────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      type: e.button === 2 ? 'pan' : 'orbit',
      startX: e.clientX,
      startY: e.clientY,
      camSnap: { ...camRef.current },
    };
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.type === 'orbit') {
        camRef.current = {
          ...drag.camSnap,
          rotY: drag.camSnap.rotY + dx * 0.008,
          rotX: Math.max(0.05, Math.min(Math.PI / 2 - 0.05, drag.camSnap.rotX + dy * 0.008)),
        };
      } else {
        camRef.current = {
          ...drag.camSnap,
          panX: drag.camSnap.panX + dx,
          panY: drag.camSnap.panY + dy,
        };
      }
      draw();
    },
    [draw],
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      camRef.current = {
        ...camRef.current,
        zoom: Math.max(0.1, Math.min(10, camRef.current.zoom * factor)),
      };
      draw();
    },
    [draw],
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Keyboard reset ────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        camRef.current = { ...DEFAULT_CAM };
        drawRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Layer legend ──────────────────────────────────────────────────────────────

  const visibleLayers = layers
    .filter((l) => l.kind === 'visual' || l.kind === 'terrain')
    .sort((a, b) => a.zOrder - b.zOrder);

  return (
    <Box w="full" h="full" position="relative" overflow="hidden" bg="#0a0a0b">
      {/* Canvas */}
      <Box ref={containerRef} w="full" h="full">
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        />
      </Box>

      {/* Controls panel (top-right) */}
      <Box
        position="absolute"
        top={3}
        right={3}
        bg="blackAlpha.700"
        borderRadius="lg"
        border="1px solid"
        borderColor="whiteAlpha.100"
        p={3}
        minW="160px"
        backdropFilter="blur(4px)"
      >
        <VStack spacing={3} align="stretch">
          {/* Layer gap slider */}
          <Box>
            <HStack justify="space-between" mb={1}>
              <Text
                fontSize="9px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.500"
              >
                Layer Gap
              </Text>
              <Text fontSize="9px" color="gray.400">
                {layerGap}
              </Text>
            </HStack>
            <Slider
              min={10}
              max={200}
              step={5}
              value={layerGap}
              onChange={(v) => setLayerGap(v)}
              size="sm"
            >
              <SliderTrack bg="gray.700">
                <SliderFilledTrack bg="blue.500" />
              </SliderTrack>
              <SliderThumb boxSize={3} bg="blue.400" />
            </Slider>
          </Box>

          {/* Layer legend */}
          {visibleLayers.length > 0 && (
            <VStack spacing={1} align="stretch">
              <Text
                fontSize="9px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.500"
                mb={0.5}
              >
                Layers
              </Text>
              {visibleLayers.map((layer, i) => (
                <HStack key={layer.id} spacing={2}>
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="2px"
                    flexShrink={0}
                    style={{ background: layerColor(i, 0.9) }}
                  />
                  <Tooltip label={`zOrder: ${layer.zOrder}`} fontSize="xs" placement="left">
                    <Text
                      fontSize="10px"
                      color="gray.300"
                      noOfLines={1}
                      title={layer.name}
                      cursor="default"
                    >
                      {layer.name}
                    </Text>
                  </Tooltip>
                </HStack>
              ))}
            </VStack>
          )}

          <Text fontSize="9px" color="gray.600" textAlign="center">
            R to reset view
          </Text>
        </VStack>
      </Box>
    </Box>
  );
};

export default Map3DLayerView;
