import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, HStack, IconButton, Text, Tooltip, Kbd, Button } from '@chakra-ui/react';
import { AddIcon, MinusIcon, RepeatIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';

export const MapViewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const camera = useEditorStore(state => state.camera);
    const setCamera = useEditorStore(state => state.setCamera);
    const resetCamera = useEditorStore(state => state.resetCamera);
    const currentMap = useEditorStore(state => state.currentMap);

    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Constrain logic
    const getConstrainedPos = useCallback((x: number, y: number, currentZoom: number) => {
        if (!currentMap) return { x, y };

        const canvas = canvasRef.current;
        if (!canvas) return { x, y };

        const mapW = currentMap.width * 16;
        const mapH = currentMap.height * 16;

        // Viewport dimensions in world-space at current zoom
        const viewW = canvas.width / currentZoom;
        const viewH = canvas.height / currentZoom;

        // Constraint: Keep map at least partially on screen
        const limitX = Math.max(mapW, viewW * 0.4);
        const limitY = Math.max(mapH, viewH * 0.4);

        return {
            x: Math.min(Math.max(x, -limitX / 2), limitX * 1.5),
            y: Math.min(Math.max(y, -limitY / 2), limitY * 1.5)
        };
    }, [currentMap]);

    // Zoom and Pan constraints
    const applyZoom = useCallback((newZoom: number, focusX: number, focusY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const finalZoom = Math.min(Math.max(newZoom, 0.1), 10);

        const worldX = (focusX - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (focusY - canvas.height / 2) / camera.zoom + camera.y;

        const newCamX = worldX - (focusX - canvas.width / 2) / finalZoom;
        const newCamY = worldY - (focusY - canvas.height / 2) / finalZoom;

        const constrained = getConstrainedPos(newCamX, newCamY, finalZoom);

        setCamera({
            zoom: finalZoom,
            x: constrained.x,
            y: constrained.y
        });
    }, [camera, setCamera, getConstrainedPos]);

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomSpeed = 0.002;
        const delta = -e.deltaY;
        const factor = Math.exp(delta * zoomSpeed);

        applyZoom(camera.zoom * factor, mouseX, mouseY);
    }, [camera.zoom, applyZoom]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isPanning) return;

        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const currentCamera = useEditorStore.getState().camera;

        const rawNextX = currentCamera.x - dx / currentCamera.zoom;
        const rawNextY = currentCamera.y - dy / currentCamera.zoom;
        const constrained = getConstrainedPos(rawNextX, rawNextY, currentCamera.zoom);

        setCamera({
            x: constrained.x,
            y: constrained.y
        });

        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }, [isPanning, setCamera, getConstrainedPos]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleWheel, handleMouseMove, handleMouseUp]);

    // Pure Render Logic
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        ctx.fillStyle = '#171923';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw World Origin
        ctx.beginPath();
        ctx.moveTo(0, -20); ctx.lineTo(0, 20);
        ctx.moveTo(-20, 0); ctx.lineTo(20, 0);
        ctx.strokeStyle = '#3182ce';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.stroke();

        if (currentMap) {
            const pixelWidth = currentMap.width * 16;
            const pixelHeight = currentMap.height * 16;

            ctx.strokeStyle = '#2d3748';
            ctx.lineWidth = 0.5 / camera.zoom;
            ctx.beginPath();
            for (let x = 0; x <= pixelWidth; x += 16) {
                ctx.moveTo(x, 0); ctx.lineTo(x, pixelHeight);
            }
            for (let y = 0; y <= pixelHeight; y += 16) {
                ctx.moveTo(0, y); ctx.lineTo(pixelWidth, y);
            }
            ctx.stroke();

            const state = useEditorStore.getState();
            [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder).forEach(layer => {
                if (!layer.visible || layer.kind !== 'visual') return;
                layer.data.forEach((row, rowIndex) => {
                    row.forEach((tileRef, x) => {
                        if (!tileRef || typeof tileRef !== 'string') return;
                        const parts = tileRef.split(':');
                        if (parts.length !== 2) return;
                        const tileset = state.tilesets.get(parts[0]);
                        const sprite = state.loadedSprites.get(tileset?.spriteSheet || '');
                        if (tileset && sprite) {
                            const tileIndex = parseInt(parts[1]);
                            const sx = (tileIndex % tileset.columns) * tileset.tileWidth;
                            const sy = Math.floor(tileIndex / tileset.columns) * tileset.tileHeight;
                            ctx.drawImage(sprite, sx, sy, tileset.tileWidth, tileset.tileHeight, x * 16, rowIndex * 16, 16, 16);
                        }
                    });
                });
            });

            ctx.strokeStyle = '#4A5568';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(0, 0, pixelWidth, pixelHeight);
        }

        ctx.restore();
    }, [camera, currentMap]);

    return (
        <Box w="full" h="full" position="relative" overflow="hidden">
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                style={{
                    display: 'block',
                    touchAction: 'none',
                    cursor: isPanning ? 'grabbing' : (currentMap ? 'default' : 'wait')
                }}
            />

            <HStack position="absolute" bottom="4" left="4" bg="gray.800" p={1} rounded="lg" border="1px" borderColor="gray.700" spacing={1}>
                <IconButton aria-label="Zoom Out" icon={<MinusIcon />} size="xs" variant="ghost" onClick={() => applyZoom(camera.zoom * 0.8, canvasRef.current!.width / 2, canvasRef.current!.height / 2)} />
                <Button size="xs" variant="ghost" px={2} onClick={resetCamera} fontSize="xs" color="gray.300">
                    {Math.round(camera.zoom * 100)}%
                </Button>
                <IconButton aria-label="Zoom In" icon={<AddIcon />} size="xs" variant="ghost" onClick={() => applyZoom(camera.zoom * 1.2, canvasRef.current!.width / 2, canvasRef.current!.height / 2)} />
                <Box w="1px" h="4" bg="gray.700" mx={1} />
                <IconButton aria-label="Home" icon={<RepeatIcon />} size="xs" variant="ghost" onClick={resetCamera} />
            </HStack>
        </Box>
    );
};
