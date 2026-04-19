/**
 * Map3DLayerView — Three.js based 3D layer stack visualiser.
 *
 * Each visual/terrain layer is baked into an offscreen Canvas texture,
 * then displayed as a flat PlaneGeometry mesh stacked along the Y axis.
 *
 * Controls:
 *   Left-drag   — orbit (OrbitControls-style)
 *   Scroll      — zoom
 *   Right-drag  — pan
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Box,
  HStack,
  IconButton,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { EDITOR_CANVAS_HEX } from '../../../lib/editorColors';
import type { Layer } from '../../../types/schema';
import { bakeLayerCanvas, configurePixelArtTexture, getRenderableMapLayers } from './mapThreeUtils';

// ─── Layer colour palette (for the legend + wireframe tint) ───────────────────

const LAYER_COLORS_HEX = [
  0x3b82f6, 0x22c55e, 0xf59e0b, 0xef4444, 0xa855f7, 0x06b6d4, 0xf97316, 0xec4899, 0x14b8a6,
  0x84cc16,
];

const LAYER_COLORS_CSS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#84cc16',
];

// ─── Three.js scene helpers ────────────────────────────────────────────────────

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // Orbit state
  isDragging: boolean;
  dragButton: number;
  lastX: number;
  lastY: number;
  spherical: { theta: number; phi: number; radius: number };
  target: THREE.Vector3;
  rafId: number;
}

function createScene(canvas: HTMLCanvasElement, w: number, h: number): SceneState {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);
  renderer.setClearColor(EDITOR_CANVAS_HEX);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(EDITOR_CANVAS_HEX, 800, 2000);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 3000);

  return {
    renderer,
    scene,
    camera,
    isDragging: false,
    dragButton: -1,
    lastX: 0,
    lastY: 0,
    spherical: { theta: 0.5, phi: 1.0, radius: 400 },
    target: new THREE.Vector3(0, 0, 0),
    rafId: 0,
  };
}

function updateCamera(state: SceneState) {
  const { theta, phi, radius } = state.spherical;
  const sinPhi = Math.sin(phi);
  state.camera.position.set(
    state.target.x + radius * sinPhi * Math.sin(theta),
    state.target.y + radius * Math.cos(phi),
    state.target.z + radius * sinPhi * Math.cos(theta),
  );
  state.camera.lookAt(state.target);
}

// ─── Build / rebuild Three scene meshes ───────────────────────────────────────

function buildLayerMeshes(
  scene: THREE.Scene,
  layers: Layer[],
  mapW: number,
  mapH: number,
  tileSize: number,
  layerGap: number,
  currentMap: NonNullable<ReturnType<typeof useEditorStore.getState>['currentMap']>,
  tilesets: ReturnType<typeof useEditorStore.getState>['tilesets'],
  loadedSprites: ReturnType<typeof useEditorStore.getState>['loadedSprites'],
  activeVariationId: string | null,
): THREE.Mesh[] {
  const visibleLayers = getRenderableMapLayers(layers);

  const pw = mapW * tileSize;
  const ph = mapH * tileSize;

  const meshes: THREE.Mesh[] = [];

  visibleLayers.forEach((layer, i) => {
    const yPos = i * layerGap;

    // Bake tile canvas → Three.js texture
    const baked = bakeLayerCanvas(
      layer,
      mapW,
      mapH,
      tileSize,
      currentMap,
      tilesets,
      loadedSprites,
      activeVariationId,
    );
    const tex = baked ? new THREE.CanvasTexture(baked) : null;
    if (tex) {
      configurePixelArtTexture(tex);
    }

    // Plane mesh — PlaneGeometry is in XZ by default, rotate to lie flat (XY in world space = horizontal)
    const geo = new THREE.PlaneGeometry(pw, ph);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : LAYER_COLORS_HEX[i % LAYER_COLORS_HEX.length],
      transparent: true,
      opacity: tex ? 1.0 : 0.3,
      alphaTest: 0.01, // discard fully-transparent pixels so they don't occlude lower layers
      depthWrite: false, // transparent planes must not write to depth buffer
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    // PlaneGeometry faces +Z; rotate so it faces up (+Y)
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, yPos, 0);
    scene.add(mesh);
    meshes.push(mesh);

    // Thin border wireframe
    const borderGeo = new THREE.EdgesGeometry(geo);
    const borderMat = new THREE.LineBasicMaterial({
      color: LAYER_COLORS_HEX[i % LAYER_COLORS_HEX.length],
      transparent: true,
      opacity: 0.6,
    });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    mesh.add(border);

    // Vertical dashed connector lines at all 4 corners (if not first layer)
    if (i > 0) {
      const hx = pw / 2;
      const hz = ph / 2;
      const corners: [number, number][] = [
        [-hx, -hz],
        [hx, -hz],
        [hx, hz],
        [-hx, hz],
      ];
      for (const [cx, cz] of corners) {
        const points = [new THREE.Vector3(cx, yPos, cz), new THREE.Vector3(cx, 0, cz)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x222233,
          transparent: true,
          opacity: 0.5,
        });
        scene.add(new THREE.Line(lineGeo, lineMat));
      }
    }
  });

  return meshes;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const Map3DLayerView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const tilesets = useEditorStore((state) => state.tilesets);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);

  const [layerGap, setLayerGap] = useState(40);

  const layers = currentMap?.layers ?? [];
  const mapW = currentMap?.width ?? 0;
  const mapH = currentMap?.height ?? 0;

  // ── Init / teardown Three scene ───────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { clientWidth: w, clientHeight: h } = container;
    const state = createScene(canvas, w || 800, h || 600);
    sceneRef.current = state;

    // Initial camera position centred over the layer stack
    updateCamera(state);

    // Render loop
    const loop = () => {
      state.rafId = requestAnimationFrame(loop);
      state.renderer.render(state.scene, state.camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(state.rafId);
      state.renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── Resize handling ───────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      const state = sceneRef.current;
      if (!state) return;
      const { clientWidth: w, clientHeight: h } = container;
      state.renderer.setSize(w, h, false);
      state.camera.aspect = w / h;
      state.camera.updateProjectionMatrix();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Rebuild meshes when map data / gap changes ────────────────────────────────

  useEffect(() => {
    const state = sceneRef.current;
    if (!state || !currentMap) return;

    // Dispose old meshes
    for (const mesh of meshesRef.current) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      state.scene.remove(mesh);
    }
    // Remove all connector lines too
    const toRemove = state.scene.children.filter(
      (c) => c instanceof THREE.Line || c instanceof THREE.LineSegments,
    );
    for (const obj of toRemove) state.scene.remove(obj);

    meshesRef.current = buildLayerMeshes(
      state.scene,
      layers,
      mapW,
      mapH,
      projectTileSize,
      layerGap,
      currentMap,
      tilesets,
      loadedSprites,
      activeVariationId,
    );

    // Centre the camera target on the middle of the stack
    const visCount = layers.filter((l) => l.kind === 'visual' || l.kind === 'terrain').length;
    state.target.set(0, ((visCount - 1) * layerGap) / 2, 0);
    state.spherical.radius = Math.max(mapW, mapH) * projectTileSize * 0.9;
    updateCamera(state);
  }, [
    currentMap,
    layers,
    mapW,
    mapH,
    projectTileSize,
    layerGap,
    tilesets,
    loadedSprites,
    activeVariationId,
  ]);

  // ── Mouse orbit / pan / zoom ──────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const state = sceneRef.current;
    if (!state) return;
    e.preventDefault();
    state.isDragging = true;
    state.dragButton = e.button;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const state = sceneRef.current;
    if (!state?.isDragging) return;

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    if (state.dragButton === 0) {
      // Orbit
      state.spherical.theta -= dx * 0.005;
      state.spherical.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, state.spherical.phi + dy * 0.005),
      );
    } else if (state.dragButton === 2) {
      // Pan — move target in screen-parallel plane
      const panSpeed = state.spherical.radius * 0.001;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      state.camera.getWorldDirection(up);
      right.crossVectors(up, state.camera.up).normalize();
      const camUp = new THREE.Vector3().crossVectors(right, up).normalize();
      state.target.addScaledVector(right, -dx * panSpeed);
      state.target.addScaledVector(camUp, dy * panSpeed);
    }
    updateCamera(state);
  }, []);

  const onMouseUp = useCallback(() => {
    const state = sceneRef.current;
    if (state) state.isDragging = false;
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Wheel must be a native non-passive listener — React attaches passive by default,
  // which makes preventDefault() throw and also can't stop page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const state = sceneRef.current;
      if (!state) return;
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      state.spherical.radius = Math.max(10, Math.min(2000, state.spherical.radius * factor));
      updateCamera(state);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  // ── Camera reset ──────────────────────────────────────────────────────────────

  const resetCamera = useCallback(() => {
    const state = sceneRef.current;
    if (!state) return;
    const visCount = layers.filter((l) => l.kind === 'visual' || l.kind === 'terrain').length;
    state.target.set(0, ((visCount - 1) * layerGap) / 2, 0);
    state.spherical = {
      theta: 0.5,
      phi: 1.0,
      radius: Math.max(mapW, mapH) * projectTileSize * 0.9,
    };
    updateCamera(state);
  }, [layers, layerGap, mapW, mapH, projectTileSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') resetCamera();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetCamera]);

  // ── Legend data ───────────────────────────────────────────────────────────────

  const visibleLayers = getRenderableMapLayers(layers);

  return (
    <Box w="full" h="full" position="relative" overflow="hidden" bg="editorCanvasBg">
      {/* Three.js canvas — fills container */}
      <Box ref={containerRef} w="full" h="full">
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
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
            <Slider min={5} max={150} step={5} value={layerGap} onChange={setLayerGap} size="sm">
              <SliderTrack bg="gray.700">
                <SliderFilledTrack bg="blue.500" />
              </SliderTrack>
              <SliderThumb boxSize={3} bg="blue.400" />
            </Slider>
          </Box>

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
                Layers (bottom → top)
              </Text>
              {visibleLayers.map((layer, i) => (
                <HStack key={layer.id} spacing={2}>
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="2px"
                    flexShrink={0}
                    style={{ background: LAYER_COLORS_CSS[i % LAYER_COLORS_CSS.length] }}
                  />
                  <Tooltip label={`zOrder: ${layer.zOrder}`} fontSize="xs" placement="left">
                    <Text fontSize="10px" color="gray.300" noOfLines={1} cursor="default">
                      {layer.name}
                    </Text>
                  </Tooltip>
                </HStack>
              ))}
            </VStack>
          )}

          <Tooltip label="Reset camera (R)" fontSize="xs" placement="left">
            <IconButton
              aria-label="Reset camera"
              icon={<FiRefreshCw />}
              size="xs"
              variant="ghost"
              w="full"
              onClick={resetCamera}
            />
          </Tooltip>
        </VStack>
      </Box>
    </Box>
  );
};

export default Map3DLayerView;
