import { fileSystem } from '../fileSystem';
import { resolveSpriteAsset } from '../asepriteUtils';
import type { BuildingKit } from '../../types/building';
import { resolveKit, type PixelSheet, type ResolvedKit } from './resolveKit';

/** Reads a project image (PNG as is, Aseprite flattened) into pixels. */
export async function loadPixelSheet(path: string): Promise<PixelSheet> {
  const resolved = await resolveSpriteAsset(path, await fileSystem.loadAsset(path));
  const bitmap = await createImageBitmap(resolved.imageBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read the image.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}

/** Loads a kit's base and variation sheets and cuts them into pieces. */
export async function loadKit(kit: BuildingKit): Promise<ResolvedKit> {
  const base = await loadPixelSheet(kit.source);
  const variations: Record<string, PixelSheet> = {};
  for (const [id, path] of Object.entries(kit.variations ?? {}))
    variations[id] = await loadPixelSheet(path);
  return resolveKit(base, variations);
}

/**
 * Lets the user pick a sheet and returns its project-relative path. A file inside the project is used where it is;
 * one from elsewhere is copied into `assets/kits`.
 */
export async function chooseKitSheet(projectPath: string): Promise<string | null> {
  const selected = await fileSystem.selectAsset();
  if (!selected) return null;
  const normalize = (path: string) => path.replace(/\\/g, '/');
  const root = `${normalize(projectPath).replace(/\/$/, '')}/`;
  const file = normalize(selected);
  if (file.toLowerCase().startsWith(root.toLowerCase())) return file.slice(root.length);
  const blob = await fileSystem.readFileAsBlob(selected);
  return fileSystem.saveAsset(file.split('/').pop()!, blob, 'kits');
}
