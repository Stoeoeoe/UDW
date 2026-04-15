import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Text, useToast } from '@chakra-ui/react';
import { Application, BitmapFont } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { useMapRenderer } from './useMapRenderer';
import { useMapTools } from './useMapTools';
import { ZoomControls } from '../../common/ZoomControls';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { Map3DLayerView } from './Map3DLayerView';

export const MapViewportPixi: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null); // Keep ref for cleanup
  const [viewport, setViewport] = useState<Viewport | null>(null); // State for React updates
  const [isReady, setIsReady] = useState(false);
  const [appInitialized, setAppInitialized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const initializingRef = useRef(false);

  // Only select the properties we need for viewport creation (not the whole map object)
  const mapId = useEditorStore((state) => state.currentMap?.id);
  const mapWidth = useEditorStore((state) => state.currentMap?.width);
  const mapHeight = useEditorStore((state) => state.currentMap?.height);
  const selectedAnchorId = useEditorStore((state) => state.selectedAnchorId);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const showCollisionOverlay = useEditorStore((state) => state.showCollisionOverlay);
  const showTerrainOverlay = useEditorStore((state) => state.showTerrainOverlay);
  const show3DLayerView = useEditorStore((state) => state.show3DLayerView);

  // Initialize Pixi Application
  useEffect(() => {
    if (!containerRef.current || initializingRef.current) return;
    initializingRef.current = true;

    const container = containerRef.current;
    let destroyed = false;

    const initApp = async () => {
      try {
        const app = new Application();
        await app.init({
          background: '#0a0a0b',
          resizeTo: container,
          antialias: false,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (destroyed) {
          app.destroy(true);
          return;
        }

        container.appendChild(app.canvas);
        appRef.current = app;

        // Pre-install crisp pixel font for entity labels
        try {
          await document.fonts.load('16px "Pixelify Sans"');
        } catch {
          // Font load failure is non-fatal; fall back to whatever is available
        }
        BitmapFont.install({
          name: 'EntityLabel',
          style: {
            fontFamily: '"Pixelify Sans", monospace',
            fontSize: 32,
            fill: 0xffffff,
          },
          resolution: 2,
        });

        setAppInitialized(true);
      } catch (e) {
        console.error('Failed to initialize Pixi:', e);
        initializingRef.current = false;
      }
    };

    initApp();

    return () => {
      destroyed = true;
      setAppInitialized(false);
      if (appRef.current) {
        try {
          appRef.current.destroy(true);
        } catch (e) {
          // Ignore destroy errors
        }
        appRef.current = null;
      }
      initializingRef.current = false;
    };
  }, []);

  // Create viewport when map ID or dimensions change (NOT on every tile paint)
  useEffect(() => {
    if (!appInitialized || !mapId || !mapWidth || !mapHeight) {
      setIsReady(false);
      return;
    }
    const app = appRef.current;
    if (!app || !app.stage) {
      setIsReady(false);
      return;
    }

    // Remove old viewport if exists
    if (viewportRef.current) {
      try {
        app.stage.removeChild(viewportRef.current);
        viewportRef.current.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
      viewportRef.current = null;
      setViewport(null);
    }

    const worldWidth = mapWidth * projectTileSize;
    const worldHeight = mapHeight * projectTileSize;

    try {
      const newViewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        worldWidth,
        worldHeight,
        events: app.renderer.events,
      });

      newViewport
        .drag({ mouseButtons: 'middle' })
        .pinch()
        .wheel()
        .decelerate({ friction: 0.95 })
        .clampZoom({ minScale: 0.25, maxScale: 8 });

      // Center on load
      newViewport.moveCenter(worldWidth / 2, worldHeight / 2);
      newViewport.setZoom(1.5);
      setZoomLevel(1.5);

      // Track zoom changes
      newViewport.on('zoomed', () => {
        setZoomLevel(newViewport.scale.x);
      });

      app.stage.addChild(newViewport);
      viewportRef.current = newViewport; // Store ref for cleanup
      setViewport(newViewport); // Trigger React update
      setIsReady(true);
    } catch (e) {
      console.error('Failed to create viewport:', e);
      setIsReady(false);
    }

    // Handle resize - use ref since this is inside the effect
    const handleResize = () => {
      const vp = viewportRef.current;
      const application = appRef.current;
      if (vp && application && application.screen) {
        vp.resize(application.screen.width, application.screen.height);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mapId, mapWidth, mapHeight, appInitialized, projectTileSize]);

  // Use rendering and tools hooks
  const {
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderLocationLinks,
    renderHover,
    renderPreview,
  } = useMapRenderer({ viewport });
  useMapTools({ viewport });

  // Subscribe to store changes for rendering
  useEffect(() => {
    if (!isReady) return;

    // Initial render
    renderTiles();
    renderEntities();
    renderGrid();
    renderCollisionOverlay();
    renderTerrainOverlay();
    renderLocationLinks();
    renderHover();
    renderPreview();

    // Subscribe to relevant state changes
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      const mapChanged = state.currentMap !== prevState.currentMap;
      const variationChanged = state.activeVariationId !== prevState.activeVariationId;

      if (mapChanged || variationChanged) {
        // Check which sub-parts of the map changed to avoid unnecessary redraws
        const linksChanged =
          state.currentMap?.locationLinks !== prevState.currentMap?.locationLinks;
        // Detect whether any tile layer DATA changed (not just entity positions)
        const tileDataChanged =
          variationChanged ||
          state.currentMap?.layers?.some((layer, i) => {
            const prev = prevState.currentMap?.layers?.[i];
            return layer.data !== prev?.data || layer.id !== prev?.id || layer.kind !== prev?.kind || layer.visible !== prev?.visible;
          }) ||
          state.currentMap?.layers?.length !== prevState.currentMap?.layers?.length ||
          state.currentMap?.width !== prevState.currentMap?.width ||
          state.currentMap?.height !== prevState.currentMap?.height;

        if (linksChanged && !tileDataChanged) {
          // Only links changed (e.g. link drag) — skip expensive tile/entity redraws
          renderLocationLinks();
        } else if (tileDataChanged) {
          renderTiles();
          renderEntities();
          renderGrid();
          renderCollisionOverlay();
          renderTerrainOverlay();
          renderLocationLinks();
        } else {
          // Only entities or other map data changed — skip tile/grid redraws
          renderEntities();
          renderLocationLinks();
        }
      }
      // Re-render location links when selection or other-map links change
      if (
        state.selectedLinkId !== prevState.selectedLinkId ||
        state.selectedAnchorId !== prevState.selectedAnchorId ||
        state.maps !== prevState.maps
      ) {
        renderLocationLinks();
      }
      // Re-render entities when selection changes
      if (state.selectedEntityId !== prevState.selectedEntityId) {
        renderEntities();
      }
      // Re-render collision overlay when tileset metadata changes
      if (state.tilesets !== prevState.tilesets) {
        renderCollisionOverlay();
      }
      // Re-render collision overlay when toggled
      if (state.showCollisionOverlay !== prevState.showCollisionOverlay) {
        renderCollisionOverlay();
      }
      // Re-render terrain overlay when toggled
      if (state.showTerrainOverlay !== prevState.showTerrainOverlay) {
        renderTerrainOverlay();
      }
      // Re-render hover on hover change
      if (state.hoveredTile !== prevState.hoveredTile) {
        renderHover();
        renderPreview();
        // Only re-render links when the hover enters or leaves a link trigger area
        // (avoids a full Pixi draw pass on every mouse move pixel)
        const links = state.currentMap?.locationLinks ?? [];
        const prevLinks = prevState.currentMap?.locationLinks ?? [];
        const isOverLink = (tile: { x: number; y: number } | null) =>
          tile !== null &&
          links.some((l) => {
            const px = tile.x * projectTileSize;
            const py = tile.y * projectTileSize;
            return (
              px >= l.sourcePosition[0] &&
              px < l.sourcePosition[0] + l.triggerSize[0] &&
              py >= l.sourcePosition[1] &&
              py < l.sourcePosition[1] + l.triggerSize[1]
            );
          });
        const wasOver = isOverLink(prevState.hoveredTile);
        const nowOver = isOverLink(state.hoveredTile);
        if (wasOver !== nowOver || (nowOver && links !== prevLinks)) {
          renderLocationLinks();
        }
      }
      // Re-render preview on tool/tile selection/brush size/draw mode change
      if (
        state.activeTool !== prevState.activeTool ||
        state.selectedTileIndex !== prevState.selectedTileIndex ||
        state.selectedTileIndices !== prevState.selectedTileIndices ||
        state.drawPreview !== prevState.drawPreview ||
        state.brushSize !== prevState.brushSize ||
        state.drawMode !== prevState.drawMode
      ) {
        renderPreview();
      }
    });

    return unsubscribe;
  }, [
    isReady,
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderLocationLinks,
    renderHover,
    renderPreview,
  ]);

  // Re-render grid when viewport zoom changes
  useEffect(() => {
    if (!isReady) return;
    renderGrid();
    if (showCollisionOverlay) renderCollisionOverlay();
    if (showTerrainOverlay) renderTerrainOverlay();
  }, [
    isReady,
    zoomLevel,
    showCollisionOverlay,
    showTerrainOverlay,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
  ]);

  useEffect(() => {
    if (!viewport || !mapId || !selectedAnchorId) return;
    const currentMap = useEditorStore.getState().currentMap;
    const anchor = currentMap?.spatialPrimitives?.anchors?.find(
      (item) => item.id === selectedAnchorId,
    );
    if (!anchor) return;
    viewport.moveCenter(anchor.position[0], anchor.position[1]);
  }, [viewport, mapId, selectedAnchorId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      )
        return;

      // Delete selected entity or link with Backspace or Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const {
          selectedEntityId,
          removeEntity,
          selectEntity,
          selectedLinkId,
          removeLocationLink,
          selectLink,
        } = useEditorStore.getState();
        if (selectedLinkId) {
          e.preventDefault();
          removeLocationLink(selectedLinkId);
          selectLink(null);
          return;
        }
        if (selectedEntityId) {
          e.preventDefault();
          removeEntity(selectedEntityId);
          selectEntity(null);
          return;
        }
      }

      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') useEditorStore.getState().setActiveTool('select');
      if (e.key === 'b' || e.key === 'B') useEditorStore.getState().setActiveTool('stamp');
      if (e.key === 'r' || e.key === 'R') useEditorStore.getState().setActiveTool('random');
      if (e.key === 'e' || e.key === 'E') useEditorStore.getState().setActiveTool('erase');
      if (e.key === 't' || e.key === 'T') useEditorStore.getState().setActiveTool('terrain');
      if (e.key === 'g' || e.key === 'G') useEditorStore.getState().setDrawMode('flood');
      if (e.key === 'n' || e.key === 'N') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'locationlink') {
          useEditorStore.getState().setActiveTool('linkPlace');
        } else {
          useEditorStore.getState().setActiveTool('entityPlace');
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'locationlink') {
          useEditorStore.getState().setActiveTool('linkSelect');
        } else if (layer?.kind === 'anchor') {
          useEditorStore.getState().setActiveTool('anchorSelect');
        } else {
          useEditorStore.getState().setActiveTool('entitySelect');
        }
      }
      if (e.key === 'x' || e.key === 'X') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'locationlink') {
          useEditorStore.getState().setActiveTool('linkDelete');
        } else if (layer?.kind === 'anchor') {
          useEditorStore.getState().setActiveTool('anchorDelete');
        } else {
          useEditorStore.getState().setActiveTool('entityDelete');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Zoom controls handlers
  const handleZoomIn = useCallback(() => {
    if (viewport) {
      viewport.setZoom(viewport.scale.x * 1.2, true);
      setZoomLevel(viewport.scale.x);
    }
  }, [viewport]);

  const handleZoomOut = useCallback(() => {
    if (viewport) {
      viewport.setZoom(viewport.scale.x * 0.8, true);
      setZoomLevel(viewport.scale.x);
    }
  }, [viewport]);

  const handleZoomReset = useCallback(() => {
    if (viewport && mapWidth && mapHeight) {
      viewport.setZoom(1.5, true);
      viewport.moveCenter((mapWidth * projectTileSize) / 2, (mapHeight * projectTileSize) / 2);
      setZoomLevel(1.5);
    }
  }, [viewport, mapWidth, mapHeight, projectTileSize]);

  // Cursor based on tool
  const getCursor = () => {
    if (
      activeTool === 'stamp' ||
      activeTool === 'random' ||
      activeTool === 'erase' ||
      activeTool === 'fill'
    ) {
      return 'crosshair';
    }
    return 'default';
  };

  // Detect missing tileset images referenced by the current map and navigate to tileset editor
  const tilesets = useEditorStore((s) => s.tilesets);
  const loadedSprites = useEditorStore((s) => s.loadedSprites);
  const setMode = useEditorStore((s) => s.setMode);
  const setActiveTileset = useEditorStore((s) => s.setActiveTileset);
  const toast = useToast();

  useEffect(() => {
    if (!isReady) return;
    const currentMap = useEditorStore.getState().currentMap;
    if (!currentMap) return;

    const refs = new Set<string>();
    if (Array.isArray(currentMap.tilesetRefs)) {
      for (const r of currentMap.tilesetRefs) refs.add(r);
    }
    if (currentMap.baseTilesetId) refs.add(currentMap.baseTilesetId);

    for (const tsId of refs) {
      const ts = tilesets.get(tsId);
      if (!ts) continue;
      const sprite = loadedSprites.get(ts.spriteSheet);
      if (!sprite) {
        toast({
          title: 'Missing tileset image',
          description: `Tileset ${ts.name} is missing; opening tileset editor.`,
          status: 'warning',
          duration: 4000,
        });
        setMode('tilesets');
        setActiveTileset(tsId);
        return;
      }
    }
  }, [isReady, tilesets, loadedSprites, setMode, setActiveTileset, toast]);

  return (
    <Box w="full" h="full" position="relative" overflow="hidden">
      <Box ref={containerRef} w="full" h="full" cursor={getCursor()} />

      {show3DLayerView && (
        <Box position="absolute" inset={0} zIndex={10}>
          <Map3DLayerView />
        </Box>
      )}

      <ZoomControls
        zoomPercent={zoomLevel * 100}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleZoomReset}
      />

      <Box
        position="absolute"
        top="4"
        left="4"
        bg="blackAlpha.700"
        px={3}
        py={1}
        rounded="full"
        pointerEvents="none"
      >
        <Text
          color="gray.400"
          fontSize="10px"
          fontWeight="black"
          textTransform="uppercase"
          letterSpacing="widest"
        >
          Variation:{' '}
          <Text as="span" color="blue.400">
            {activeVariationId || 'BASE'}
          </Text>
        </Text>
      </Box>
    </Box>
  );
};
