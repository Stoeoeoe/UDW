import { describe, it, expect } from 'vitest';

/**
 * Pure functions extracted from MapTestModeView depth math so we can unit-test
 * without Phaser. Keep in sync with the constants in MapTestModeView.tsx.
 */

const CHARACTER_CELL_SIZE = 48;
const TEST_MODE_COLLIDER_OFFSET_Y = 23;
const TEST_MODE_COLLIDER_HEIGHT = 10;

function tileSortDepth(worldY: number, pivotY: number, tileSize: number): number {
  return worldY + pivotY * tileSize;
}

function playerSortDepth(bodyPositionY: number): number {
  return bodyPositionY - TEST_MODE_COLLIDER_OFFSET_Y + CHARACTER_CELL_SIZE / 2;
}

// Helper: given where the player's visual feet are on screen, derive bodyPositionY.
// visual feet = bodyPositionY - TEST_MODE_COLLIDER_OFFSET_Y + CHARACTER_CELL_SIZE / 2
// => bodyPositionY = feetY + TEST_MODE_COLLIDER_OFFSET_Y - CHARACTER_CELL_SIZE / 2
function bodyPositionYFromFeet(feetY: number): number {
  return feetY + TEST_MODE_COLLIDER_OFFSET_Y - CHARACTER_CELL_SIZE / 2;
}

describe('Y-sort depth math', () => {
  const TILE_SIZE = 16;

  describe('tile sort depth', () => {
    it('ground tile (pivotY=1) at row 0 has depth = tileSize', () => {
      expect(tileSortDepth(0, 1.0, TILE_SIZE)).toBe(16);
    });

    it('ground tile at row 4 has depth = 80', () => {
      // worldY = 4 * 16 = 64
      expect(tileSortDepth(64, 1.0, TILE_SIZE)).toBe(80);
    });

    it('crown tile 4 rows above ground (pivotY=5) at row 0 has depth = 80', () => {
      // worldY=0, pivotY=5 means "ground is 5 tile-heights below this tile"
      expect(tileSortDepth(0, 5.0, TILE_SIZE)).toBe(80);
    });

    it('crown tile 4 rows above ground (pivotY=5) at row 1 has depth = 96', () => {
      // worldY=16, pivotY=5 → 16 + 80 = 96 — above trunk, player still behind it
      expect(tileSortDepth(16, 5.0, TILE_SIZE)).toBe(96);
    });
  });

  describe('player sort depth', () => {
    it('player feet at y=80 has correct depth', () => {
      const bodyY = bodyPositionYFromFeet(80);
      // feetY=80 → bodyY = 80 + 23 - 24 = 79
      expect(bodyY).toBe(79);
      // depth = 79 - 23 + 24 = 80
      expect(playerSortDepth(bodyY)).toBe(80);
    });

    it('player feet at y=16 has depth 16', () => {
      const bodyY = bodyPositionYFromFeet(16);
      expect(playerSortDepth(bodyY)).toBe(16);
    });
  });

  describe('5-tall 2-wide tree (tileSize=16)', () => {
    // Tree occupies grid rows 0-4. Trunk = row 4. Crown = rows 0-3.
    // Trunk tiles: pivotY=1.0
    // Crown tiles: pivotY=5.0 (5 tile-heights to ground at row 4)

    const trunkRow = 4;
    const trunkWorldY = trunkRow * TILE_SIZE; // 64
    const trunkDepth = tileSortDepth(trunkWorldY, 1.0, TILE_SIZE); // 80

    it('trunk depth is 80', () => {
      expect(trunkDepth).toBe(80);
    });

    it('all crown tiles also get depth 80 with pivotY=5', () => {
      for (let row = 0; row < 4; row++) {
        const worldY = row * TILE_SIZE;
        const tilesBelow = trunkRow - row + 1; // rows below including trunk
        expect(tileSortDepth(worldY, tilesBelow, TILE_SIZE)).toBe(80);
      }
    });

    it('player standing in front of trunk (feet at y=88) draws over tree', () => {
      const bodyY = bodyPositionYFromFeet(88);
      const depth = playerSortDepth(bodyY);
      expect(depth).toBeGreaterThan(trunkDepth);
    });

    it('player standing behind trunk (feet at y=72) is drawn behind tree', () => {
      const bodyY = bodyPositionYFromFeet(72);
      const depth = playerSortDepth(bodyY);
      expect(depth).toBeLessThan(trunkDepth);
    });

    it('player standing in crown area (feet at y=20) is drawn behind tree', () => {
      const bodyY = bodyPositionYFromFeet(20);
      const depth = playerSortDepth(bodyY);
      const crownDepth = tileSortDepth(0, 5.0, TILE_SIZE); // 80
      expect(depth).toBeLessThan(crownDepth);
    });
  });
});
