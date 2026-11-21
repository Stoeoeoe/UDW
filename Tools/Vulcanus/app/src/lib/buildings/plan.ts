import type { Building, BuildingFloor } from '../../types/building';

/** One floor's plan with the building's size: what the grid, rooms, validation and edits work on. */
export type FloorPlan = BuildingFloor & Pick<Building, 'width' | 'depth'>;

export const floorPlan = (building: Building, floor: number): FloorPlan => ({
  width: building.width,
  depth: building.depth,
  ...building.floors[floor],
});

/** The building with one floor replaced by an edited plan of it. */
export function withFloor(building: Building, floor: number, plan: FloorPlan): Building {
  const { innerWalls, rooms, openings, stairsUp } = plan;
  const edited: BuildingFloor = { innerWalls, rooms, openings };
  if (stairsUp) edited.stairsUp = stairsUp;
  return { ...building, floors: building.floors.map((entry, i) => (i === floor ? edited : entry)) };
}

export const floorName = (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor + 1}`);
