import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { useMapRenderer } from './useMapRenderer';
import { useMapTools } from './useMapTools';
import { ZoomControls } from '../../common/ZoomControls';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';

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
    const mapId = useEditorStore(state => state.currentMap?.id);
    const mapWidth = useEditorStore(state => state.currentMap?.width);
    const mapHeight = useEditorStore(state => state.currentMap?.height);
    const activeVariationId = useEditorStore(state => state.activeVariationId);
    const activeTool = useEditorStore(state => state.activeTool);

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

        const worldWidth = mapWidth * DEFAULT_TILE_SIZE;
        const worldHeight = mapHeight * DEFAULT_TILE_SIZE;

        try {
            const newViewport = new Viewport({
                screenWidth: app.screen.width,
                screenHeight: app.screen.height,
                worldWidth,
                worldHeight,
                events: app.renderer.events
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
    }, [mapId, mapWidth, mapHeight, appInitialized]);

    // Use rendering and tools hooks
    const { renderTiles, renderEntities, renderGrid, renderHover, renderPreview } = useMapRenderer({ viewport });
    useMapTools({ viewport });

    // Subscribe to store changes for rendering
    useEffect(() => {
        if (!isReady) return;

        // Initial render
        renderTiles();
        renderEntities();
        renderGrid();
        renderHover();
        renderPreview();

        // Subscribe to relevant state changes
        const unsubscribe = useEditorStore.subscribe((state, prevState) => {
            // Re-render tiles when map data or variation changes
            if (state.currentMap !== prevState.currentMap || state.activeVariationId !== prevState.activeVariationId) {
                renderTiles();
                renderEntities();
                renderGrid();
            }
            // Re-render entities when selection changes
            if (state.selectedEntityId !== prevState.selectedEntityId) {
                renderEntities();
            }
            // Re-render hover on hover change
            if (state.hoveredTile !== prevState.hoveredTile) {
                renderHover();
                renderPreview();
            }
            // Re-render preview on tool/tile selection/brush size/draw mode change
            if (state.activeTool !== prevState.activeTool || 
                state.selectedTileIndex !== prevState.selectedTileIndex ||
                state.selectedTileIndices !== prevState.selectedTileIndices ||
                state.drawPreview !== prevState.drawPreview ||
                state.brushSize !== prevState.brushSize ||
                state.drawMode !== prevState.drawMode) {
                renderPreview();
            }
        });

        return unsubscribe;
    }, [isReady, renderTiles, renderEntities, renderGrid, renderHover, renderPreview]);

    // Re-render grid when viewport zoom changes
    useEffect(() => {
        if (!isReady) return;
        renderGrid();
    }, [isReady, zoomLevel, renderGrid]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

            // Tool shortcuts
            if (e.key === 'v' || e.key === 'V') useEditorStore.getState().setActiveTool('select');
            if (e.key === 'b' || e.key === 'B') useEditorStore.getState().setActiveTool('stamp');
            if (e.key === 'r' || e.key === 'R') useEditorStore.getState().setActiveTool('random');
            if (e.key === 'e' || e.key === 'E') useEditorStore.getState().setActiveTool('erase');
            if (e.key === 'g' || e.key === 'G') useEditorStore.getState().setDrawMode('flood'); // G for flood fill shape
            if (e.key === 'n' || e.key === 'N') useEditorStore.getState().setActiveTool('entityPlace');
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
            viewport.moveCenter(
                (mapWidth * DEFAULT_TILE_SIZE) / 2,
                (mapHeight * DEFAULT_TILE_SIZE) / 2
            );
            setZoomLevel(1.5);
        }
    }, [viewport, mapWidth, mapHeight]);

    // Cursor based on tool
    const getCursor = () => {
        if (activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase') {
            return 'crosshair';
        }
        return 'default';
    };

    return (
        <Box w="full" h="full" position="relative" overflow="hidden">
            <Box
                ref={containerRef}
                w="full"
                h="full"
                cursor={getCursor()}
            />

            <ZoomControls
                zoomPercent={zoomLevel * 100}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onReset={handleZoomReset}
            />

            <Box position="absolute" top="4" left="4" bg="blackAlpha.700" px={3} py={1} rounded="full" pointerEvents="none">
                <Text color="gray.400" fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest">
                    Variation: <Text as="span" color="blue.400">{activeVariationId || 'BASE'}</Text>
                </Text>
            </Box>
        </Box>
    );
};
