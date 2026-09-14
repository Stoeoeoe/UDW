import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Text, useToast } from '@chakra-ui/react';
import { Application, BitmapFont } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useMapRenderer } from './useMapRenderer';
import { useMapTools } from './useMapTools';
import { ZoomControls } from '../../common/ZoomControls';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { EDITOR_CANVAS_HEX } from '../../../lib/editorColors';
import { Map3DLayerView } from './Map3DLayerView';
import { MapTestModeView } from './MapTestModeView';

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
  const camera = useEditorStore((s) => s.camera);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const showCollisionOverlay = useEditorStore((state) => state.showCollisionOverlay);
  const showTerrainOverlay = useEditorStore((state) => state.showTerrainOverlay);
  const show3DLayerView = useEditorStore((state) => state.show3DLayerView);
  const showMapTestMode = useEditorStore((state) => state.showMapTestMode);
  const initialCameraRef = useRef(camera);

  useEffect(() => {
    initialCameraRef.current = camera;
  }, [camera]);

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
          background: EDITOR_CANVAS_HEX,
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
      const oldViewport = viewportRef.current;
      if (oldViewport?.parent) {
        try {
          oldViewport.parent.removeChild(oldViewport);
        } catch {
          // Fast Refresh can already have torn down the Pixi tree.
        }
      }
      viewportRef.current = null;
      setViewport(null);
      setIsReady(false);
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

    const worldWidth = mapWidth * projectTileSize;
    const worldHeight = mapHeight * projectTileSize;
    const initialCamera = initialCameraRef.current;

    const applyCamera = (vp: Viewport) => {
      const hasSavedCamera =
        initialCamera &&
        typeof initialCamera.x === 'number' &&
        typeof initialCamera.y === 'number' &&
        (initialCamera.x !== 0 || initialCamera.y !== 0);

      try {
        vp.setZoom(
          initialCamera && typeof initialCamera.zoom === 'number' ? initialCamera.zoom : 1.5,
        );
      } catch {
        vp.setZoom(1.5);
      }

      try {
        vp.moveCenter(
          hasSavedCamera ? initialCamera.x : worldWidth / 2,
          hasSavedCamera ? initialCamera.y : worldHeight / 2,
        );
      } catch {
        vp.moveCenter(worldWidth / 2, worldHeight / 2);
      }

      setZoomLevel(vp.scale.x ?? 1.5);
    };

    // Reuse existing viewport if one already exists — avoids destroy/recreate flicker.
    // Just update the world bounds and reapply the camera for the new map.
    const existingViewport = viewportRef.current;
    const existingViewportIsReusable =
      existingViewport &&
      existingViewport.parent === app.stage &&
      !(existingViewport as { destroyed?: boolean }).destroyed;

    if (existingViewportIsReusable) {
      try {
        existingViewport.resize(app.screen.width, app.screen.height, worldWidth, worldHeight);
        applyCamera(existingViewport);
        // viewport state is unchanged so no setViewport/setIsReady flip needed
        return;
      } catch (e) {
        // Fall through to full recreate if resize fails
      }
    }

    if (existingViewport) {
      try {
        existingViewport.parent?.removeChild(existingViewport);
        if (!(existingViewport as { destroyed?: boolean }).destroyed) {
          existingViewport.destroy({ children: true });
        }
      } catch {
        // Ignore stale viewport cleanup errors and build a fresh one below.
      }
      viewportRef.current = null;
      setViewport(null);
    }

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

      applyCamera(newViewport);

      newViewport.on('zoomed', () => {
        setZoomLevel(newViewport.scale.x);
        requestAnimationFrame(() => {
          try {
            useEditorStore.getState().setCamera({
              x: newViewport.center.x,
              y: newViewport.center.y,
              zoom: newViewport.scale.x,
            });
          } catch {
            /* ignore */
          }
        });
      });

      newViewport.on('moved', () => {
        requestAnimationFrame(() => {
          try {
            useEditorStore
              .getState()
              .setCamera({ x: newViewport.center.x, y: newViewport.center.y });
          } catch {
            /* ignore */
          }
        });
      });

      app.stage.addChild(newViewport);
      viewportRef.current = newViewport;
      setViewport(newViewport);
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
    renderTriggers,
    renderCollisionShapes,
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
    renderCollisionShapes();
    renderTriggers();
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
            return (
              layer.data !== prev?.data ||
              layer.objectGroups !== prev?.objectGroups ||
              layer.objectInstances !== prev?.objectInstances ||
              layer.id !== prev?.id ||
              layer.kind !== prev?.kind ||
              layer.visible !== prev?.visible
            );
          }) ||
          state.currentMap?.layers?.length !== prevState.currentMap?.layers?.length ||
          state.currentMap?.width !== prevState.currentMap?.width ||
          state.currentMap?.height !== prevState.currentMap?.height;

        const triggersChanged =
          state.currentMap?.spatialPrimitives?.triggers !==
          prevState.currentMap?.spatialPrimitives?.triggers;

        const collisionsChanged =
          state.currentMap?.spatialPrimitives?.collisions !==
          prevState.currentMap?.spatialPrimitives?.collisions;

        if (linksChanged && !tileDataChanged && !triggersChanged && !collisionsChanged) {
          // Only links changed (e.g. link drag) — skip expensive tile/entity redraws
          renderLocationLinks();
        } else if (triggersChanged && !tileDataChanged && !linksChanged && !collisionsChanged) {
          renderTriggers();
        } else if (collisionsChanged && !tileDataChanged && !linksChanged && !triggersChanged) {
          renderCollisionShapes();
        } else if (tileDataChanged) {
          renderTiles();
          renderEntities();
          renderGrid();
          renderCollisionOverlay();
          renderTerrainOverlay();
          renderCollisionShapes();
          renderTriggers();
          renderLocationLinks();
        } else {
          // Only entities or other map data changed — skip tile/grid redraws
          renderEntities();
          renderCollisionShapes();
          renderTriggers();
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
      // Re-render triggers when selection changes
      if (state.selectedTriggerId !== prevState.selectedTriggerId) {
        renderTriggers();
      }
      // Re-render collision shapes when selection changes
      if (state.selectedCollisionId !== prevState.selectedCollisionId) {
        renderCollisionShapes();
      }
      // Re-render entities when selection changes
      if (state.selectedEntityId !== prevState.selectedEntityId) {
        renderEntities();
      }
      if (state.selectedObjectInstanceId !== prevState.selectedObjectInstanceId) {
        renderTiles();
      }
      // Re-render collision overlay when tileset metadata changes
      if (state.tilesets !== prevState.tilesets) {
        renderCollisionOverlay();
      }
      // Re-render collision overlay when toggled
      if (state.showCollisionOverlay !== prevState.showCollisionOverlay) {
        renderCollisionOverlay();
        renderCollisionShapes();
      }
      // Re-render terrain overlay when toggled
      if (state.showTerrainOverlay !== prevState.showTerrainOverlay) {
        renderTerrainOverlay();
      }
      // Re-render hover on hover change
      if (
        state.hoveredTile !== prevState.hoveredTile ||
        state.hoveredWorldPosition !== prevState.hoveredWorldPosition
      ) {
        renderHover();
        renderPreview();
      }
      // Re-render trigger preview while drawing a trigger
      if (
        (state.drawPreview !== prevState.drawPreview &&
          (state.activeTool === 'triggerPlace' || prevState.activeTool === 'triggerPlace')) ||
        (state.polygonPreviewPoints !== prevState.polygonPreviewPoints &&
          (state.activeTool === 'triggerPolygon' || prevState.activeTool === 'triggerPolygon'))
      ) {
        renderTriggers();
      }
      // Re-render collision shapes while drawing collision primitives
      if (
        (state.drawPreview !== prevState.drawPreview &&
          (state.activeTool === 'collisionRect' ||
            prevState.activeTool === 'collisionRect' ||
            state.activeTool === 'collisionCircle' ||
            prevState.activeTool === 'collisionCircle')) ||
        (state.polygonPreviewPoints !== prevState.polygonPreviewPoints &&
          (state.activeTool === 'collisionPolygon' ||
            prevState.activeTool === 'collisionPolygon')) ||
        (state.activeTool !== prevState.activeTool &&
          (['collisionRect', 'collisionPolygon', 'collisionCircle', 'collisionSelect'].includes(
            state.activeTool,
          ) ||
            ['collisionRect', 'collisionPolygon', 'collisionCircle', 'collisionSelect'].includes(
              prevState.activeTool,
            )))
      ) {
        renderCollisionShapes();
      }
      // Re-render preview on tool/tile selection/brush size/draw mode change
      if (
        state.activeTool !== prevState.activeTool ||
        state.activeTilesetId !== prevState.activeTilesetId ||
        state.selectedTileIndex !== prevState.selectedTileIndex ||
        state.selectedTileIndices !== prevState.selectedTileIndices ||
        state.selectedObjectDefinitionId !== prevState.selectedObjectDefinitionId ||
        state.drawPreview !== prevState.drawPreview ||
        state.brushSize !== prevState.brushSize ||
        state.drawMode !== prevState.drawMode
      ) {
        renderPreview();
      }
      // Re-render triggers when entering/leaving linkPlace (drives the link-source highlight)
      if (
        state.activeTool !== prevState.activeTool &&
        (state.activeTool === 'linkPlace' || prevState.activeTool === 'linkPlace')
      ) {
        renderTriggers();
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
    renderCollisionShapes,
    renderTriggers,
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
    if (!isReady || !viewport || !mapId || !selectedAnchorId) return;
    const currentMap = useEditorStore.getState().currentMap;
    const anchor = currentMap?.spatialPrimitives?.anchors?.find(
      (item) => item.id === selectedAnchorId,
    );
    if (!anchor) return;
    try {
      viewport.moveCenter(anchor.position[0], anchor.position[1]);
    } catch {
      // Viewport may still be initializing after a map load — ignore and let a later render center it.
    }
  }, [isReady, viewport, mapId, selectedAnchorId]);

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

      if (useEditorStore.getState().showMapTestMode) {
        return;
      }

      // Delete selected anchor, entity, link, or trigger with Backspace or Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const {
          selectedEntityId,
          removeEntity,
          selectEntity,
          selectedObjectInstanceId,
          removeObjectInstance,
          selectObjectInstance,
          selectedLinkId,
          removeLocationLink,
          selectLink,
          selectedTriggerId,
          removeTrigger,
          selectTrigger,
          selectedCollisionId,
          removeCollision,
          selectCollision,
          selectedAnchorId: anchorId,
          removeAnchor,
          selectAnchor,
        } = useEditorStore.getState();
        if (selectedCollisionId) {
          e.preventDefault();
          removeCollision(selectedCollisionId);
          selectCollision(null);
          return;
        }
        if (selectedTriggerId) {
          e.preventDefault();
          removeTrigger(selectedTriggerId);
          selectTrigger(null);
          return;
        }
        if (selectedLinkId) {
          e.preventDefault();
          removeLocationLink(selectedLinkId);
          selectLink(null);
          return;
        }
        if (anchorId) {
          e.preventDefault();
          removeAnchor(anchorId);
          selectAnchor(null);
          return;
        }
        if (selectedEntityId) {
          e.preventDefault();
          removeEntity(selectedEntityId);
          selectEntity(null);
          return;
        }
        const { selectedLayerId } = useEditorStore.getState();
        if (selectedObjectInstanceId && selectedLayerId) {
          e.preventDefault();
          removeObjectInstance(selectedLayerId, selectedObjectInstanceId);
          selectObjectInstance(null);
          return;
        }
      }

      // Escape cancels polygon pen drawing
      if (e.key === 'Escape') {
        const { activeTool, setPolygonPreviewPoints } = useEditorStore.getState();
        if (activeTool === 'triggerPolygon') {
          setPolygonPreviewPoints(null);
          useEditorStore.getState().setActiveTool('select');
          e.preventDefault();
          return;
        }
        if (activeTool === 'collisionPolygon') {
          setPolygonPreviewPoints(null);
          useEditorStore.getState().setActiveTool('collisionSelect');
          e.preventDefault();
          return;
        }
      }

      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') useEditorStore.getState().setActiveTool('select');
      if (e.key === 'b' || e.key === 'B') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'object') {
          useEditorStore.getState().setActiveTool('objectPlace');
        } else {
          useEditorStore.getState().setActiveTool('stamp');
        }
      }
      if (e.key === 'r' || e.key === 'R') useEditorStore.getState().setActiveTool('random');
      if (e.key === 'e' || e.key === 'E') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (!(layer?.kind === 'object')) {
          useEditorStore.getState().setActiveTool('erase');
        }
      }
      if (e.key === 't' || e.key === 'T') useEditorStore.getState().setActiveTool('terrain');
      if (e.key === 'g' || e.key === 'G') useEditorStore.getState().setDrawMode('flood');
      if (e.key === 'n' || e.key === 'N') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'navigation') {
          useEditorStore.getState().setActiveTool('linkPlace');
        } else if (layer?.kind === 'object') {
          useEditorStore.getState().setActiveTool('objectPlace');
        } else {
          useEditorStore.getState().setActiveTool('entityPlace');
        }
      }
      if (e.key === 'a' || e.key === 'A') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'navigation') {
          useEditorStore.getState().setActiveTool('anchorPlace');
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'navigation') {
          useEditorStore.getState().setActiveTool('select');
        } else if (layer?.kind === 'object') {
          useEditorStore.getState().setActiveTool('objectSelect');
        } else {
          useEditorStore.getState().setActiveTool('entitySelect');
        }
      }
      if (e.key === 'x' || e.key === 'X') {
        const { selectedLayerId, currentMap: cm } = useEditorStore.getState();
        const layer = cm?.layers.find((l) => l.id === selectedLayerId);
        if (layer?.kind === 'object') {
          useEditorStore.getState().setActiveTool('objectDelete');
        } else if (layer?.kind !== 'navigation') {
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
    if (showMapTestMode) {
      return 'default';
    }
    if (
      activeTool === 'stamp' ||
      activeTool === 'random' ||
      activeTool === 'erase' ||
      activeTool === 'fill' ||
      activeTool === 'objectPlace' ||
      activeTool === 'triggerPolygon' ||
      activeTool === 'triggerPlace' ||
      activeTool === 'collisionPolygon' ||
      activeTool === 'collisionRect' ||
      activeTool === 'collisionCircle'
    ) {
      return 'crosshair';
    }
    if (activeTool === 'objectSelect') {
      return 'default';
    }
    return 'default';
  };

  // Detect missing tileset images referenced by the current map and navigate to tileset editor
  const tilesets = useEditorStore((s) => s.tilesets);
  const loadedSprites = useEditorStore((s) => s.loadedSprites);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
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
        openDocument({
          kind: 'tileset',
          tilesetId: tsId,
          label: ts.name,
          saveUnitId: `tileset:${tsId}`,
        });
        return;
      }
    }
  }, [isReady, tilesets, loadedSprites, openDocument, toast]);

  return (
    <Box w="full" h="full" position="relative" overflow="hidden" bg="editorCanvasBg">
      <Box
        ref={containerRef}
        w="full"
        h="full"
        cursor={getCursor()}
        opacity={isReady ? 1 : 0}
        //transition="opacity 0.08s ease-in"
      />

      {show3DLayerView && (
        <Box position="absolute" inset={0} zIndex={10}>
          <Map3DLayerView />
        </Box>
      )}

      {showMapTestMode && (
        <Box position="absolute" inset={0} zIndex={10}>
          <MapTestModeView />
        </Box>
      )}

      {!showMapTestMode && (
        <ZoomControls
          zoomPercent={zoomLevel * 100}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleZoomReset}
        />
      )}

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
