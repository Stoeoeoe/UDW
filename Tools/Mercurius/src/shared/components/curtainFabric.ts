import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';

const size = 512;
const threadCount = 128;
const keySegments = [
  [0, 0.9, 0.88, 0.9],
  [0.88, 0.9, 0.88, 0.1],
  [0.88, 0.1, 0.12, 0.1],
  [0.12, 0.1, 0.12, 0.7],
  [0.12, 0.7, 0.64, 0.7],
  [0.64, 0.7, 0.64, 0.3],
  [0.64, 0.3, 0.37, 0.3],
  [0.37, 0.3, 0.37, 0.5],
] as const;
const meander = (x: number, y: number) =>
  keySegments.some(([ax, ay, bx, by]) =>
    ax === bx
      ? Math.abs(x - ax) < 0.035 &&
        y >= Math.min(ay, by) - 0.035 &&
        y <= Math.max(ay, by) + 0.035
      : Math.abs(y - ay) < 0.035 &&
        x >= Math.min(ax, bx) - 0.035 &&
        x <= Math.max(ax, bx) + 0.035,
  );
const fraction = (value: number) => value - Math.floor(value);
const hash = (x: number, y: number, seed: number) => {
  let value =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(seed + 1, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

const noise = (u: number, v: number, cells: number, seed: number) => {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fraction(x);
  const fy = fraction(y);
  const tx = fx * fx * (3 - 2 * fx);
  const ty = fy * fy * (3 - 2 * fy);
  const a = hash(ix % cells, iy % cells, seed);
  const b = hash((ix + 1) % cells, iy % cells, seed);
  const c = hash(ix % cells, (iy + 1) % cells, seed);
  const d = hash((ix + 1) % cells, (iy + 1) % cells, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
};

const texture = (data: Uint8Array) => {
  const map = new DataTexture(data, size, size, RGBAFormat);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.repeat.set(1, 3);
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
};

// Plain-woven linen: alternating warp/weft crowns, uneven yarn thickness,
// small slubs, and broad dye variation. All fields tile and use fixed seeds.
export const makeCurtainFabric = (side: number, accent = '#742d32') => {
  const trim = [1, 3, 5].map((start) =>
    parseInt(accent.slice(start, start + 2), 16),
  );
  const colour = new Uint8Array(size * size * 4);
  const height = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const warp = u * threadCount;
      const weft = v * threadCount;
      const warpIndex = Math.floor(warp);
      const weftIndex = Math.floor(weft);
      const warpShift = (hash(warpIndex, 1, side) - 0.5) * 0.2;
      const weftShift = (hash(1, weftIndex, side) - 0.5) * 0.2;
      const warpCrown = Math.pow(
        Math.sin(Math.PI * fraction(warp + warpShift)),
        0.75,
      );
      const weftCrown = Math.pow(
        Math.sin(Math.PI * fraction(weft + weftShift)),
        0.75,
      );
      const over = (warpIndex + weftIndex) % 2 === 0;
      const crown = over ? warpCrown : weftCrown;
      const under = over ? weftCrown : warpCrown;
      const grain = hash(x, y, side + 17);
      const slub = Math.pow(noise(u, v, 32, side + 9), 3);
      const elevation =
        0.18 + crown * 0.42 + under * 0.12 + grain * 0.08 + slub * 0.12;
      const dye =
        noise(u, v, 4, side + 3) * 0.65 + noise(u, v, 12, side + 7) * 0.35;
      const tone =
        0.8 + elevation * 0.22 + (dye - 0.5) * 0.14 + (grain - 0.5) * 0.06;
      const i = (y * size + x) * 4;
      let pigment = [183 + slub * 8, 130 + slub * 3, 53];
      if (u > 0.835) {
        pigment = trim;
        if ((u > 0.84 && u < 0.853) || (u > 0.975 && u < 0.988))
          pigment = [235, 208, 153];
        if (
          u > 0.865 &&
          u < 0.965 &&
          meander((u - 0.865) / 0.1, fraction(v * 8))
        )
          pigment = [243, 227, 188];
      }
      colour.set(
        [pigment[0] * tone, pigment[1] * tone, pigment[2] * tone, 255],
        i,
      );
      const bump = elevation * 255;
      height.set([bump, bump, bump, 255], i);
    }
  const maps = {
    colour: texture(colour),
    height: texture(height),
  };
  maps.colour.colorSpace = SRGBColorSpace;
  return maps;
};
