/**
 * Buildings and the kits they are built from. See docs/building-editor.md for the rules that turn a building into its
 * exterior and interior.
 */

/** A sheet of 16 px pieces in the standard kit layout, plus sheets that draw over it for variations such as winter. */
export interface BuildingKit {
  formatVersion: 1;
  id: string;
  name: string;
  /** Project-relative path of the base sheet: a PNG or an Aseprite file. */
  source: string;
  /** Variation ID (such as `winter`) to the project-relative path of a sheet drawn over the base. */
  variations?: Record<string, string>;
  folderPath?: string;
}

/** A straight run of wall cells inside the outer walls. */
export interface BuildingInnerWall {
  x: number;
  y: number;
  direction: 'east' | 'south';
  length: number;
}

/** A room: the floor region containing the cell `at`. */
export interface BuildingRoom {
  id: string;
  at: { x: number; y: number };
  name: string;
  /** Name of a floor piece in the kit, such as `floor_boards`. */
  floor: string;
}

export interface BuildingOpening {
  id: string;
  kind: 'door' | 'window';
  x: number;
  y: number;
}

/** A building's plan: its footprint in tiles (outer walls included), inner walls, rooms, openings and roof. */
export interface Building {
  formatVersion: 1;
  id: string;
  name: string;
  /** The kit it is built from; empty until one is chosen. */
  kit: string;
  width: number;
  depth: number;
  innerWalls: BuildingInnerWall[];
  rooms: BuildingRoom[];
  openings: BuildingOpening[];
  chimney?: { column: number };
  roof: { kind: 'gable' };
  /** The map that is this building's interior. */
  interiorMapId?: string;
  folderPath?: string;
}
