import {
  Aseprite,
  AsepriteColorDepth,
  AsepriteLayerBlendMode,
  type AsepritePixel,
} from '@pixelation/aseprite';

const ASEPRITE_EXTENSIONS = ['.ase', '.aseprite'];

export interface ResolvedSpriteAsset {
  imageBlob: Blob;
  width: number;
  height: number;
}

export function isAsepriteAssetPath(path: string): boolean {
  const normalized = path.split('?')[0].split('#')[0].toLowerCase();
  return ASEPRITE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export async function resolveSpriteAsset(
  path: string,
  sourceBlob: Blob,
): Promise<ResolvedSpriteAsset> {
  if (isAsepriteAssetPath(path)) {
    return renderAsepriteToPng(sourceBlob);
  }

  const { width, height } = await readImageDimensions(sourceBlob);
  return {
    imageBlob: sourceBlob,
    width,
    height,
  };
}

async function renderAsepriteToPng(sourceBlob: Blob): Promise<ResolvedSpriteAsset> {
  const file = new Aseprite(await sourceBlob.arrayBuffer());
  const frame = file.frames[0];

  if (!frame) {
    throw new Error('Aseprite file does not contain any frames.');
  }

  const rootCanvas = createCanvas(file.width, file.height);
  const rootContext = rootCanvas.getContext('2d');
  if (!rootContext) {
    throw new Error('Failed to create 2D canvas context for Aseprite rendering.');
  }

  for (const layer of frame.layers) {
    if (!layer.visible || layer.opacity <= 0 || layer.cels.length === 0) continue;

    const layerBlend = toCanvasBlendMode(layer.blend);
    const sortedCels = [...layer.cels].sort((a, b) => a.z - b.z);

    for (const cel of sortedCels) {
      if (!cel.pixels || cel.width <= 0 || cel.height <= 0 || cel.opacity <= 0) continue;

      const celCanvas = createCanvas(cel.width, cel.height);
      const celContext = celCanvas.getContext('2d');
      if (!celContext) continue;

      const pixelBuffer = buildCelRgbaBuffer(file, cel.pixels);
      const imageData = new ImageData(cel.width, cel.height);
      imageData.data.set(pixelBuffer);
      celContext.putImageData(imageData, 0, 0);

      rootContext.globalCompositeOperation = layerBlend;
      rootContext.globalAlpha = clamp01((layer.opacity / 255) * (cel.opacity / 255));
      rootContext.drawImage(celCanvas, cel.x, cel.y);
    }
  }

  rootContext.globalAlpha = 1;
  rootContext.globalCompositeOperation = 'source-over';

  return {
    imageBlob: await canvasToPngBlob(rootCanvas),
    width: file.width,
    height: file.height,
  };
}

function buildCelRgbaBuffer(file: Aseprite, pixels: AsepritePixel[]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels.length * 4);

  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a] = toRgba(file, pixels[i]);
    const offset = i * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = a;
  }

  return rgba;
}

function toRgba(file: Aseprite, pixel: AsepritePixel): [number, number, number, number] {
  if (file.header.depth === AsepriteColorDepth.Rgba) {
    const [r, g, b, a] = pixel as [number, number, number, number];
    return [r, g, b, a];
  }

  if (file.header.depth === AsepriteColorDepth.Grayscale) {
    const [gray, alpha] = pixel as [number, number];
    return [gray, gray, gray, alpha];
  }

  const paletteIndex = pixel as number;
  if (paletteIndex === file.header.transparency) {
    return [0, 0, 0, 0];
  }

  const paletteEntry = file.palette[paletteIndex] ?? file.palette[String(paletteIndex)];
  if (!paletteEntry) {
    return [0, 0, 0, 0];
  }

  return [paletteEntry.red, paletteEntry.green, paletteEntry.blue, paletteEntry.alpha];
}

function toCanvasBlendMode(blendMode: AsepriteLayerBlendMode): GlobalCompositeOperation {
  switch (blendMode) {
    case AsepriteLayerBlendMode.Multiply:
      return 'multiply';
    case AsepriteLayerBlendMode.Screen:
      return 'screen';
    case AsepriteLayerBlendMode.Overlay:
      return 'overlay';
    case AsepriteLayerBlendMode.Darken:
      return 'darken';
    case AsepriteLayerBlendMode.Lighten:
      return 'lighten';
    case AsepriteLayerBlendMode.ColorDodge:
      return 'color-dodge';
    case AsepriteLayerBlendMode.ColorBurn:
      return 'color-burn';
    case AsepriteLayerBlendMode.HardLight:
      return 'hard-light';
    case AsepriteLayerBlendMode.SoftLight:
      return 'soft-light';
    case AsepriteLayerBlendMode.Difference:
      return 'difference';
    case AsepriteLayerBlendMode.Exclusion:
      return 'exclusion';
    case AsepriteLayerBlendMode.Hue:
      return 'hue';
    case AsepriteLayerBlendMode.Saturation:
      return 'saturation';
    case AsepriteLayerBlendMode.Color:
      return 'color';
    case AsepriteLayerBlendMode.Luminosity:
      return 'luminosity';
    case AsepriteLayerBlendMode.Addition:
      return 'lighter';
    default:
      return 'source-over';
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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
        reject(new Error('Failed to encode rendered Aseprite image to PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to decode image.'));
    });

    return { width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
