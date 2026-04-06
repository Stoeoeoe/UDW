import { TileDefinition } from '../types/schema';

export type AutoTilePreset = 'simple' | 'full';
export type AutoTileCorner = 'A' | 'B';
export type AutoTileCorners = [AutoTileCorner, AutoTileCorner, AutoTileCorner, AutoTileCorner];

export interface AutoTilePatternDefinition {
  key: string;
  corners: AutoTileCorners;
  label: string;
}

interface TilePixels {
  data: Uint8ClampedArray;
}

export interface GenerateAutotileTilesetAtlasParams {
  sprite: HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  sourceColumns: number;
  tileSize: number;
  sourceAIndices: number[];
  sourceBIndices: number[];
  terrainAId: string;
  terrainBId: string;
  preset: AutoTilePreset;
  variantsPerPattern: number;
  outputColumns?: number;
  idPrefix?: string;
}

export interface GeneratedAutotileTilesetAtlas {
  pngBlob: Blob;
  tileCount: number;
  columns: number;
  rows: number;
  patterns: AutoTilePatternDefinition[];
  tiles: Record<number, TileDefinition>;
}

const PRESET_LABELS: Record<string, string> = {
  BBBB: 'All B',
  ABBB: 'Outer TL',
  BABB: 'Outer TR',
  BBAB: 'Outer BL',
  BBBA: 'Outer BR',
  AABB: 'Edge Top',
  BBAA: 'Edge Bottom',
  ABAB: 'Edge Left',
  BABA: 'Edge Right',
  ABBA: 'Checkerboard 1',
  BAAB: 'Checkerboard 2',
  AAAB: 'Inner BR',
  AABA: 'Inner BL',
  ABAA: 'Inner TR',
  BAAA: 'Inner TL',
  AAAA: 'All A',
};

function keyFromCorners(corners: AutoTileCorners): string {
  return corners.join('');
}

function cornersFromMask(mask: number): AutoTileCorners {
  return [
    (mask & 1) !== 0 ? 'A' : 'B',
    (mask & 2) !== 0 ? 'A' : 'B',
    (mask & 4) !== 0 ? 'A' : 'B',
    (mask & 8) !== 0 ? 'A' : 'B',
  ];
}

function countA(corners: AutoTileCorners): number {
  let total = 0;
  for (const c of corners) {
    if (c === 'A') total++;
  }
  return total;
}

function isCheckerboard(corners: AutoTileCorners): boolean {
  // Diagonal split: TL == BR, TR == BL, and they differ from each other.
  return corners[0] === corners[3] && corners[1] === corners[2] && corners[0] !== corners[1];
}

function comparePatternOrder(a: AutoTilePatternDefinition, b: AutoTilePatternDefinition): number {
  const ca = countA(a.corners);
  const cb = countA(b.corners);
  if (ca !== cb) return ca - cb;
  return a.key.localeCompare(b.key);
}

function createFullPatternList(): AutoTilePatternDefinition[] {
  const patterns: AutoTilePatternDefinition[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const corners = cornersFromMask(mask);
    const key = keyFromCorners(corners);
    patterns.push({
      key,
      corners,
      label: PRESET_LABELS[key] || key,
    });
  }
  return patterns.sort(comparePatternOrder);
}

export function getAutoTilePatterns(preset: AutoTilePreset): AutoTilePatternDefinition[] {
  const full = createFullPatternList();
  if (preset === 'full') return full;
  return full.filter((p) => !isCheckerboard(p.corners));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode generated autotile atlas.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function sourceDimensions(sprite: HTMLImageElement | HTMLCanvasElement | ImageBitmap): {
  width: number;
  height: number;
} {
  if (sprite instanceof HTMLImageElement) {
    return {
      width: sprite.naturalWidth || sprite.width,
      height: sprite.naturalHeight || sprite.height,
    };
  }
  return { width: sprite.width, height: sprite.height };
}

function extractTilePixels(
  sourceCtx: CanvasRenderingContext2D,
  tileIndex: number,
  columns: number,
  tileSize: number,
): TilePixels {
  const col = tileIndex % columns;
  const row = Math.floor(tileIndex / columns);
  const x = col * tileSize;
  const y = row * tileSize;
  const data = sourceCtx.getImageData(x, y, tileSize, tileSize).data;
  return { data };
}

function pickByIndex<T>(items: T[], seedIndex: number): T {
  return items[Math.abs(seedIndex) % items.length];
}

export function composeTilePixels(
  corners: AutoTileCorners,
  aPixels: Uint8ClampedArray,
  bPixels: Uint8ClampedArray,
  tileSize: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tileSize * tileSize * 4);

  for (let y = 0; y < tileSize; y++) {
    const v = (y + 0.5) / tileSize;
    for (let x = 0; x < tileSize; x++) {
      const u = (x + 0.5) / tileSize;

      const wTL = (1 - u) * (1 - v);
      const wTR = u * (1 - v);
      const wBL = (1 - u) * v;
      const wBR = u * v;

      const aScore =
        (corners[0] === 'A' ? wTL : 0) +
        (corners[1] === 'A' ? wTR : 0) +
        (corners[2] === 'A' ? wBL : 0) +
        (corners[3] === 'A' ? wBR : 0);

      const src = aScore >= 0.5 ? aPixels : bPixels;
      const i = (y * tileSize + x) * 4;

      out[i] = src[i];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[i + 2];
      out[i + 3] = src[i + 3];
    }
  }

  return out;
}

function toTerrainCorners(
  corners: AutoTileCorners,
  terrainAId: string,
  terrainBId: string,
): [string, string, string, string] {
  return [
    corners[0] === 'A' ? terrainAId : terrainBId,
    corners[1] === 'A' ? terrainAId : terrainBId,
    corners[2] === 'A' ? terrainAId : terrainBId,
    corners[3] === 'A' ? terrainAId : terrainBId,
  ];
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildOutputTileId(
  prefix: string,
  pattern: AutoTilePatternDefinition,
  variantIndex: number,
  variantCount: number,
): string {
  const base = `${prefix}-${pattern.key.toLowerCase()}`;
  if (variantCount <= 1) return base;
  return `${base}-v${variantIndex + 1}`;
}

export async function generateAutotileTilesetAtlas(
  params: GenerateAutotileTilesetAtlasParams,
): Promise<GeneratedAutotileTilesetAtlas> {
  const {
    sprite,
    sourceColumns,
    tileSize,
    sourceAIndices,
    sourceBIndices,
    terrainAId,
    terrainBId,
    preset,
    variantsPerPattern,
    outputColumns,
    idPrefix,
  } = params;

  if (tileSize <= 0) {
    throw new Error('Tile size must be greater than zero.');
  }
  if (!sourceAIndices.length || !sourceBIndices.length) {
    throw new Error('Pick at least one source tile for both terrain groups.');
  }

  const { width: spriteW, height: spriteH } = sourceDimensions(sprite);
  const sourceRows = Math.floor(spriteH / tileSize);
  const maxTileCount = sourceColumns * sourceRows;

  const validateTileIndex = (idx: number, groupName: string) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= maxTileCount) {
      throw new Error(`${groupName} contains invalid tile index ${idx}.`);
    }
  };

  sourceAIndices.forEach((idx) => validateTileIndex(idx, 'Terrain A'));
  sourceBIndices.forEach((idx) => validateTileIndex(idx, 'Terrain B'));

  const patterns = getAutoTilePatterns(preset);
  const safeVariants = Math.max(1, Math.floor(variantsPerPattern));
  const tileCount = patterns.length * safeVariants;
  const columns = Math.max(1, Math.min(outputColumns || 8, tileCount));
  const rows = Math.ceil(tileCount / columns);

  const sourceCanvas = createCanvas(spriteW, spriteH);
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    throw new Error('Unable to initialize source canvas context.');
  }
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(sprite, 0, 0);

  const aSourceTiles = sourceAIndices.map((idx) =>
    extractTilePixels(sourceCtx, idx, sourceColumns, tileSize),
  );
  const bSourceTiles = sourceBIndices.map((idx) =>
    extractTilePixels(sourceCtx, idx, sourceColumns, tileSize),
  );

  const outCanvas = createCanvas(columns * tileSize, rows * tileSize);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('Unable to initialize output canvas context.');
  }
  outCtx.imageSmoothingEnabled = false;

  const tiles: Record<number, TileDefinition> = {};
  const prefix = slugPart(idPrefix || `${terrainAId}-${terrainBId}-${preset}`) || 'autotile';

  let tileIndex = 0;
  for (let p = 0; p < patterns.length; p++) {
    const pattern = patterns[p];
    for (let variant = 0; variant < safeVariants; variant++) {
      const aTile = pickByIndex(aSourceTiles, p + variant);
      const bTile = pickByIndex(bSourceTiles, p * 3 + variant);
      const out = composeTilePixels(pattern.corners, aTile.data, bTile.data, tileSize);

      const outX = (tileIndex % columns) * tileSize;
      const outY = Math.floor(tileIndex / columns) * tileSize;
      outCtx.putImageData(new ImageData(out, tileSize, tileSize), outX, outY);

      tiles[tileIndex] = {
        id: buildOutputTileId(prefix, pattern, variant, safeVariants),
        spriteIndex: tileIndex,
        collision: { type: 'none' },
        terrainCorners: toTerrainCorners(pattern.corners, terrainAId, terrainBId),
        ...(safeVariants > 1 ? { probability: 1 } : {}),
      };

      tileIndex++;
    }
  }

  const pngBlob = await canvasToPngBlob(outCanvas);

  return {
    pngBlob,
    tileCount,
    columns,
    rows,
    patterns,
    tiles,
  };
}
