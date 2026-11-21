import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import type { Building } from '../../../types/building';
import type { ResolvedKit } from '../../../lib/buildings/resolveKit';
import { buildGrid, isFloor, isWall } from '../../../lib/buildings/grid';
import { findRegions, roomsByRegion } from '../../../lib/buildings/rooms';
import { layoutInterior } from '../../../lib/buildings/layout';
import { floorPlan, withFloor } from '../../../lib/buildings/plan';
import { drawList, renderDraws } from '../../../lib/buildings/render';
import { KIT_TILE } from '../../../lib/buildings/kitLayout';
import type { PlanIssue } from '../../../lib/buildings/validate';
import {
  addOpening,
  addWall,
  eraseWall,
  openingRefusal,
  wallLine,
} from '../../../lib/buildings/edit';
import {
  BUILDING_PLAN_DOOR_HEX,
  BUILDING_PLAN_FLOOR_HEX,
  BUILDING_PLAN_GHOST_HEX,
  BUILDING_PLAN_GRID_HEX,
  BUILDING_PLAN_LABEL_HEX,
  BUILDING_PLAN_PROBLEM_HEX,
  BUILDING_PLAN_SELECTION_HEX,
  BUILDING_PLAN_WALL_HEX,
  BUILDING_PLAN_WINDOW_HEX,
} from '../../../lib/editorColors';

export type PlanTool = 'select' | 'wall' | 'erase' | 'door' | 'window' | 'stairs' | 'chimney';

export type PlanSelection =
  { kind: 'room'; id: string } | { kind: 'opening'; id: string } | { kind: 'chimney' } | null;

type Cell = { x: number; y: number };

/**
 * One floor's plan, drawn as its interior will look (or as a schematic until the kit is read), with what the inside
 * cannot show on top: room names, doors, windows, stairs, the chimney's column, the selection, problems and the active
 * tool's ghost.
 */
export function PlanCanvas({
  building,
  floor,
  kit,
  issues,
  tool,
  scale,
  selection,
  defaultFloor,
  onChange,
  onSelect,
}: {
  building: Building;
  floor: number;
  kit: ResolvedKit | null;
  issues: PlanIssue[];
  tool: PlanTool;
  scale: number;
  selection: PlanSelection;
  defaultFloor: string;
  onChange: (building: Building) => void;
  onSelect: (selection: PlanSelection) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [dragStart, setDragStart] = useState<Cell | null>(null);
  const plan = useMemo(() => floorPlan(building, floor), [building, floor]);
  const grid = useMemo(() => buildGrid(plan), [plan]);
  const ground = floor === 0;
  const top = floor === building.floors.length - 1;
  const stairsDown = floor > 0 ? building.floors[floor - 1].stairsUp : undefined;
  const changePlan = (next: typeof plan) => onChange(withFloor(building, floor, next));
  const regions = useMemo(() => findRegions(grid), [grid]);
  const tile = KIT_TILE * scale;

  const ghost: Cell[] =
    (tool === 'wall' || tool === 'erase') && hover
      ? wallLine(plan, dragStart ?? hover, hover)
      : hover && tool !== 'select'
        ? [tool === 'chimney' ? { x: hover.x, y: 0 } : hover]
        : [];
  const refusal = !hover
    ? null
    : tool === 'door' || tool === 'window'
      ? openingRefusal(plan, tool, hover.x, hover.y, ground)
      : tool === 'stairs'
        ? stairsRefusal(hover)
        : null;

  function stairsRefusal(cell: Cell): string | null {
    if (top) return 'The top floor has no stairs up; add a floor above first.';
    if (!isFloor(grid, cell.x, cell.y)) return 'Stairs go on a floor cell.';
    return null;
  }

  useEffect(() => {
    const context = ref.current!.getContext('2d')!;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    if (kit) {
      const { placements } = layoutInterior(plan, grid, stairsDown);
      renderDraws(drawList(placements, kit, []), kit, context, scale);
    } else
      for (let y = 0; y < grid.depth; y++)
        for (let x = 0; x < grid.width; x++) {
          context.fillStyle = isWall(grid, x, y) ? BUILDING_PLAN_WALL_HEX : BUILDING_PLAN_FLOOR_HEX;
          context.fillRect(x * tile, y * tile, tile, tile);
        }

    context.strokeStyle = BUILDING_PLAN_GRID_HEX;
    context.lineWidth = 1;
    for (let x = 0; x <= grid.width; x++)
      line(context, x * tile + 0.5, 0, x * tile + 0.5, grid.depth * tile);
    for (let y = 0; y <= grid.depth; y++)
      line(context, 0, y * tile + 0.5, grid.width * tile, y * tile + 0.5);

    const outline = (cells: Cell[], color: string, width = 2) => {
      context.strokeStyle = color;
      context.lineWidth = width;
      for (const { x, y } of cells)
        context.strokeRect(x * tile + width / 2, y * tile + width / 2, tile - width, tile - width);
    };
    for (const opening of plan.openings)
      outline(
        [opening],
        opening.kind === 'door' ? BUILDING_PLAN_DOOR_HEX : BUILDING_PLAN_WINDOW_HEX,
      );
    if (building.chimney) outline([{ x: building.chimney.column, y: 0 }], BUILDING_PLAN_LABEL_HEX);
    if (plan.stairsUp) outline([plan.stairsUp], BUILDING_PLAN_LABEL_HEX);
    if (stairsDown) outline([stairsDown], BUILDING_PLAN_LABEL_HEX);
    for (const issue of issues)
      if (issue.floor === floor) outline(issue.cells, BUILDING_PLAN_PROBLEM_HEX);

    const { roomsIn } = roomsByRegion(plan, regions);
    context.font = `${Math.max(10, 4 * scale)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    regions.regions.forEach((region, index) => {
      const room = roomsIn[index][0];
      if (!room) return;
      const cx = ((region.left + region.right + 1) / 2) * tile;
      const cy = ((region.top + region.bottom + 1) / 2) * tile;
      context.lineWidth = 3;
      context.strokeStyle = BUILDING_PLAN_WALL_HEX;
      context.strokeText(room.name, cx, cy);
      context.fillStyle = BUILDING_PLAN_LABEL_HEX;
      context.fillText(room.name, cx, cy);
      if (selection?.kind === 'room' && selection.id === room.id)
        outline(region.cells, BUILDING_PLAN_SELECTION_HEX, 3);
    });
    if (selection?.kind === 'opening') {
      const opening = plan.openings.find((entry) => entry.id === selection.id);
      if (opening) outline([opening], BUILDING_PLAN_SELECTION_HEX, 3);
    }
    if (selection?.kind === 'chimney' && building.chimney)
      outline([{ x: building.chimney.column, y: 0 }], BUILDING_PLAN_SELECTION_HEX, 3);

    context.fillStyle = refusal ? BUILDING_PLAN_PROBLEM_HEX : BUILDING_PLAN_GHOST_HEX;
    context.globalAlpha = 0.45;
    for (const { x, y } of ghost) context.fillRect(x * tile, y * tile, tile, tile);
    context.globalAlpha = 1;
  });

  const cellAt = (event: React.PointerEvent): Cell | null => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / tile);
    const y = Math.floor((event.clientY - rect.top) / tile);
    return x >= 0 && y >= 0 && x < grid.width && y < grid.depth ? { x, y } : null;
  };

  const click = (cell: Cell) => {
    if (tool === 'select') {
      const opening = plan.openings.find((o) => o.x === cell.x && o.y === cell.y);
      if (opening) return onSelect({ kind: 'opening', id: opening.id });
      if (building.chimney && cell.y === 0 && cell.x === building.chimney.column)
        return onSelect({ kind: 'chimney' });
      const region = regions.regionAt[cell.y][cell.x];
      const room = region >= 0 ? roomsByRegion(plan, regions).roomsIn[region][0] : undefined;
      return onSelect(room ? { kind: 'room', id: room.id } : null);
    }
    if (tool === 'door' || tool === 'window') {
      if (openingRefusal(plan, tool, cell.x, cell.y, ground)) return;
      const next = addOpening(plan, tool, cell.x, cell.y);
      changePlan(next);
      onSelect({ kind: 'opening', id: next.openings[next.openings.length - 1].id });
    }
    if (tool === 'stairs' && !stairsRefusal(cell)) changePlan({ ...plan, stairsUp: cell });
    if (tool === 'chimney' && cell.x >= 1 && cell.x <= building.width - 2) {
      onChange({ ...building, chimney: { column: cell.x } });
      onSelect({ kind: 'chimney' });
    }
  };

  return (
    <Box p={4}>
      <canvas
        ref={ref}
        aria-label="Building plan"
        width={grid.width * tile}
        height={grid.depth * tile}
        onPointerMove={(event) => setHover(cellAt(event))}
        onPointerLeave={() => {
          setHover(null);
          setDragStart(null);
        }}
        onPointerDown={(event) => {
          const cell = cellAt(event);
          if (!cell) return;
          if (tool === 'wall' || tool === 'erase') setDragStart(cell);
          else click(cell);
        }}
        onPointerUp={(event) => {
          const cell = cellAt(event);
          if (!dragStart || !cell) return;
          const cells = wallLine(plan, dragStart, cell);
          setDragStart(null);
          changePlan(
            tool === 'wall'
              ? addWall(plan, cells, defaultFloor)
              : eraseWall(plan, cells, defaultFloor),
          );
        }}
      />
      <Text fontSize="xs" color="editorMutedText" mt={2} minH={4}>
        {refusal ?? (hover ? `(${hover.x}, ${hover.y})` : '')}
      </Text>
    </Box>
  );
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}
