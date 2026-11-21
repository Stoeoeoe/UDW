import type { TilesetObjectTile } from './schema';

/**
 * A reusable map object (objects/*.object.json): tiles from one tileset, placed on a map's object layer as one
 * depth-sorted piece. Collision and sorting come from the tileset's tiles. Description and tags are for finding
 * and organizing objects in Vulcanus. See Schemas/object.schema.json.
 */
export interface ObjectDefinition {
  formatVersion: 1;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  tilesetId: string;
  /** Offsets from the object's top-left cell. */
  tiles: TilesetObjectTile[];
  folderPath?: string;
}
