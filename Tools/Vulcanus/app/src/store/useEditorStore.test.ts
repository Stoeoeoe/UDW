import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useEditorStore } from './useEditorStore';

enableMapSet();

// Mock dependencies
vi.mock('../lib/recentProjects', () => ({
  recentProjects: {
    add: vi.fn(),
    get: vi.fn(() => []),
    remove: vi.fn(),
  },
}));

vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    resolveFilename: (_subDir: string, filename: string) => filename,
    saveJson: vi.fn(),
    loadAllCutscenes: vi.fn(async () => []),
    readJson: vi.fn(async () => null),
    loadAllTilesets: vi.fn(async () => []),
    loadAllMaps: vi.fn(async () => []),
  },
}));

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { closeProject } = useEditorStore.getState();
    closeProject();
  });

  it('should initialize with default state', () => {
    const state = useEditorStore.getState();
    expect(state.project).toBeNull();
    expect(state.resourcesLoaded).toBe(false);
    expect(state.resourceLoadingLabel).toBeNull();
    expect(state.resourceLoadingProgress).toBe(0);
    expect(state.mode).toBe('project');
    expect(state.activeTool).toBe('stamp');
  });

  it('should load a project', async () => {
    const mockProject = {
      idPrefix: 'base',
      version: '1.0',
      name: 'Test Project',
      tileSize: 16,
      defaultMapWidth: 32,
      defaultMapHeight: 32,
      metadata: { author: 'Test', description: '' },
    };
    const mockPath = '/test/path';

    const { loadProject } = useEditorStore.getState();
    await loadProject(mockPath, mockProject);

    const state = useEditorStore.getState();
    expect(state.project).toEqual({ ...mockProject, idPrefix: 'base' });
    expect(state.projectPath).toBe(mockPath);
    expect(state.resourcesLoaded).toBe(false);
    expect(state.resourceLoadingLabel).toBe('Preparing workspace');
    expect(state.resourceLoadingProgress).toBe(0.05);
  });

  it('should change editor mode', () => {
    const { setMode } = useEditorStore.getState();

    setMode('maps');
    expect(useEditorStore.getState().mode).toBe('maps');

    setMode('tilesets');
    expect(useEditorStore.getState().mode).toBe('tilesets');
  });

  it('should update active tool', () => {
    const { setActiveTool } = useEditorStore.getState();

    setActiveTool('stamp');
    expect(useEditorStore.getState().activeTool).toBe('stamp');
  });

  it('should update project', async () => {
    const { updateProject, loadProject } = useEditorStore.getState();
    const initialProject = {
      idPrefix: 'base',
      version: '1.0',
      name: 'Initial',
      tileSize: 16,
      defaultMapWidth: 32,
      defaultMapHeight: 32,
      metadata: { author: '', description: '' },
    };

    await loadProject('/path', initialProject);

    const updatedProject = { ...initialProject, name: 'Updated Name' };
    await updateProject(updatedProject);

    expect(useEditorStore.getState().project?.name).toBe('Updated Name');
  });

  it('should handle tileset selection', () => {
    const { setActiveTileset, setSelectedTile } = useEditorStore.getState();

    setActiveTileset('base:village');
    expect(useEditorStore.getState().activeTilesetId).toBe('base:village');

    setSelectedTile(5);
    expect(useEditorStore.getState().selectedTileIndex).toBe(5);
  });

  it('should keep a sampled pattern when it is set after clearing tile selection', () => {
    const { setSelectedTile, setSelectedTiles, setSampledPattern } = useEditorStore.getState();

    setSelectedTile(5);
    setSelectedTiles([]);
    setSampledPattern({
      tilesetId: 'base:village',
      pattern: [[null]],
      width: 1,
      height: 1,
    });

    expect(useEditorStore.getState().sampledPattern).toEqual({
      tilesetId: 'base:village',
      pattern: [[null]],
      width: 1,
      height: 1,
    });
  });

  it('should preserve the selected object while selecting tiles in object mode', () => {
    const { setTilesetToolMode, setSelectedObject, setSelectedTiles } = useEditorStore.getState();

    setTilesetToolMode('objects');
    setSelectedObject('tree');
    setSelectedTiles([10, 11, 14, 15]);

    const state = useEditorStore.getState();
    expect(state.selectedObjectId).toBe('tree');
    expect(state.selectedTileIndices).toEqual([10, 11, 14, 15]);
  });

  it('should clear the selected object while selecting tiles outside object mode', () => {
    const { setTilesetToolMode, setSelectedObject, setSelectedTiles } = useEditorStore.getState();

    setTilesetToolMode('select');
    setSelectedObject('tree');
    setSelectedTiles([7]);

    const state = useEditorStore.getState();
    expect(state.selectedObjectId).toBeNull();
    expect(state.selectedTileIndices).toEqual([7]);
  });

  describe('Map & Variation Logic', () => {
    const mockMap = {
      version: 1,
      id: 'test-map',
      name: 'Test Map',
      width: 10,
      height: 10,
      baseTilesetId: 'base:village',
      tilesetRefs: ['base:village'],
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual' as const,
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: Array(10)
            .fill(null)
            .map(() => Array(10).fill(null)),
        },
      ],
      entities: [],
    };

    beforeEach(() => {
      const { setCurrentMap } = useEditorStore.getState();
      setCurrentMap(mockMap);
    });

    it('should paint a tile in the base layer', () => {
      const { paintTile } = useEditorStore.getState();
      paintTile('ground', 0, 0, 'base:village', 5);

      const state = useEditorStore.getState();
      expect(state.currentMap?.layers[0].data[0][0]).toBe(5); // Encoded: 0 << 16 | 5
    });

    it('should add a variation', () => {
      const { addVariation } = useEditorStore.getState();
      addVariation({
        id: 'winter',
        displayName: 'Winter',
        kind: 'season',
        layerOverrides: {},
        entityOverrides: [],
      });

      const state = useEditorStore.getState();
      expect(state.currentMap?.variations).toHaveLength(1);
      expect(state.currentMap?.variations?.[0].id).toBe('winter');
    });

    it('should paint a tile in a variation override', () => {
      const { addVariation, setActiveVariation, paintTile } = useEditorStore.getState();

      addVariation({
        id: 'winter',
        displayName: 'Winter',
        kind: 'season',
        layerOverrides: {},
        entityOverrides: [],
      });
      setActiveVariation('winter');

      paintTile('ground', 5, 5, 'base:village', 10);

      const state = useEditorStore.getState();
      // Base layer should still be null
      expect(state.currentMap?.layers[0].data[5][5]).toBeNull();

      // Variation override should have the tile
      const winterVar = state.currentMap?.variations?.find((v) => v.id === 'winter');
      expect(winterVar?.layerOverrides?.['ground'].data[5][5]).toBe('base:village:10');
    });

    it('should erase a tile in a variation override', () => {
      const { addVariation, setActiveVariation, paintTile, eraseTile } = useEditorStore.getState();

      addVariation({
        id: 'winter',
        displayName: 'Winter',
        kind: 'season',
        layerOverrides: {},
        entityOverrides: [],
      });
      setActiveVariation('winter');

      paintTile('ground', 1, 1, 'base:village', 20);
      expect(
        useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1],
      ).toBe('base:village:20');

      eraseTile('ground', 1, 1);
      expect(
        useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1],
      ).toBeNull();
    });

    it('should treat an all-null sampled pattern as erase during stamp flood fill', () => {
      const { paintTile, bucketFillAdvanced } = useEditorStore.getState();

      paintTile('ground', 0, 0, 'base:village', 1);
      paintTile('ground', 1, 0, 'base:village', 1);
      paintTile('ground', 0, 1, 'base:village', 1);
      paintTile('ground', 1, 1, 'base:village', 1);

      bucketFillAdvanced('ground', 0, 0, {
        mode: 'stamp',
        pattern: {
          pattern: [[null]],
          patternW: 1,
          patternH: 1,
        },
      });

      const state = useEditorStore.getState();
      expect(state.currentMap?.layers[0].data[0][0]).toBeNull();
      expect(state.currentMap?.layers[0].data[0][1]).toBeNull();
      expect(state.currentMap?.layers[0].data[1][0]).toBeNull();
      expect(state.currentMap?.layers[0].data[1][1]).toBeNull();
    });

    it('should select the terrain tool when a terrain layer is auto-selected', () => {
      const terrainFirstMap = {
        version: 1,
        id: 'terrain-first-map',
        name: 'Terrain First',
        width: 10,
        height: 10,
        baseTilesetId: 'base:village',
        tilesetRefs: ['base:village'],
        layers: [
          {
            id: 'terrain-layer',
            name: 'Terrain',
            kind: 'terrain' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            data: Array(10)
              .fill(null)
              .map(() => Array(10).fill(null)),
            terrainData: Array(10)
              .fill(null)
              .map(() => Array(10).fill(null)),
          },
          {
            id: 'visual-layer',
            name: 'Ground',
            kind: 'visual' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 1,
            data: Array(10)
              .fill(null)
              .map(() => Array(10).fill(null)),
          },
        ],
        entities: [],
      };

      useEditorStore.getState().setActiveTool('stamp');
      useEditorStore.getState().setCurrentMap(terrainFirstMap);

      const state = useEditorStore.getState();
      expect(state.selectedLayerId).toBe('terrain-layer');
      expect(state.activeTool).toBe('terrain');
    });

    it('should place object instances on object layers', () => {
      const objectMap = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'object' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            objectInstances: [],
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectMap);
      useEditorStore.getState().setActiveVariation(null);
      useEditorStore.getState().placeObjectInstance('objects', 48, 80, 'test:tree');

      const layer = useEditorStore
        .getState()
        .currentMap?.layers.find((entry) => entry.id === 'objects');
      expect(layer?.objectInstances).toHaveLength(1);
      expect(layer?.objectInstances?.[0]).toMatchObject({
        objectId: 'test:tree',
        x: 48,
        y: 80,
      });
      expect(useEditorStore.getState().selectedObjectInstanceId).toBe(
        layer?.objectInstances?.[0].id,
      );
    });

    it('should move and delete selected object instances on object layers', () => {
      const objectMap = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'object' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            objectInstances: [
              {
                id: 'inst_tree',
                objectId: 'test:tree',
                x: 48,
                y: 80,
              },
            ],
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectMap);
      useEditorStore.getState().selectObjectInstance('inst_tree');
      useEditorStore.getState().moveObjectInstance('objects', 'inst_tree', 55, 91);

      let layer = useEditorStore
        .getState()
        .currentMap?.layers.find((entry) => entry.id === 'objects');
      expect(layer?.objectInstances?.[0]).toMatchObject({ x: 55, y: 91 });

      useEditorStore.getState().removeObjectInstance('objects', 'inst_tree');
      layer = useEditorStore.getState().currentMap?.layers.find((entry) => entry.id === 'objects');
      expect(layer?.objectInstances).toEqual([]);
      expect(useEditorStore.getState().selectedObjectInstanceId).toBeNull();
    });
  });

  describe('selectLayer auto-tool switching', () => {
    const mapWithLayers = {
      version: 1,
      id: 'test-map',
      name: 'Test Map',
      width: 10,
      height: 10,
      baseTilesetId: 'base:village',
      tilesetRefs: ['base:village'],
      layers: [
        {
          id: 'visual-layer',
          name: 'Ground',
          kind: 'visual' as const,
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [],
        },
        {
          id: 'entity-layer',
          name: 'Entities',
          kind: 'entity' as const,
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 1,
          data: [],
        },
        {
          id: 'collision-layer',
          name: 'Collision',
          kind: 'collision' as const,
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 2,
          data: [],
        },
      ],
      entities: [],
    };

    beforeEach(() => {
      useEditorStore.getState().setCurrentMap(mapWithLayers);
    });

    it('should switch to entitySelect when selecting an entity layer while on a tile tool', () => {
      useEditorStore.getState().setActiveTool('stamp');
      useEditorStore.getState().selectLayer('entity-layer');
      expect(useEditorStore.getState().activeTool).toBe('entitySelect');
    });

    it('should keep entityPlace when selecting another entity layer', () => {
      useEditorStore.getState().setActiveTool('entityPlace');
      useEditorStore.getState().selectLayer('entity-layer');
      expect(useEditorStore.getState().activeTool).toBe('entityPlace');
    });

    it('should keep entitySelect when switching to entity layer while on entitySelect', () => {
      useEditorStore.getState().setActiveTool('entitySelect');
      useEditorStore.getState().selectLayer('entity-layer');
      expect(useEditorStore.getState().activeTool).toBe('entitySelect');
    });

    it('should switch to stamp when selecting a visual layer while on entityPlace', () => {
      useEditorStore.getState().setActiveTool('entityPlace');
      useEditorStore.getState().selectLayer('visual-layer');
      expect(useEditorStore.getState().activeTool).toBe('stamp');
    });

    it('should switch to collision selection when leaving a visual layer', () => {
      useEditorStore.getState().setActiveTool('stamp');
      useEditorStore.getState().selectLayer('collision-layer');
      expect(useEditorStore.getState().activeTool).toBe('collisionSelect');
    });

    it('should switch to collision selection when leaving an entity layer', () => {
      useEditorStore.getState().setActiveTool('entityDelete');
      useEditorStore.getState().selectLayer('collision-layer');
      expect(useEditorStore.getState().activeTool).toBe('collisionSelect');
    });

    it('should switch away from fill when selecting an object-sorted layer', () => {
      const objectLayerMap = {
        ...mapWithLayers,
        layers: [
          ...mapWithLayers.layers,
          {
            id: 'object-layer',
            name: 'Objects',
            kind: 'object' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 3,
            objectInstances: [],
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectLayerMap);
      useEditorStore.getState().setActiveTool('fill');
      useEditorStore.getState().selectLayer('object-layer');

      expect(useEditorStore.getState().activeTool).toBe('objectPlace');
    });

    it('updates the tool and clears stale selection when the selected layer changes type', () => {
      useEditorStore.getState().selectLayer('entity-layer');
      useEditorStore.getState().selectEntity('entity-1');
      useEditorStore.getState().setActiveTool('entityPlace');

      useEditorStore.getState().updateLayer('entity-layer', { kind: 'visual' });

      const state = useEditorStore.getState();
      expect(state.currentMap?.layers.find((layer) => layer.id === 'entity-layer')?.kind).toBe(
        'visual',
      );
      expect(state.selectedLayerId).toBe('entity-layer');
      expect(state.activeTool).toBe('stamp');
      expect(state.selectedEntityId).toBeNull();
    });
  });

  describe('setEntitySnapMode', () => {
    it('should default to grid snap mode', () => {
      expect(useEditorStore.getState().entitySnapMode).toBe('grid');
    });

    it('should switch to pixel snap mode', () => {
      useEditorStore.getState().setEntitySnapMode('pixel');
      expect(useEditorStore.getState().entitySnapMode).toBe('pixel');
    });

    it('should switch back to grid snap mode', () => {
      useEditorStore.getState().setEntitySnapMode('pixel');
      useEditorStore.getState().setEntitySnapMode('grid');
      expect(useEditorStore.getState().entitySnapMode).toBe('grid');
    });
  });

  describe('setShowCollisionOverlay', () => {
    it('should default to hidden collision overlay', () => {
      expect(useEditorStore.getState().showCollisionOverlay).toBe(false);
    });

    it('should toggle collision overlay visibility', () => {
      useEditorStore.getState().setShowCollisionOverlay(true);
      expect(useEditorStore.getState().showCollisionOverlay).toBe(true);

      useEditorStore.getState().setShowCollisionOverlay(false);
      expect(useEditorStore.getState().showCollisionOverlay).toBe(false);
    });
  });

  describe('setShowTilesetCollisionOverlay', () => {
    it('should default to hidden tileset collision overlay', () => {
      expect(useEditorStore.getState().showTilesetCollisionOverlay).toBe(false);
    });

    it('should toggle tileset collision overlay visibility', () => {
      useEditorStore.getState().setShowTilesetCollisionOverlay(true);
      expect(useEditorStore.getState().showTilesetCollisionOverlay).toBe(true);

      useEditorStore.getState().setShowTilesetCollisionOverlay(false);
      expect(useEditorStore.getState().showTilesetCollisionOverlay).toBe(false);
    });
  });

  describe('setShowTilesetNavigationCostOverlay', () => {
    it('should default to hidden tileset navigation cost overlay', () => {
      expect(useEditorStore.getState().showTilesetNavigationCostOverlay).toBe(false);
    });

    it('should toggle tileset navigation cost overlay visibility', () => {
      useEditorStore.getState().setShowTilesetNavigationCostOverlay(true);
      expect(useEditorStore.getState().showTilesetNavigationCostOverlay).toBe(true);

      useEditorStore.getState().setShowTilesetNavigationCostOverlay(false);
      expect(useEditorStore.getState().showTilesetNavigationCostOverlay).toBe(false);
    });
  });

  describe('renameAnchor', () => {
    const anchor = (id: string) => ({
      id,
      name: id,
      position: [0, 0] as [number, number],
      tags: [],
    });
    const link = (id: string, targetMapId: string, targetAnchorId: string) => ({
      id,
      triggerId: `${id}-trigger`,
      targetMapId,
      targetAnchorId,
    });
    const makeMap = (id: string, anchors: string[], links: ReturnType<typeof link>[] = []) =>
      ({
        id,
        spatialPrimitives: { anchors: anchors.map(anchor) },
        locationLinks: links,
        layers: [],
      }) as never;

    beforeEach(() => {
      const home = makeMap('base:home', ['door', 'bed'], [link('in', 'base:home', 'door')]);
      const town = makeMap(
        'base:town',
        ['door'],
        [link('to-home', 'base:home', 'door'), link('to-town', 'base:town', 'door')],
      );
      useEditorStore.setState({ currentMap: home, maps: [home, town], selectedAnchorId: 'door' });
    });

    it('renames the anchor and retargets links that point at it, on any map', () => {
      expect(useEditorStore.getState().renameAnchor('door', 'front_door')).toBeNull();

      const state = useEditorStore.getState();
      expect(state.currentMap?.spatialPrimitives?.anchors?.map((a) => a.id)).toEqual([
        'front_door',
        'bed',
      ]);
      expect(state.currentMap?.locationLinks?.[0].targetAnchorId).toBe('front_door');
      expect(state.selectedAnchorId).toBe('front_door');
      const town = state.maps.find((m) => m.id === 'base:town')!;
      expect(town.locationLinks?.find((l) => l.id === 'to-home')?.targetAnchorId).toBe(
        'front_door',
      );
      // Same anchor ID on a different map is a different anchor.
      expect(town.locationLinks?.find((l) => l.id === 'to-town')?.targetAnchorId).toBe('door');
    });

    it('rejects an ID that is invalid or already used on this map', () => {
      expect(useEditorStore.getState().renameAnchor('door', 'Bad ID')).toMatch(/lowercase/);
      expect(useEditorStore.getState().renameAnchor('door', 'bed')).toMatch(/already uses/);
      expect(useEditorStore.getState().currentMap?.spatialPrimitives?.anchors?.[0].id).toBe('door');
    });
  });

  describe('addLayerDefinition injects into currentMap', () => {
    const mockProject = {
      idPrefix: 'base',
      version: '1.0',
      name: 'Test Project',
      tileSize: 16,
      defaultMapWidth: 10,
      defaultMapHeight: 10,
      metadata: { author: '', description: '' },
      layerDefinitions: [],
    };

    const mapWithoutDefinitionLayer = {
      version: 1,
      id: 'test-map',
      name: 'Test Map',
      width: 10,
      height: 10,
      baseTilesetId: 'base:village',
      tilesetRefs: ['base:village'],
      layers: [],
      entities: [],
    };

    it('should inject a new layer definition into the open map', async () => {
      await useEditorStore.getState().loadProject('/test', mockProject);
      useEditorStore.getState().setCurrentMap(mapWithoutDefinitionLayer);

      const newDef = {
        id: 'my-collision',
        name: 'Collision',
        type: 'tile' as const,
        color: '#ff00ff',
        zIndex: 10,
      };

      await useEditorStore.getState().addLayerDefinition(newDef);

      const map = useEditorStore.getState().currentMap;
      expect(map?.layers.some((l) => l.id === 'my-collision')).toBe(true);
    });

    it('should not duplicate an existing layer when definition is added again', async () => {
      const mapWithLayer = {
        ...mapWithoutDefinitionLayer,
        layers: [
          {
            id: 'my-collision',
            name: 'Collision',
            kind: 'collision' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            data: [],
            definitionId: 'my-collision',
          },
        ],
      };

      await useEditorStore.getState().loadProject('/test', mockProject);
      useEditorStore.getState().setCurrentMap(mapWithLayer);

      const existingDef = {
        id: 'my-collision',
        name: 'Collision',
        type: 'tile' as const,
        color: '#ff00ff',
        zIndex: 10,
      };

      await useEditorStore.getState().addLayerDefinition(existingDef);

      const map = useEditorStore.getState().currentMap;
      const count = map?.layers.filter((l) => l.id === 'my-collision').length;
      expect(count).toBe(1);
    });
  });
});
