import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Building } from '../../../types/building';
import type { BuildingInstance, Layer } from '../../../types/schema';
import { exteriorCanvas } from '../../../lib/buildings/render';
import { exteriorBounds } from '../../../lib/buildings/mapPlacement';
import { STOREY_ROWS } from '../../../lib/buildings/layout';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';

const SELECTION_COLOR = 0xffffff;
const DOOR_COLOR = 0xfacc15;
const REFUSED_COLOR = 0xef4444;
const UNREAD_COLOR = 0x94a3b8;

const textures = new WeakMap<HTMLCanvasElement, Texture>();

function textureOf(canvas: HTMLCanvasElement): Texture {
  let texture = textures.get(canvas);
  if (!texture) {
    texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    textures.set(canvas, texture);
  }
  return texture;
}

/**
 * The building's exterior, its origin at the image's top-left (3 rows above the footprint); an outline of the
 * footprint until its kit can be read.
 */
function exteriorView(
  building: Building,
  instance: BuildingInstance,
  variationChain: readonly string[],
  tileSize: number,
): Container {
  const view = new Container();
  const bounds = exteriorBounds(building, instance);
  view.x = bounds.x * tileSize;
  view.y = bounds.y * tileSize;
  const resolved = useResolvedKitsStore.getState().kits[building.kit];
  if (resolved?.status === 'ready') {
    const sprite = new Sprite(textureOf(exteriorCanvas(building, resolved.kit, variationChain)));
    sprite.width = bounds.width * tileSize;
    sprite.height = bounds.height * tileSize;
    view.addChild(sprite);
  } else {
    view.addChild(footprintOutline(building, tileSize, UNREAD_COLOR));
  }
  return view;
}

/** The footprint's outline, in the exterior view's coordinates. */
function footprintOutline(building: Building, tileSize: number, color: number): Graphics {
  const outline = new Graphics();
  outline.rect(0, STOREY_ROWS * tileSize, building.width * tileSize, building.depth * tileSize);
  outline.stroke({ width: 2, color, alpha: 0.95 });
  return outline;
}

/** Doors in the south wall, in the exterior view's coordinates. */
function doorMarkers(building: Building, tileSize: number): Graphics {
  const markers = new Graphics();
  for (const opening of building.openings)
    if (opening.kind === 'door' && opening.y === building.depth - 1)
      markers.rect(opening.x * tileSize, (STOREY_ROWS + opening.y) * tileSize, tileSize, tileSize);
  markers.stroke({ width: 2, color: DOOR_COLOR, alpha: 0.95 });
  return markers;
}

/** A building layer: its buildings drawn back to front, the selected one with its footprint and doors marked. */
export function buildingLayerView(
  layer: Layer,
  variationChain: readonly string[],
  selectedInstanceId: string | null,
  tileSize: number,
): Container {
  const { buildings } = useEditorStore.getState();
  const container = new Container();
  const placed = (layer.buildings ?? []).flatMap((instance) => {
    const building = buildings.find((entry) => entry.id === instance.buildingId);
    return building ? [{ instance, building }] : [];
  });
  placed
    .sort((a, b) => a.instance.y + a.building.depth - (b.instance.y + b.building.depth))
    .forEach(({ instance, building }) => {
      const view = exteriorView(building, instance, variationChain, tileSize);
      if (instance.id === selectedInstanceId) {
        view.addChild(footprintOutline(building, tileSize, SELECTION_COLOR));
        view.addChild(doorMarkers(building, tileSize));
      }
      container.addChild(view);
    });
  return container;
}

/** The building about to be placed at `origin`, its footprint outlined red when it cannot be placed. */
export function buildingGhost(
  building: Building,
  origin: { x: number; y: number },
  variationChain: readonly string[],
  refused: boolean,
  tileSize: number,
): Container {
  const view = exteriorView(
    building,
    { id: '', buildingId: building.id, ...origin },
    variationChain,
    tileSize,
  );
  view.alpha = refused ? 0.35 : 0.7;
  if (refused) view.addChild(footprintOutline(building, tileSize, REFUSED_COLOR));
  return view;
}
