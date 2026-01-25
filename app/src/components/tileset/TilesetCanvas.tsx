import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, HStack, IconButton, Text, Tooltip, Kbd, Button } from '@chakra-ui/react';
import { AddIcon, MinusIcon, RepeatIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';

interface TilesetCanvasProps {
    tileset: Tileset;
    selectedIndex: number | null;
    onSelect: (index: number) => void;
}

export const TilesetCanvas: React.FC<TilesetCanvasProps> = ({ tileset, selectedIndex, onSelect }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loadedSprites = useEditorStore(state => state.loadedSprites);
    const sprite = loadedSprites.get(tileset.spriteSheet);

    // Zoom and Camera State
    const [zoom, setZoom] = useState(1.0);
    const [camera, setCamera] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Constrain logic
    const getConstrainedPos = useCallback((x: number, y: number, currentZoom: number) => {
        if (!sprite) return { x, y };

        // We want to allow the user to pan, but keep the sprite within reach.
        // A good rule: The sprite cannot be panned entirely off-screen.
        // Or even tighter: Keep the sprite roughly centered if it's smaller than viewport.

        const canvas = canvasRef.current;
        if (!canvas) return { x, y };

        // World-space bounds of the sprite
        const halfW = sprite.width / 2;
        const halfH = sprite.height / 2;

        // Viewport dimensions in world-space at current zoom
        const viewW = canvas.width / currentZoom;
        const viewH = canvas.height / currentZoom;

        // Limit the camera (which is the world-space point at the center of the viewport)
        // If we allow the center of the camera to move up to the edges of the sprite:
        const limitX = Math.max(halfW, viewW * 0.4);
        const limitY = Math.max(halfH, viewH * 0.4);

        return {
            x: Math.min(Math.max(x, -limitX), limitX),
            y: Math.min(Math.max(y, -limitY), limitY)
        };
    }, [sprite]);

    const applyZoom = useCallback((newZoom: number, focusX: number, focusY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const finalZoom = Math.min(Math.max(newZoom, 0.25), 8);

        const worldX = (focusX - canvas.width / 2) / zoom + camera.x;
        const worldY = (focusY - canvas.height / 2) / zoom + camera.y;

        const rawNextCamX = worldX - (focusX - canvas.width / 2) / finalZoom;
        const rawNextCamY = worldY - (focusY - canvas.height / 2) / finalZoom;

        const constrained = getConstrainedPos(rawNextCamX, rawNextCamY, finalZoom);

        setZoom(finalZoom);
        setCamera(constrained);
    }, [zoom, camera, getConstrainedPos]);

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomSpeed = 0.0015;
        const delta = -e.deltaY;
        const factor = Math.exp(delta * zoomSpeed);

        applyZoom(zoom * factor, mouseX, mouseY);
    }, [zoom, applyZoom]);

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

        setCamera(prev => {
            const rawX = prev.x - dx / zoom;
            const rawY = prev.y - dy / zoom;
            return getConstrainedPos(rawX, rawY, zoom);
        });

        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }, [isPanning, zoom, getConstrainedPos]);

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

    // Redraw loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !sprite) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#171923'; // gray.900 background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.imageSmoothingEnabled = false;

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-camera.x, -camera.y);

        const sheetX = -sprite.width / 2;
        const sheetY = -sprite.height / 2;

        // Shadow for the spritesheet
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 20 / zoom;
        ctx.drawImage(sprite, sheetX, sheetY);
        ctx.shadowColor = 'transparent';

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        for (let x = 0; x <= sprite.width; x += tileset.tileWidth) {
            ctx.moveTo(sheetX + x, sheetY); ctx.lineTo(sheetX + x, sheetY + sprite.height);
        }
        for (let y = 0; y <= sprite.height; y += tileset.tileHeight) {
            ctx.moveTo(sheetX, sheetY + y); ctx.lineTo(sheetX + sprite.width, sheetY + y);
        }
        ctx.stroke();

        // Highlight selection
        if (selectedIndex !== null) {
            const col = selectedIndex % tileset.columns;
            const row = Math.floor(selectedIndex / tileset.columns);

            ctx.strokeStyle = '#3182ce';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(
                sheetX + col * tileset.tileWidth,
                sheetY + row * tileset.tileHeight,
                tileset.tileWidth,
                tileset.tileHeight
            );

            ctx.fillStyle = 'rgba(49, 130, 206, 0.2)';
            ctx.fillRect(
                sheetX + col * tileset.tileWidth,
                sheetY + row * tileset.tileHeight,
                tileset.tileWidth,
                tileset.tileHeight
            );
        }

        ctx.restore();
    }, [sprite, tileset, selectedIndex, zoom, camera]);

    const handleClick = (e: React.MouseEvent) => {
        if (isPanning) return;
        const canvas = canvasRef.current;
        if (!canvas || !sprite) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const sheetX = -sprite.width / 2;
        const sheetY = -sprite.height / 2;

        const worldX = (mouseX - canvas.width / 2) / zoom + camera.x;
        const worldY = (mouseY - canvas.height / 2) / zoom + camera.y;

        const tileX = worldX - sheetX;
        const tileY = worldY - sheetY;

        const col = Math.floor(tileX / tileset.tileWidth);
        const row = Math.floor(tileY / tileset.tileHeight);

        if (col >= 0 && col < tileset.columns && row >= 0 && tileY < sprite.height) {
            const index = row * tileset.columns + col;
            if (index >= 0 && index < tileset.tileCount) {
                onSelect(index);
            }
        }
    };

    const resetView = () => {
        setZoom(1.0);
        setCamera({ x: 0, y: 0 });
    };

    return (
        <Box w="full" h="full" position="relative" overflow="hidden">
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onClick={handleClick}
                style={{
                    display: 'block',
                    touchAction: 'none',
                    cursor: isPanning ? 'grabbing' : 'crosshair'
                }}
            />

            <HStack position="absolute" bottom="4" left="4" bg="gray.800" p={1} rounded="lg" border="1px" borderColor="gray.700" spacing={1}>
                <IconButton aria-label="Zoom Out" icon={<MinusIcon />} size="xs" variant="ghost" onClick={() => applyZoom(zoom * 0.8, canvasRef.current!.width / 2, canvasRef.current!.height / 2)} />
                <Button size="xs" variant="ghost" px={2} onClick={resetView} fontSize="xs" color="gray.300">
                    {Math.round(zoom * 100)}%
                </Button>
                <IconButton aria-label="Zoom In" icon={<AddIcon />} size="xs" variant="ghost" onClick={() => applyZoom(zoom * 1.2, canvasRef.current!.width / 2, canvasRef.current!.height / 2)} />
                <Box w="1px" h="4" bg="gray.700" mx={1} />
                <IconButton aria-label="Home" icon={<RepeatIcon />} size="xs" variant="ghost" onClick={resetView} />
            </HStack>
        </Box>
    );
};
