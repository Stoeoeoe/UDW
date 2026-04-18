import * as THREE from 'three';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveTileAt } from '../../../lib/mapUtils';
import type { Layer } from '../../../types/schema';

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

export function getRenderableMapLayers(layers: Layer[]): Layer[] {
  return layers
    .filter(
      (layer) => (layer.kind === 'visual' || layer.kind === 'terrain') && layer.visible !== false,
    )
    .sort((a, b) => a.zOrder - b.zOrder);
}

export function configurePixelArtTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.needsUpdate = true;
}

export function bakeLayerCanvas(
  layer: Layer,
  mapW: number,
  mapH: number,
  tileSize: number,
  currentMap: NonNullable<EditorStoreState['currentMap']>,
  tilesets: EditorStoreState['tilesets'],
  loadedSprites: EditorStoreState['loadedSprites'],
  activeVariationId: string | null,
): HTMLCanvasElement | null {
  const pw = mapW * tileSize;
  const ph = mapH * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, pw, ph);

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
      if (!tileRef) continue;

      const [tilesetId, indexStr] = tileRef.split(':');
      const index = Number.parseInt(indexStr, 10);
      const tileset = tilesets.get(tilesetId);
      if (!tileset) continue;

      const variation = currentMap.variations?.find((item) => item.id === activeVariationId);
      let effectiveTileset = tileset;
      if (variation?.tilesetSuffix) {
        const suffixedTileset = tilesets.get(`${tilesetId}${variation.tilesetSuffix}`);
        if (suffixedTileset) {
          effectiveTileset = suffixedTileset;
        }
      }

      const sprite = loadedSprites.get(effectiveTileset.spriteSheet);
      if (!sprite) continue;

      const sourceX = (index % effectiveTileset.columns) * tileSize;
      const sourceY = Math.floor(index / effectiveTileset.columns) * tileSize;
      ctx.drawImage(
        sprite,
        sourceX,
        sourceY,
        tileSize,
        tileSize,
        x * tileSize,
        y * tileSize,
        tileSize,
        tileSize,
      );
    }
  }

  return canvas;
}
