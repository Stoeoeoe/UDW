import { splitTileRef } from '../../../lib/tileRef';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { shapeToNormalizedPolygon } from '../../../lib/collisionUtils';
import { EDITOR_CANVAS_HEX } from '../../../lib/editorColors';
import {
  computeObjectInstanceSortDepth,
  expandObjectInstanceSpriteTiles,
  indexObjects,
  type ObjectIndex,
} from '../../../lib/mapObjects';
import { resolveMapContext, resolveTileAt } from '../../../lib/mapUtils';
import type { Map as GameMap, SortingLayer, Tileset } from '../../../types/schema';
import { bakeLayerCanvas, getRenderableMapLayers } from './mapThreeUtils';

type Direction = 'down' | 'up' | 'left' | 'right';
type Motion = 'idle' | 'walk' | 'run';

interface AnimationConfig {
  frames: number;
  fps: number;
  src: string;
}

interface BakedLayerTexture {
  key: string;
  canvas: HTMLCanvasElement;
  depth: number;
}

interface ObjectTileSprite {
  textureKey: string;
  sourceCanvas: HTMLCanvasElement;
  worldX: number;
  worldY: number;
  depth: number;
}

const GROUND_DEPTH_BASE = 0;
const ABOVE_DEPTH_BASE = 100_000;

function resolveSortingLayer(sortingLayer: SortingLayer | undefined): SortingLayer {
  return sortingLayer ?? 'ground';
}

type CollisionBodySpec =
  | {
      kind: 'rectangle';
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: 'polygon';
      x: number;
      y: number;
      vertices: { x: number; y: number }[];
    };

const CHARACTER_CELL_SIZE = 48;
const CHARACTER_ROWS: Record<Direction, number> = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

// TODO: move test mode speed, zoom, and collider size into editor settings once preview/runtime settings exist.
const TEST_MODE_WALK_SPEED_TILES = 4;
const TEST_MODE_RUN_MULTIPLIER = 2.5;
const TEST_MODE_CAMERA_ZOOM = 2.5;
const TEST_MODE_COLLIDER_WIDTH = 14;
const TEST_MODE_COLLIDER_HEIGHT = 10;
const TEST_MODE_COLLIDER_OFFSET_Y = 23;

const PHASER_TEXTURE_KEYS: Record<Motion, string> = {
  idle: 'map-test-idle',
  walk: 'map-test-walk',
  run: 'map-test-run',
};

const ANIMATION_CONFIG: Record<Motion, AnimationConfig> = {
  idle: {
    frames: 4,
    fps: 4,
    src: '/walk-test-mode/TestCharacterIdle.png',
  },
  walk: {
    frames: 6,
    fps: 8,
    src: '/walk-test-mode/TestCharacterWalk.png',
  },
  run: {
    frames: 6,
    fps: 12,
    src: '/walk-test-mode/TestCharacterRun.png',
  },
};

function getEffectiveTileset(
  currentMap: GameMap,
  activeVariationId: string | null,
  resolvedTilesetId: string,
  originalTileset: Tileset,
  tilesets: Map<string, Tileset>,
) {
  let effectiveTileset = tilesets.get(resolvedTilesetId) || originalTileset;
  const variation = currentMap.variations?.find((item) => item.id === activeVariationId);
  if (variation?.tilesetSuffix) {
    const suffixedTileset = tilesets.get(`${resolvedTilesetId}${variation.tilesetSuffix}`);
    if (suffixedTileset) {
      effectiveTileset = suffixedTileset;
    }
  }
  return effectiveTileset;
}

function createBakedLayerTextures(
  currentMap: GameMap | null,
  visibleLayers: ReturnType<typeof getRenderableMapLayers>,
  activeVariationId: string | null,
  projectTileSize: number,
  tilesets: Map<string, Tileset>,
  loadedSprites: ReturnType<typeof useEditorStore.getState>['loadedSprites'],
) {
  if (!currentMap) {
    return [] as BakedLayerTexture[];
  }

  return visibleLayers
    .filter((layer) => layer.kind !== 'object')
    .map((layer) => {
      const canvas = bakeLayerCanvas(
        layer,
        currentMap.width,
        currentMap.height,
        projectTileSize,
        currentMap,
        tilesets,
        loadedSprites,
        activeVariationId,
      );

      if (!canvas) {
        return null;
      }

      const sorting = resolveSortingLayer(layer.sortingLayer);
      const depth =
        sorting === 'above' ? ABOVE_DEPTH_BASE + layer.zOrder : GROUND_DEPTH_BASE + layer.zOrder;

      return {
        key: `map-test-layer-${layer.id}`,
        canvas,
        depth,
      } satisfies BakedLayerTexture;
    })
    .filter((value): value is BakedLayerTexture => value !== null);
}

function createObjectTileSprites(
  currentMap: GameMap | null,
  visibleLayers: ReturnType<typeof getRenderableMapLayers>,
  activeVariationId: string | null,
  projectTileSize: number,
  tilesets: Map<string, Tileset>,
  objects: ObjectIndex,
  loadedSprites: ReturnType<typeof useEditorStore.getState>['loadedSprites'],
): ObjectTileSprite[] {
  if (!currentMap) return [];

  const sprites: ObjectTileSprite[] = [];
  const cellCanvasCache = new Map<string, HTMLCanvasElement>();

  for (const layer of visibleLayers) {
    if (layer.kind !== 'object') continue;

    const objectDepthByTile = new Map<string, number>();
    for (const objectInstance of layer.objectInstances ?? []) {
      const depth = computeObjectInstanceSortDepth(
        objects,
        tilesets,
        layer,
        objectInstance,
        projectTileSize,
      );
      const tiles = expandObjectInstanceSpriteTiles(objects, objectInstance, projectTileSize);
      for (const tile of tiles) {
        objectDepthByTile.set(`${tile.x},${tile.y}`, depth);
      }
    }

    const renderableTiles = (layer.objectInstances ?? []).flatMap((objectInstance) =>
      expandObjectInstanceSpriteTiles(objects, objectInstance, projectTileSize),
    );
    for (const tile of renderableTiles) {
      const tileset = tilesets.get(tile.tilesetId);
      if (!tileset) continue;

      const variation = currentMap.variations?.find((item) => item.id === activeVariationId);
      let effectiveTileset = tileset;
      if (variation?.tilesetSuffix) {
        const suffixed = tilesets.get(`${tile.tilesetId}${variation.tilesetSuffix}`);
        if (suffixed) effectiveTileset = suffixed;
      }

      const spriteImage = loadedSprites.get(effectiveTileset.spriteSheet);
      if (!spriteImage) continue;

      const cacheKey = `${effectiveTileset.id}:${tile.tileIndex}`;
      let tileCanvas = cellCanvasCache.get(cacheKey);
      if (!tileCanvas) {
        const canvas = document.createElement('canvas');
        canvas.width = projectTileSize;
        canvas.height = projectTileSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const sx = (tile.tileIndex % effectiveTileset.columns) * projectTileSize;
        const sy = Math.floor(tile.tileIndex / effectiveTileset.columns) * projectTileSize;
        ctx.drawImage(
          spriteImage,
          sx,
          sy,
          projectTileSize,
          projectTileSize,
          0,
          0,
          projectTileSize,
          projectTileSize,
        );
        cellCanvasCache.set(cacheKey, canvas);
        tileCanvas = canvas;
      }

      const fallbackPivotY = effectiveTileset.tiles[tile.tileIndex]?.pivotY ?? 1;
      sprites.push({
        textureKey: `map-test-obj-${cacheKey}`,
        sourceCanvas: tileCanvas,
        worldX: tile.x,
        worldY: tile.y,
        depth:
          objectDepthByTile.get(`${tile.x},${tile.y}`) ??
          tile.y + fallbackPivotY * projectTileSize + layer.zOrder,
      });
    }
  }

  return sprites;
}

function createCollisionBodies(
  currentMap: GameMap | null,
  visibleLayers: ReturnType<typeof getRenderableMapLayers>,
  activeVariationId: string | null,
  tilesets: Map<string, Tileset>,
  objects: ObjectIndex,
  tileSize: number,
) {
  if (!currentMap) {
    return [] as CollisionBodySpec[];
  }

  const effectiveMap = resolveMapContext(currentMap, activeVariationId);
  const bodies: CollisionBodySpec[] = [];

  for (const layer of visibleLayers) {
    if (layer.kind !== 'visual' && layer.kind !== 'object') {
      continue;
    }

    for (let y = 0; y < currentMap.height; y += 1) {
      for (let x = 0; x < currentMap.width; x += 1) {
        const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId, objects);
        if (!tileRef) {
          continue;
        }

        const [tilesetId, tileIndexText] = splitTileRef(tileRef);
        const tileIndex = Number.parseInt(tileIndexText, 10);
        const originalTileset = tilesets.get(tilesetId);
        if (!originalTileset || Number.isNaN(tileIndex)) {
          continue;
        }

        const resolvedTilesetId =
          tilesetId === currentMap.baseTilesetId ? effectiveMap.baseTilesetId : tilesetId;
        const effectiveTileset = getEffectiveTileset(
          currentMap,
          activeVariationId,
          resolvedTilesetId,
          originalTileset,
          tilesets,
        );
        const collision = effectiveTileset.tiles[tileIndex]?.collision;
        if (!collision || collision.type === 'none') {
          continue;
        }

        const tileLeft = x * tileSize;
        const tileTop = y * tileSize;

        if (collision.type === 'full') {
          bodies.push({
            kind: 'rectangle',
            x: tileLeft + tileSize / 2,
            y: tileTop + tileSize / 2,
            width: tileSize,
            height: tileSize,
          });
          continue;
        }

        for (const shape of collision.shapes || []) {
          const normalizedPolygon = shapeToNormalizedPolygon(shape, tileSize);
          if (normalizedPolygon.length < 3) {
            continue;
          }

          const absoluteVertices = normalizedPolygon.map(([pointX, pointY]) => ({
            x: tileLeft + pointX * tileSize,
            y: tileTop + pointY * tileSize,
          }));
          const minX = Math.min(...absoluteVertices.map((vertex) => vertex.x));
          const minY = Math.min(...absoluteVertices.map((vertex) => vertex.y));
          const maxX = Math.max(...absoluteVertices.map((vertex) => vertex.x));
          const maxY = Math.max(...absoluteVertices.map((vertex) => vertex.y));
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;

          bodies.push({
            kind: 'polygon',
            x: centerX,
            y: centerY,
            vertices: absoluteVertices.map((vertex) => ({
              x: vertex.x - centerX,
              y: vertex.y - centerY,
            })),
          });
        }
      }
    }
  }

  // Spatial primitive collisions from the collision layer
  const spatialCollisions = currentMap.spatialPrimitives?.collisions ?? [];
  for (const col of spatialCollisions) {
    if (col.shape === 'rectangle' && col.size) {
      const [x, y] = col.position;
      const [w, h] = col.size;
      bodies.push({ kind: 'rectangle', x: x + w / 2, y: y + h / 2, width: w, height: h });
    } else if (col.shape === 'circle' && col.radius != null) {
      const [cx, cy] = col.position;
      const r = col.radius;
      const count = 16;
      const vertices = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      });
      bodies.push({ kind: 'polygon', x: cx, y: cy, vertices });
    } else if (col.shape === 'polygon' && col.points && col.points.length >= 3) {
      const xs = col.points.map(([px]) => px);
      const ys = col.points.map(([, py]) => py);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const vertices = col.points.map(([px, py]) => ({ x: px - cx, y: py - cy }));
      bodies.push({ kind: 'polygon', x: cx, y: cy, vertices });
    }
  }

  return bodies;
}

function createAnimationKey(motion: Motion, direction: Direction) {
  return `map-test-${motion}-${direction}`;
}

function ensureAnimations(scene: Phaser.Scene) {
  (Object.keys(ANIMATION_CONFIG) as Motion[]).forEach((motion) => {
    (Object.keys(CHARACTER_ROWS) as Direction[]).forEach((direction) => {
      const key = createAnimationKey(motion, direction);
      if (scene.anims.exists(key)) {
        return;
      }

      const config = ANIMATION_CONFIG[motion];
      const startFrame = CHARACTER_ROWS[direction] * config.frames;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(PHASER_TEXTURE_KEYS[motion], {
          start: startFrame,
          end: startFrame + config.frames - 1,
        }),
        frameRate: config.fps,
        repeat: -1,
      });
    });
  });
}

function normalizeDirection(x: number, y: number, previous: Direction): Direction {
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? 'right' : 'left';
  }
  if (Math.abs(y) > 0) {
    return y > 0 ? 'down' : 'up';
  }
  return previous;
}

export const MapTestModeView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);

  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const tilesets = useEditorStore((state) => state.tilesets);
  const objects = useEditorStore((state) => state.objects);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);

  const mapWidthPx = (currentMap?.width ?? 0) * projectTileSize;
  const mapHeightPx = (currentMap?.height ?? 0) * projectTileSize;
  const visibleLayers = useMemo(
    () => getRenderableMapLayers(currentMap?.layers ?? []),
    [currentMap?.layers],
  );
  const bakedLayers = useMemo(
    () =>
      createBakedLayerTextures(
        currentMap,
        visibleLayers,
        activeVariationId,
        projectTileSize,
        tilesets,
        loadedSprites,
      ),
    [activeVariationId, currentMap, loadedSprites, projectTileSize, tilesets, visibleLayers],
  );
  const objectTileSprites = useMemo(
    () =>
      createObjectTileSprites(
        currentMap,
        visibleLayers,
        activeVariationId,
        projectTileSize,
        tilesets,
        indexObjects(objects),
        loadedSprites,
      ),
    [activeVariationId, currentMap, loadedSprites, objects, projectTileSize, tilesets, visibleLayers],
  );
  const collisionBodies = useMemo(
    () =>
      createCollisionBodies(
        currentMap,
        visibleLayers,
        activeVariationId,
        tilesets,
        indexObjects(objects),
        projectTileSize,
      ),
    [activeVariationId, currentMap, objects, projectTileSize, tilesets, visibleLayers],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !currentMap || bakedLayers.length === 0) {
      setRuntimeReady(false);
      return;
    }

    setRuntimeReady(false);

    class MapTestScene extends Phaser.Scene {
      private playerSprite?: Phaser.GameObjects.Sprite;
      private playerBody?: MatterJS.BodyType;
      private direction: Direction = 'down';
      private motion: Motion = 'idle';
      private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
      private keys?: {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        run: Phaser.Input.Keyboard.Key;
      };

      preload() {
        (Object.keys(ANIMATION_CONFIG) as Motion[]).forEach((motion) => {
          const config = ANIMATION_CONFIG[motion];
          this.load.spritesheet(PHASER_TEXTURE_KEYS[motion], config.src, {
            frameWidth: CHARACTER_CELL_SIZE,
            frameHeight: CHARACTER_CELL_SIZE,
          });
        });
      }

      create() {
        bakedLayers.forEach((layer) => {
          this.textures.addCanvas(layer.key, layer.canvas);
          const image = this.add.image(mapWidthPx / 2, mapHeightPx / 2, layer.key);
          image.setDepth(layer.depth);
          image.setOrigin(0.5, 0.5);
        });

        objectTileSprites.forEach((obj) => {
          if (!this.textures.exists(obj.textureKey)) {
            this.textures.addCanvas(obj.textureKey, obj.sourceCanvas);
          }
          const image = this.add.image(obj.worldX, obj.worldY, obj.textureKey);
          image.setOrigin(0, 0);
          image.setDepth(obj.depth);
        });

        this.matter.world.setBounds(0, 0, mapWidthPx, mapHeightPx, 64, true, true, true, true);
        collisionBodies.forEach((body) => {
          if (body.kind === 'rectangle') {
            this.matter.add.rectangle(body.x, body.y, body.width, body.height, {
              isStatic: true,
              label: 'map-test-collision',
            });
            return;
          }

          const createdBody = this.matter.add.fromVertices(
            body.x,
            body.y,
            [body.vertices],
            {
              isStatic: true,
              label: 'map-test-collision',
            },
            true,
          );
          if (Array.isArray(createdBody)) {
            createdBody.forEach((item) => this.matter.world.add(item));
          }
        });

        ensureAnimations(this);

        this.playerBody = this.matter.add.rectangle(
          mapWidthPx / 2,
          mapHeightPx / 2 + TEST_MODE_COLLIDER_OFFSET_Y,
          TEST_MODE_COLLIDER_WIDTH,
          TEST_MODE_COLLIDER_HEIGHT,
          {
            friction: 0,
            frictionAir: 0.08,
            restitution: 0,
            label: 'map-test-player',
          },
        );
        this.matter.body.setInertia(this.playerBody, Infinity);

        this.playerSprite = this.add.sprite(
          mapWidthPx / 2,
          mapHeightPx / 2,
          PHASER_TEXTURE_KEYS.idle,
        );
        this.playerSprite.setDepth(
          mapHeightPx / 2 - TEST_MODE_COLLIDER_OFFSET_Y + CHARACTER_CELL_SIZE / 2,
        );
        this.playerSprite.play(createAnimationKey('idle', 'down'));

        this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
        this.cameras.main.setZoom(TEST_MODE_CAMERA_ZOOM);
        this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
        this.cameras.main.roundPixels = true;

        this.cursors = this.input.keyboard?.createCursorKeys();
        this.keys = this.input.keyboard?.addKeys({
          up: Phaser.Input.Keyboard.KeyCodes.W,
          down: Phaser.Input.Keyboard.KeyCodes.S,
          left: Phaser.Input.Keyboard.KeyCodes.A,
          right: Phaser.Input.Keyboard.KeyCodes.D,
          run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        }) as MapTestScene['keys'];

        setRuntimeReady(true);
      }

      update() {
        if (!this.playerBody || !this.playerSprite || !this.cursors || !this.keys) {
          return;
        }

        const horizontal =
          (this.cursors.right.isDown || this.keys.right.isDown ? 1 : 0) -
          (this.cursors.left.isDown || this.keys.left.isDown ? 1 : 0);
        const vertical =
          (this.cursors.down.isDown || this.keys.down.isDown ? 1 : 0) -
          (this.cursors.up.isDown || this.keys.up.isDown ? 1 : 0);
        const isMoving = horizontal !== 0 || vertical !== 0;
        const isRunning = this.cursors.shift.isDown || this.keys.run.isDown;

        let velocityX = 0;
        let velocityY = 0;
        if (isMoving) {
          const magnitude = Math.hypot(horizontal, vertical) || 1;
          const speedPerStep =
            (projectTileSize *
              TEST_MODE_WALK_SPEED_TILES *
              (isRunning ? TEST_MODE_RUN_MULTIPLIER : 1)) /
            60;
          velocityX = (horizontal / magnitude) * speedPerStep;
          velocityY = (vertical / magnitude) * speedPerStep;
          this.direction = normalizeDirection(horizontal, vertical, this.direction);
        }

        this.matter.body.setVelocity(this.playerBody, {
          x: velocityX,
          y: velocityY,
        });

        const nextMotion: Motion = isMoving ? (isRunning ? 'run' : 'walk') : 'idle';
        if (nextMotion !== this.motion || isMoving) {
          const animationKey = createAnimationKey(nextMotion, this.direction);
          if (this.playerSprite.anims.currentAnim?.key !== animationKey) {
            this.playerSprite.play(animationKey, true);
          }
          this.motion = nextMotion;
        }

        this.playerSprite.setPosition(
          this.playerBody.position.x,
          this.playerBody.position.y - TEST_MODE_COLLIDER_OFFSET_Y,
        );
        // Feet Y = sprite center Y + half sprite height. Sprite center is
        // TEST_MODE_COLLIDER_OFFSET_Y above the physics body center.
        const playerFeetY =
          this.playerBody.position.y - TEST_MODE_COLLIDER_OFFSET_Y + CHARACTER_CELL_SIZE / 2;
        this.playerSprite.setDepth(playerFeetY);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: EDITOR_CANVAS_HEX,
      transparent: false,
      scene: MapTestScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
      physics: {
        default: 'matter',
        matter: {
          gravity: { x: 0, y: 0 },
          enableSleeping: false,
        },
      },
    });

    gameRef.current = game;

    return () => {
      setRuntimeReady(false);
      game.destroy(true);
      gameRef.current = null;
    };
  }, [
    bakedLayers,
    collisionBodies,
    currentMap,
    mapHeightPx,
    mapWidthPx,
    objectTileSprites,
    projectTileSize,
  ]);

  return (
    <Box w="full" h="full" position="relative" overflow="hidden" bg="editorCanvasBg">
      <Box ref={containerRef} w="full" h="full" />

      <Box
        position="absolute"
        top={3}
        left={3}
        bg="blackAlpha.700"
        borderRadius="lg"
        border="1px solid"
        borderColor="whiteAlpha.100"
        p={3}
        pointerEvents="none"
        backdropFilter="blur(4px)"
      >
        <VStack spacing={1} align="start">
          <Text fontSize="10px" color="gray.200" fontWeight="bold">
            Map Test Mode
          </Text>
          <HStack spacing={2} color="gray.400" fontSize="10px">
            <Text>Runtime: Phaser + Matter</Text>
            <Text>Move: WASD / Arrows</Text>
            <Text>Run: Shift</Text>
          </HStack>
          <Text fontSize="10px" color="gray.500">
            Depth sort: Y-based (objects + player)
          </Text>
          {!runtimeReady && (
            <Text fontSize="10px" color="orange.300">
              Starting test runtime...
            </Text>
          )}
        </VStack>
      </Box>
    </Box>
  );
};

export default MapTestModeView;
