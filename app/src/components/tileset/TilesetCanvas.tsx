import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { usePanZoom } from '../../hooks/usePanZoom';
import { ZoomControls } from '../common/ZoomControls';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';
import { shapeToNormalizedPolygon } from '../../lib/collisionUtils';

interface TilesetCanvasProps {
  tileset: Tileset;
  selectedIndex: number | null;
  onSelect: (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => void;
  mode?: 'interactive' | 'static';
  zoom?: number;
  tool?: 'select' | 'terrain';
  enableMultiSelect?: boolean;
}

export const TilesetCanvas: React.FC<TilesetCanvasProps> = ({
  tileset,
  selectedIndex,
  onSelect,
  mode = 'interactive',
  zoom: forcedZoom,
  tool = 'select',
  enableMultiSelect = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const sprite = loadedSprites.get(tileset.spriteSheet);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const selectedTerrainId = useEditorStore((state) => state.selectedTerrainId);
  const setTileCornerTerrain = useEditorStore((state) => state.setTileCornerTerrain);
  const showTilesetCollisionOverlay = useEditorStore((state) => state.showTilesetCollisionOverlay);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{
    col: number;
    row: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    col: number;
    row: number;
  } | null>(null);
  const mouseMovedDuringDown = useRef(false);
  const ignoreClickRef = useRef(false);

  // Terrain painting state (drag-to-paint)
  const [isTerrainPainting, setIsTerrainPainting] = useState(false);
  const lastPaintedCorner = useRef<{ tileIdx: number; corner: number } | null>(null);

  // Zoom and Camera State
  const [internalZoom, setInternalZoom] = useState(1.5);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const panZoom = usePanZoom({
    canvasRef,
    getCamera: () => ({ x: camera.x, y: camera.y, zoom: internalZoom }),
    setCamera: (c) => {
      if (typeof c.zoom === 'number') setInternalZoom(c.zoom);
      setCamera((prev) => ({ x: c.x ?? prev.x, y: c.y ?? prev.y }));
    },
    contentSize: sprite ? { width: sprite.width, height: sprite.height } : null,
  });

  const effectiveZoom = forcedZoom ?? internalZoom;

  // Constrain logic
  const getConstrainedPos = useCallback(
    (x: number, y: number, currentZoom: number) => {
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
        y: Math.min(Math.max(y, -limitY), limitY),
      };
    },
    [sprite],
  );

  const applyZoom = useCallback(
    (newZoom: number, focusX: number, focusY: number) => {
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
    },
    [effectiveZoom, camera, getConstrainedPos, mode],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (mode === 'static') return;
      panZoom.handleWheel(e);
    },
    [panZoom, mode],
  );

  // Helper to compute corner index from tile-local coordinates
  const computeCorner = useCallback(
    (tileX: number, tileY: number, col: number, row: number) => {
      const localX = tileX - col * tileset.tileWidth;
      const localY = tileY - row * tileset.tileHeight;
      const isLeft = localX < tileset.tileWidth / 2;
      const isTop = localY < tileset.tileHeight / 2;
      if (isTop && isLeft) return 0; // TL
      if (isTop && !isLeft) return 1; // TR
      if (!isTop && isLeft) return 2; // BL
      return 3; // BR
    },
    [tileset.tileWidth, tileset.tileHeight],
  );

  // Helper to get tile coords from mouse position
  const getTileCoords = useCallback(
    (mouseX: number, mouseY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !sprite) return null;

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
      const index = row * tileset.columns + col;

      if (
        col >= 0 &&
        col < tileset.columns &&
        row >= 0 &&
        index >= 0 &&
        index < tileset.tileCount
      ) {
        return { tileX, tileY, col, row, index };
      }
      return null;
    },
    [mode, effectiveZoom, camera, sprite, tileset],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        panZoom.startPan(e.clientX, e.clientY);
        e.preventDefault();
      } else if (e.button === 0 && tool === 'terrain') {
        // Start terrain painting (drag-to-paint) or clearing if selectedTerrainId is null
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const coords = getTileCoords(mouseX, mouseY);
        if (coords) {
          const corner = computeCorner(coords.tileX, coords.tileY, coords.col, coords.row);
          setIsTerrainPainting(true);
          lastPaintedCorner.current = { tileIdx: coords.index, corner };
          setTileCornerTerrain(tileset.id, coords.index, corner, selectedTerrainId);
        }
      } else if (e.button === 0) {
        // start selection drag (only in select mode)
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
        const index = row * tileset.columns + col;
        if (
          col >= 0 &&
          col < tileset.columns &&
          row >= 0 &&
          index >= 0 &&
          index < tileset.tileCount
        ) {
          // If multi-select is disabled, perform single-tile select immediately on mouse down
          if (!enableMultiSelect) {
            onSelect(index, {
              ctrlKey: e.ctrlKey || e.metaKey,
              shiftKey: e.shiftKey,
            });
            return;
          }
          setIsSelecting(true);
          setSelectionStart({ col, row });
          setSelectionEnd({ col, row });
          mouseMovedDuringDown.current = false;
        }
      }
    },
    [
      mode,
      tool,
      effectiveZoom,
      camera,
      sprite,
      tileset,
      panZoom,
      selectedTerrainId,
      getTileCoords,
      computeCorner,
      setTileCornerTerrain,
      enableMultiSelect,
      onSelect,
    ],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isPanning) {
        if (panZoom.panMove(e.clientX, e.clientY)) return;
      }

      // Terrain painting while dragging
      if (isTerrainPainting) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const coords = getTileCoords(mouseX, mouseY);
        if (coords) {
          const corner = computeCorner(coords.tileX, coords.tileY, coords.col, coords.row);
          // Only paint if different from last painted corner
          const last = lastPaintedCorner.current;
          if (!last || last.tileIdx !== coords.index || last.corner !== corner) {
            lastPaintedCorner.current = { tileIdx: coords.index, corner };
            setTileCornerTerrain(tileset.id, coords.index, corner, selectedTerrainId);
          }
        }
        return;
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
        const index = row * tileset.columns + col;
        if (
          col >= 0 &&
          col < tileset.columns &&
          row >= 0 &&
          index >= 0 &&
          index < tileset.tileCount
        ) {
          setSelectionEnd({ col, row });
          mouseMovedDuringDown.current = true;
        }
        return;
      }
    },
    [
      isPanning,
      effectiveZoom,
      isSelecting,
      sprite,
      mode,
      camera,
      isTerrainPainting,
      selectedTerrainId,
      getTileCoords,
      computeCorner,
      setTileCornerTerrain,
      tileset.id,
      panZoom,
      tileset.columns,
      tileset.tileWidth,
      tileset.tileHeight,
    ],
  );

  const handleMouseUp = useCallback(() => {
    // Stop terrain painting
    if (isTerrainPainting) {
      setIsTerrainPainting(false);
      lastPaintedCorner.current = null;
    }

    if (isSelecting) {
      // finalize selection
      const s = selectionStart;
      const e = selectionEnd;
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
          // Respect enableMultiSelect prop: only bulk-select when allowed
          if (typeof enableMultiSelect !== 'undefined' ? enableMultiSelect : true) {
            setSelectedTiles(range);
            // Prevent the subsequent click event from turning this into a single select
            ignoreClickRef.current = true;
          } else {
            // If multi-select not enabled, pick first tile of range as single select
            onSelect(range[0]);
          }
        }
      }
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      mouseMovedDuringDown.current = false;
    }
    panZoom.stopPan();
    setIsPanning(false);
  }, [
    isSelecting,
    isTerrainPainting,
    tileset,
    setSelectedTiles,
    enableMultiSelect,
    onSelect,
    panZoom,
    selectionStart,
    selectionEnd,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    // also listen to canvas mouseup to finalize selection when mouse released on canvas
    const canvasMouseUp = () => handleMouseUp();
    canvas.addEventListener('mouseup', canvasMouseUp);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseup', canvasMouseUp);
    };
  }, [handleWheel, handleMouseMove, handleMouseUp]);

  // Initialize camera when sprite loads to center the tileset
  useEffect(() => {
    if (!sprite || mode !== 'interactive') return;
    // Center the sprite on the canvas by keeping camera at (0, 0)
    // The rendering logic already handles centering with sheetX/sheetY = -sprite.width/2, -sprite.height/2
    setCamera({ x: 0, y: 0 });
    setInternalZoom(1.5);
  }, [sprite, mode]);

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
    // Match central viewport background used in MapViewport / ViewportShell
    ctx.fillStyle = mode === 'interactive' ? '#0a0a0b' : 'transparent';
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
      ctx.moveTo(sheetX + x, sheetY);
      ctx.lineTo(sheetX + x, sheetY + sprite.height);
    }
    for (let y = 0; y <= sprite.height; y += tileset.tileHeight) {
      ctx.moveTo(sheetX, sheetY + y);
      ctx.lineTo(sheetX + sprite.width, sheetY + y);
    }
    ctx.stroke();

    // Highlight multiple selections (if any)
    if (selectedTileIndices && selectedTileIndices.length > 0) {
      ctx.strokeStyle = '#3182ce';
      ctx.lineWidth = 2 / effectiveZoom;
      ctx.fillStyle = 'rgba(49, 130, 206, 0.15)';
      if (selectedTileIndices.length === 1) {
        const si = selectedTileIndices[0];
        const col = si % tileset.columns;
        const row = Math.floor(si / tileset.columns);
        ctx.strokeRect(
          sheetX + col * tileset.tileWidth,
          sheetY + row * tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight,
        );
        ctx.fillRect(
          sheetX + col * tileset.tileWidth,
          sheetY + row * tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight,
        );
      } else {
        // Draw a single bounding rect covering the selection
        let minC = Infinity,
          minR = Infinity,
          maxC = -Infinity,
          maxR = -Infinity;
        for (const si of selectedTileIndices) {
          const c = si % tileset.columns;
          const r = Math.floor(si / tileset.columns);
          if (c < minC) minC = c;
          if (r < minR) minR = r;
          if (c > maxC) maxC = c;
          if (r > maxR) maxR = r;
        }
        if (minC !== Infinity) {
          const x = sheetX + minC * tileset.tileWidth;
          const y = sheetY + minR * tileset.tileHeight;
          const w = (maxC - minC + 1) * tileset.tileWidth;
          const h = (maxR - minR + 1) * tileset.tileHeight;
          ctx.strokeRect(x, y, w, h);
          ctx.fillRect(x, y, w, h);
        }
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
        tileset.tileHeight,
      );

      ctx.fillStyle = 'rgba(49, 130, 206, 0.2)';
      ctx.fillRect(
        sheetX + col * tileset.tileWidth,
        sheetY + row * tileset.tileHeight,
        tileset.tileWidth,
        tileset.tileHeight,
      );
    }

    // Draw terrain corner overlays when in terrain tool (50% opacity quadrants with rounded outer corners)
    if (tool === 'terrain') {
      // Helper to convert hex to rgba with alpha
      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };

      // Helper to get terrain at a specific corner of a tile
      const getCornerTerrain = (
        tileCol: number,
        tileRow: number,
        cornerIdx: number,
      ): string | null => {
        if (tileCol < 0 || tileRow < 0 || tileCol >= tileset.columns) return null;
        const tileIdx = tileRow * tileset.columns + tileCol;
        if (tileIdx < 0 || tileIdx >= tileset.tileCount) return null;
        const td = tileset.tiles?.[tileIdx];
        return td?.terrainCorners?.[cornerIdx] || null;
      };

      const halfW = tileset.tileWidth / 2;
      const halfH = tileset.tileHeight / 2;
      const radius = Math.min(halfW, halfH) * 0.35;

      // For each tile, draw quadrant fills for assigned corners
      for (let idx = 0; idx < tileset.tileCount; idx++) {
        const col = idx % tileset.columns;
        const row = Math.floor(idx / tileset.columns);
        const tileDef = tileset.tiles?.[idx];
        const corners = tileDef?.terrainCorners || null;
        if (!corners) continue;

        const x = sheetX + col * tileset.tileWidth;
        const y = sheetY + row * tileset.tileHeight;

        // corner positions: 0=TL, 1=TR, 2=BL, 3=BR
        for (let ci = 0; ci < 4; ci++) {
          const tid = corners[ci];
          if (!tid) continue;
          const tt = terrainTypes.find((t) => t.id === tid);
          if (!tt) continue;

          // Determine which corners of this quadrant should be rounded
          // Inner corner (toward tile center) is never rounded
          // Outer corner is rounded if adjacent quadrants have different terrain
          let qx = 0,
            qy = 0;
          let roundTL = false,
            roundTR = false,
            roundBL = false,
            roundBR = false;

          if (ci === 0) {
            // TL quadrant
            qx = x;
            qy = y;
            // Outer corner is top-left; check adjacent: left tile's TR, top tile's BL, diag's BR
            const adjLeft = getCornerTerrain(col - 1, row, 1); // TR of left tile
            const adjTop = getCornerTerrain(col, row - 1, 2); // BL of top tile
            const adjDiag = getCornerTerrain(col - 1, row - 1, 3); // BR of diag tile
            roundTL = adjLeft !== tid || adjTop !== tid || adjDiag !== tid;
            // Check if right edge should connect (TR quadrant same terrain)
            roundTR = corners[1] !== tid;
            // Check if bottom edge should connect (BL quadrant same terrain)
            roundBL = corners[2] !== tid;
          } else if (ci === 1) {
            // TR quadrant
            qx = x + halfW;
            qy = y;
            const adjRight = getCornerTerrain(col + 1, row, 0); // TL of right tile
            const adjTop = getCornerTerrain(col, row - 1, 3); // BR of top tile
            const adjDiag = getCornerTerrain(col + 1, row - 1, 2); // BL of diag tile
            roundTR = adjRight !== tid || adjTop !== tid || adjDiag !== tid;
            roundTL = corners[0] !== tid;
            roundBR = corners[3] !== tid;
          } else if (ci === 2) {
            // BL quadrant
            qx = x;
            qy = y + halfH;
            const adjLeft = getCornerTerrain(col - 1, row, 3); // BR of left tile
            const adjBot = getCornerTerrain(col, row + 1, 0); // TL of bottom tile
            const adjDiag = getCornerTerrain(col - 1, row + 1, 1); // TR of diag tile
            roundBL = adjLeft !== tid || adjBot !== tid || adjDiag !== tid;
            roundTL = corners[0] !== tid;
            roundBR = corners[3] !== tid;
          } else {
            // BR quadrant (ci === 3)
            qx = x + halfW;
            qy = y + halfH;
            const adjRight = getCornerTerrain(col + 1, row, 2); // BL of right tile
            const adjBot = getCornerTerrain(col, row + 1, 1); // TR of bottom tile
            const adjDiag = getCornerTerrain(col + 1, row + 1, 0); // TL of diag tile
            roundBR = adjRight !== tid || adjBot !== tid || adjDiag !== tid;
            roundTR = corners[1] !== tid;
            roundBL = corners[2] !== tid;
          }

          ctx.fillStyle = hexToRgba(tt.color, 0.5);
          ctx.beginPath();
          // Draw rounded rect with selective corner radii
          const rTL = roundTL ? radius : 0;
          const rTR = roundTR ? radius : 0;
          const rBL = roundBL ? radius : 0;
          const rBR = roundBR ? radius : 0;
          ctx.moveTo(qx + rTL, qy);
          ctx.lineTo(qx + halfW - rTR, qy);
          if (rTR > 0) ctx.arcTo(qx + halfW, qy, qx + halfW, qy + rTR, rTR);
          else ctx.lineTo(qx + halfW, qy);
          ctx.lineTo(qx + halfW, qy + halfH - rBR);
          if (rBR > 0) ctx.arcTo(qx + halfW, qy + halfH, qx + halfW - rBR, qy + halfH, rBR);
          else ctx.lineTo(qx + halfW, qy + halfH);
          ctx.lineTo(qx + rBL, qy + halfH);
          if (rBL > 0) ctx.arcTo(qx, qy + halfH, qx, qy + halfH - rBL, rBL);
          else ctx.lineTo(qx, qy + halfH);
          ctx.lineTo(qx, qy + rTL);
          if (rTL > 0) ctx.arcTo(qx, qy, qx + rTL, qy, rTL);
          else ctx.lineTo(qx, qy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Draw collision overlays in tileset editor for quick visual QA.
    if (showTilesetCollisionOverlay && mode === 'interactive') {
      for (let idx = 0; idx < tileset.tileCount; idx++) {
        const tileDef = tileset.tiles?.[idx];
        const collision = tileDef?.collision;
        if (!collision || collision.type === 'none') continue;

        const col = idx % tileset.columns;
        const row = Math.floor(idx / tileset.columns);
        const x = sheetX + col * tileset.tileWidth;
        const y = sheetY + row * tileset.tileHeight;

        if (collision.type === 'full') {
          ctx.fillStyle = 'rgba(255, 127, 80, 0.25)';
          ctx.fillRect(x, y, tileset.tileWidth, tileset.tileHeight);
          ctx.strokeStyle = 'rgba(255, 180, 138, 0.95)';
          ctx.lineWidth = 1 / effectiveZoom;
          ctx.strokeRect(x, y, tileset.tileWidth, tileset.tileHeight);
          continue;
        }

        for (const shape of collision.shapes || []) {
          const points = shapeToNormalizedPolygon(shape, tileset.tileWidth, tileset.tileHeight);
          if (points.length < 3) continue;

          ctx.beginPath();
          ctx.moveTo(x + points[0][0] * tileset.tileWidth, y + points[0][1] * tileset.tileHeight);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(x + points[i][0] * tileset.tileWidth, y + points[i][1] * tileset.tileHeight);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 127, 80, 0.25)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 180, 138, 0.95)';
          ctx.lineWidth = 1 / effectiveZoom;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
    // Draw selection rectangle if dragging
    if (isSelecting && selectionStart && selectionEnd) {
      const s = selectionStart;
      const e = selectionEnd;
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
  }, [
    sprite,
    tileset,
    selectedIndex,
    selectedTileIndices,
    effectiveZoom,
    camera,
    mode,
    tool,
    terrainTypes,
    isSelecting,
    selectionStart,
    selectionEnd,
    showTilesetCollisionOverlay,
  ]);

  const handleClick = (e: React.MouseEvent) => {
    // Ignore click if it was a drag-selection or we've just set a multi-selection
    if (mouseMovedDuringDown.current || ignoreClickRef.current) {
      mouseMovedDuringDown.current = false;
      ignoreClickRef.current = false;
      return;
    }

    // Terrain painting is handled in mouseDown/mouseMove, skip here
    if (tool === 'terrain') return;

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

    const index = row * tileset.columns + col;
    if (col >= 0 && col < tileset.columns && row >= 0 && index >= 0 && index < tileset.tileCount) {
      onSelect(index, {
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
      });
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
          cursor: isPanning ? 'grabbing' : 'crosshair',
        }}
      />

      {mode === 'interactive' && (
        <ZoomControls
          zoomPercent={effectiveZoom * 100}
          onZoomOut={() =>
            applyZoom(
              effectiveZoom * 0.8,
              canvasRef.current!.width / 2,
              canvasRef.current!.height / 2,
            )
          }
          onZoomIn={() =>
            applyZoom(
              effectiveZoom * 1.2,
              canvasRef.current!.width / 2,
              canvasRef.current!.height / 2,
            )
          }
          onReset={() => {
            setInternalZoom(1.0);
            setCamera({ x: 0, y: 0 });
          }}
        />
      )}
    </Box>
  );
};
