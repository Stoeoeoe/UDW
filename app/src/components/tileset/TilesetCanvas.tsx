import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, HStack, IconButton, Text, Button } from '@chakra-ui/react';
import { ZoomControls } from '../common/ZoomControls';
import { AddIcon, MinusIcon, RepeatIcon } from '@chakra-ui/icons';
import { usePanZoom } from '../../hooks/usePanZoom';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';

interface TilesetCanvasProps {
    tileset: Tileset;
    selectedIndex: number | null;
    onSelect: (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => void;
    mode?: 'interactive' | 'static';
    zoom?: number;
}

export const TilesetCanvas: React.FC<TilesetCanvasProps> = ({
    tileset,
    selectedIndex,
    onSelect,
    mode = 'interactive',
    zoom: forcedZoom
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const loadedSprites = useEditorStore(state => state.loadedSprites);
    const sprite = loadedSprites.get(tileset.spriteSheet);
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const toggleSelectedTile = useEditorStore(state => state.toggleSelectedTile);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);

    const [isSelecting, setIsSelecting] = useState(false);
    const selectionStart = useRef<{ col: number; row: number } | null>(null);
    const selectionEnd = useRef<{ col: number; row: number } | null>(null);
    const mouseMovedDuringDown = useRef(false);

    // Zoom and Camera State
    const [internalZoom, setInternalZoom] = useState(1.0);
    const [camera, setCamera] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const panZoom = usePanZoom({
        canvasRef,
        getCamera: () => ({ x: camera.x, y: camera.y, zoom: internalZoom }),
        setCamera: (c) => {
            if (typeof c.zoom === 'number') setInternalZoom(c.zoom);
            setCamera(prev => ({ x: c.x ?? prev.x, y: c.y ?? prev.y }));
        },
        contentSize: sprite ? { width: sprite.width, height: sprite.height } : null
    });

    const effectiveZoom = forcedZoom ?? internalZoom;

    // Constrain logic
    const getConstrainedPos = useCallback((x: number, y: number, currentZoom: number) => {
        if (!sprite) return { x, y };

        const canvas = canvasRef.current;
        if (!canvas) return { x, y };

        const halfW = sprite.width / 2;
        const halfH = sprite.height / 2;
        const viewW = canvas.width / currentZoom;
        const viewH = canvas.height / currentZoom;

        const limitX = Math.max(halfW, viewW * 0.4);
        const limitY = Math.max(halfH, viewH * 0.4);

        return {
            x: Math.min(Math.max(x, -limitX), limitX),
            y: Math.min(Math.max(y, -limitY), limitY)
        };
    }, [sprite]);

    const applyZoom = useCallback((newZoom: number, focusX: number, focusY: number) => {
        if (mode === 'static') return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const finalZoom = Math.min(Math.max(newZoom, 0.25), 8);
        const worldX = (focusX - canvas.width / 2) / effectiveZoom + camera.x;
        const worldY = (focusY - canvas.height / 2) / effectiveZoom + camera.y;

        const rawNextCamX = worldX - (focusX - canvas.width / 2) / finalZoom;
        const rawNextCamY = worldY - (focusY - canvas.height / 2) / finalZoom;

        const constrained = getConstrainedPos(rawNextCamX, rawNextCamY, finalZoom);

        setInternalZoom(finalZoom);
        setCamera(constrained);
    }, [effectiveZoom, camera, getConstrainedPos, mode]);

    const handleWheel = useCallback((e: WheelEvent) => {
        if (mode === 'static') return;
        panZoom.handleWheel(e);
    }, [panZoom, mode]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            panZoom.startPan(e.clientX, e.clientY);
            e.preventDefault();
        } else if (e.button === 0) {
            // start selection drag
            const canvas = canvasRef.current;
            if (!canvas || !sprite) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let tileX: number, tileY: number;
            if (mode === 'interactive') {
                const sheetX = -sprite.width / 2;
                const sheetY = -sprite.height / 2;
                const worldX = (mouseX - canvas.width / 2) / effectiveZoom + camera.x;
                const worldY = (mouseY - canvas.height / 2) / effectiveZoom + camera.y;
                tileX = worldX - sheetX;
                tileY = worldY - sheetY;
            } else {
                tileX = mouseX / effectiveZoom;
                tileY = mouseY / effectiveZoom;
            }

            const col = Math.floor(tileX / tileset.tileWidth);
            const row = Math.floor(tileY / tileset.tileHeight);
            if (col >= 0 && col < tileset.columns && row >= 0 && tileY < sprite.height) {
                setIsSelecting(true);
                selectionStart.current = { col, row };
                selectionEnd.current = { col, row };
                mouseMovedDuringDown.current = false;
            }
        }
    }, [mode]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isPanning) {
            if (panZoom.panMove(e.clientX, e.clientY)) return;
        }

        // selection dragging (use canvas bounds)
        if (isSelecting) {
            const canvas = canvasRef.current;
            if (!canvas || !sprite) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let tileX: number, tileY: number;
            if (mode === 'interactive') {
                const sheetX = -sprite.width / 2;
                const sheetY = -sprite.height / 2;
                const worldX = (mouseX - canvas.width / 2) / effectiveZoom + camera.x;
                const worldY = (mouseY - canvas.height / 2) / effectiveZoom + camera.y;
                tileX = worldX - sheetX;
                tileY = worldY - sheetY;
            } else {
                tileX = mouseX / effectiveZoom;
                tileY = mouseY / effectiveZoom;
            }

            const col = Math.floor(tileX / tileset.tileWidth);
            const row = Math.floor(tileY / tileset.tileHeight);
            if (col >= 0 && col < tileset.columns && row >= 0 && tileY < sprite.height) {
                selectionEnd.current = { col, row };
                mouseMovedDuringDown.current = true;
            }
            return;
        }
    }, [isPanning, effectiveZoom, getConstrainedPos, isSelecting, sprite, mode, camera]);

    const handleMouseUp = useCallback(() => {
        if (isSelecting) {
            // finalize selection
            const s = selectionStart.current;
            const e = selectionEnd.current;
            if (s && e) {
                const startCol = Math.min(s.col, e.col);
                const endCol = Math.max(s.col, e.col);
                const startRow = Math.min(s.row, e.row);
                const endRow = Math.max(s.row, e.row);
                const range: number[] = [];
                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        const idx = r * tileset.columns + c;
                        if (idx >= 0 && idx < tileset.tileCount) range.push(idx);
                    }
                }
                if (range.length > 0) {
                    setSelectedTiles(range);
                }
            }
            setIsSelecting(false);
            selectionStart.current = null;
            selectionEnd.current = null;
            mouseMovedDuringDown.current = false;
        }
        panZoom.stopPan();
        setIsPanning(false);
    }, [isSelecting, tileset, setSelectedTiles]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        // also listen to canvas mouseup to finalize selection when mouse released on canvas
        const canvasMouseUp = () => handleMouseUp();
        canvas.addEventListener('mouseup', canvasMouseUp as any);
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseup', canvasMouseUp as any);
        };
    }, [handleWheel, handleMouseMove, handleMouseUp]);

    // Redraw loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !sprite) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (mode === 'interactive') {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
            }
        } else {
            canvas.width = sprite.width * effectiveZoom;
            canvas.height = sprite.height * effectiveZoom;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = mode === 'interactive' ? '#171923' : 'transparent';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.imageSmoothingEnabled = false;

        ctx.save();
        if (mode === 'interactive') {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(effectiveZoom, effectiveZoom);
            ctx.translate(-camera.x, -camera.y);
        } else {
            ctx.scale(effectiveZoom, effectiveZoom);
        }

        const sheetX = mode === 'interactive' ? -sprite.width / 2 : 0;
        const sheetY = mode === 'interactive' ? -sprite.height / 2 : 0;

        // Shadow for the spritesheet (only in interactive)
        if (mode === 'interactive') {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 20 / effectiveZoom;
        }

        ctx.drawImage(sprite, sheetX, sheetY);
        ctx.shadowColor = 'transparent';

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.5 / effectiveZoom;
        ctx.beginPath();
        for (let x = 0; x <= sprite.width; x += tileset.tileWidth) {
            ctx.moveTo(sheetX + x, sheetY); ctx.lineTo(sheetX + x, sheetY + sprite.height);
        }
        for (let y = 0; y <= sprite.height; y += tileset.tileHeight) {
            ctx.moveTo(sheetX, sheetY + y); ctx.lineTo(sheetX + sprite.width, sheetY + y);
        }
        ctx.stroke();

        // Highlight multiple selections (if any)
        if (selectedTileIndices && selectedTileIndices.length > 0) {
            ctx.strokeStyle = '#3182ce';
            ctx.lineWidth = 2 / effectiveZoom;
            ctx.fillStyle = 'rgba(49, 130, 206, 0.15)';
            for (const si of selectedTileIndices) {
                const col = si % tileset.columns;
                const row = Math.floor(si / tileset.columns);
                ctx.strokeRect(
                    sheetX + col * tileset.tileWidth,
                    sheetY + row * tileset.tileHeight,
                    tileset.tileWidth,
                    tileset.tileHeight
                );
                ctx.fillRect(
                    sheetX + col * tileset.tileWidth,
                    sheetY + row * tileset.tileHeight,
                    tileset.tileWidth,
                    tileset.tileHeight
                );
            }
        } else if (selectedIndex !== null) {
            const col = selectedIndex % tileset.columns;
            const row = Math.floor(selectedIndex / tileset.columns);

            ctx.strokeStyle = '#3182ce';
            ctx.lineWidth = 2 / effectiveZoom;
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
        // Draw selection rectangle if dragging
        if (isSelecting && selectionStart.current && selectionEnd.current) {
            const s = selectionStart.current;
            const e = selectionEnd.current;
            const startCol = Math.min(s.col, e.col);
            const endCol = Math.max(s.col, e.col);
            const startRow = Math.min(s.row, e.row);
            const endRow = Math.max(s.row, e.row);

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(effectiveZoom, effectiveZoom);
            ctx.translate(-camera.x, -camera.y);
            const sheetX = -sprite.width / 2;
            const sheetY = -sprite.height / 2;
            ctx.strokeStyle = 'rgba(66, 153, 225, 0.9)';
            ctx.lineWidth = 2 / effectiveZoom;
            ctx.fillStyle = 'rgba(66,153,225,0.15)';
            const x = sheetX + startCol * tileset.tileWidth;
            const y = sheetY + startRow * tileset.tileHeight;
            const w = (endCol - startCol + 1) * tileset.tileWidth;
            const h = (endRow - startRow + 1) * tileset.tileHeight;
            ctx.strokeRect(x, y, w, h);
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        }
    }, [sprite, tileset, selectedIndex, effectiveZoom, camera, mode]);

    const handleClick = (e: React.MouseEvent) => {
        // Ignore click if it was a drag-selection
        if (mouseMovedDuringDown.current) {
            mouseMovedDuringDown.current = false;
            return;
        }

        if (isPanning) return;
        const canvas = canvasRef.current;
        if (!canvas || !sprite) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let tileX, tileY;

        if (mode === 'interactive') {
            const sheetX = -sprite.width / 2;
            const sheetY = -sprite.height / 2;
            const worldX = (mouseX - canvas.width / 2) / effectiveZoom + camera.x;
            const worldY = (mouseY - canvas.height / 2) / effectiveZoom + camera.y;
            tileX = worldX - sheetX;
            tileY = worldY - sheetY;
        } else {
            tileX = mouseX / effectiveZoom;
            tileY = mouseY / effectiveZoom;
        }

        const col = Math.floor(tileX / tileset.tileWidth);
        const row = Math.floor(tileY / tileset.tileHeight);

        if (col >= 0 && col < tileset.columns && row >= 0 && tileY < sprite.height) {
            const index = row * tileset.columns + col;
            if (index >= 0 && index < tileset.tileCount) {
                onSelect(index, { ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey });
            }
        }
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

            {mode === 'interactive' && (
                <ZoomControls
                    zoomPercent={effectiveZoom * 100}
                    onZoomOut={() => applyZoom(effectiveZoom * 0.8, canvasRef.current!.width / 2, canvasRef.current!.height / 2)}
                    onZoomIn={() => applyZoom(effectiveZoom * 1.2, canvasRef.current!.width / 2, canvasRef.current!.height / 2)}
                    onReset={() => { setInternalZoom(1.0); setCamera({ x: 0, y: 0 }); }}
                />
            )}
        </Box>
    );
};
