import { describe, expect, it } from 'vitest';
import { objectSize, objectTilesFromSheet, projectTags, sheetRectangle } from './objects';
import type { ObjectDefinition } from '../types/object';
import type { Tileset } from '../types/schema';

const COLUMNS = 8;

describe('objects', () => {
  it('turns sheet cells into tiles offset from the top-left cell, in reading order', () => {
    // Cells (3,2), (4,2), (3,3) of an 8-column sheet, picked in any order and once twice.
    expect(objectTilesFromSheet([27, 19, 20, 19], COLUMNS)).toEqual([
      { x: 0, y: 0, tileIndex: 19 },
      { x: 1, y: 0, tileIndex: 20 },
      { x: 0, y: 1, tileIndex: 27 },
    ]);
    expect(objectTilesFromSheet([], COLUMNS)).toEqual([]);
  });

  it('selects the sheet cells between two corners whichever way they were dragged', () => {
    expect(sheetRectangle(20, 11, COLUMNS)).toEqual([11, 12, 19, 20]);
    expect(sheetRectangle(5, 5, COLUMNS)).toEqual([5]);
  });

  it('measures an object in tiles', () => {
    expect(objectSize(objectTilesFromSheet([19, 20, 27], COLUMNS))).toEqual({
      width: 2,
      height: 2,
    });
    expect(objectSize([])).toEqual({ width: 0, height: 0 });
  });

  it('suggests every tag used on objects and tiles, once each, sorted', () => {
    const object = (tags?: string[]): ObjectDefinition => ({
      formatVersion: 1,
      id: 'test:thing',
      name: 'Thing',
      tilesetId: 'test:sheet',
      tiles: [],
      tags,
    });
    const tileset = {
      tiles: { 0: { tags: ['water', 'nature'] }, 1: {} },
    } as unknown as Tileset;
    expect(projectTags([object(['nature', 'big']), object()], [tileset])).toEqual([
      'big',
      'nature',
      'water',
    ]);
  });
});
