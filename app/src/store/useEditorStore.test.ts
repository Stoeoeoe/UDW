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
    saveJson: vi.fn(),
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
    expect(state.project).toEqual(mockProject);
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

    setActiveTileset('village');
    expect(useEditorStore.getState().activeTilesetId).toBe('village');

    setSelectedTile(5);
    expect(useEditorStore.getState().selectedTileIndex).toBe(5);
  });

  it('should keep a sampled pattern when it is set after clearing tile selection', () => {
    const { setSelectedTile, setSelectedTiles, setSampledPattern } = useEditorStore.getState();

    setSelectedTile(5);
    setSelectedTiles([]);
    setSampledPattern({
      tilesetId: 'village',
      pattern: [[null]],
      width: 1,
      height: 1,
    });

    expect(useEditorStore.getState().sampledPattern).toEqual({
      tilesetId: 'village',
      pattern: [[null]],
      width: 1,
      height: 1,
    });
  });

  it('should preserve the selected object while selecting tiles in object mode', () => {
    const { setTilesetToolMode, setSelectedObjectDefinition, setSelectedTiles } =
      useEditorStore.getState();

    setTilesetToolMode('objects');
    setSelectedObjectDefinition('tree');
    setSelectedTiles([10, 11, 14, 15]);

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBe('tree');
    expect(state.selectedTileIndices).toEqual([10, 11, 14, 15]);
  });

  it('should clear the selected object while selecting tiles outside object mode', () => {
    const { setTilesetToolMode, setSelectedObjectDefinition, setSelectedTiles } =
      useEditorStore.getState();

    setTilesetToolMode('select');
    setSelectedObjectDefinition('tree');
    setSelectedTiles([7]);

    const state = useEditorStore.getState();
    expect(state.selectedObjectDefinitionId).toBeNull();
    expect(state.selectedTileIndices).toEqual([7]);
  });

  describe('Map & Variation Logic', () => {
    const mockMap = {
      version: 1,
      id: 'test-map',
      name: 'Test Map',
      width: 10,
      height: 10,
      baseTilesetId: 'village',
      tilesetRefs: ['village'],
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
      paintTile('ground', 0, 0, 'village', 5);

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

      paintTile('ground', 5, 5, 'village', 10);

      const state = useEditorStore.getState();
      // Base layer should still be null
      expect(state.currentMap?.layers[0].data[5][5]).toBeNull();

      // Variation override should have the tile
      const winterVar = state.currentMap?.variations?.find((v) => v.id === 'winter');
      expect(winterVar?.layerOverrides?.['ground'].data[5][5]).toBe('village:10');
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

      paintTile('ground', 1, 1, 'village', 20);
      expect(
        useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1],
      ).toBe('village:20');

      eraseTile('ground', 1, 1);
      expect(
        useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1],
      ).toBeNull();
    });

    it('should treat an all-null sampled pattern as erase during stamp flood fill', () => {
      const { paintTile, bucketFillAdvanced } = useEditorStore.getState();

      paintTile('ground', 0, 0, 'village', 1);
      paintTile('ground', 1, 0, 'village', 1);
      paintTile('ground', 0, 1, 'village', 1);
      paintTile('ground', 1, 1, 'village', 1);

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
        baseTilesetId: 'village',
        tilesetRefs: ['village'],
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

    it('should store object-layer paints as connected objectGroups', () => {
      const objectMap = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'visual' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            sortingLayer: 'objects' as const,
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectMap);
      const { paintTile } = useEditorStore.getState();

      paintTile('objects', 3, 7, 'village', 42);
      paintTile('objects', 3, 6, 'village', 26);
      paintTile('objects', 3, 5, 'village', 10);

      const layer = useEditorStore
        .getState()
        .currentMap?.layers.find((entry) => entry.id === 'objects');
      expect(layer?.data).toBeUndefined();
      expect(layer?.objectGroups).toHaveLength(1);
      expect(layer?.objectGroups?.[0].tiles).toEqual([
        { x: 3, y: 5, tilesetId: 'village', tileIndex: 10 },
        { x: 3, y: 6, tilesetId: 'village', tileIndex: 26 },
        { x: 3, y: 7, tilesetId: 'village', tileIndex: 42 },
      ]);
    });

    it('should merge adjacent object groups and split them again on erase', () => {
      const objectMap = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'visual' as const,
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 0,
            sortingLayer: 'objects' as const,
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectMap);
      const { paintTile, eraseTile } = useEditorStore.getState();

      paintTile('objects', 1, 1, 'village', 1);
      paintTile('objects', 3, 1, 'village', 2);

      let groups = useEditorStore.getState().currentMap?.layers[0].objectGroups ?? [];
      expect(groups).toHaveLength(2);

      paintTile('objects', 2, 1, 'village', 3);
      groups = useEditorStore.getState().currentMap?.layers[0].objectGroups ?? [];
      expect(groups).toHaveLength(1);
      expect(groups[0].tiles.map((tile) => [tile.x, tile.y])).toEqual([
        [1, 1],
        [2, 1],
        [3, 1],
      ]);

      eraseTile('objects', 2, 1);
      groups = useEditorStore.getState().currentMap?.layers[0].objectGroups ?? [];
      expect(groups).toHaveLength(2);
      expect(groups.map((group) => group.tiles.map((tile) => [tile.x, tile.y]))).toEqual([
        [[1, 1]],
        [[3, 1]],
      ]);
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
            sortingLayer: 'objects' as const,
            objectInstances: [],
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectMap);
      useEditorStore.getState().setActiveVariation(null);
      useEditorStore.setState((state) => {
        state.tilesets.set('village', {
          version: 1,
          id: 'village',
          name: 'Village',
          spriteSheet: 'village.png',
          columns: 4,
          tileCount: 64,
          tiles: {},
          objects: [
            {
              id: 'tree',
              name: 'Tree',
              tiles: [
                { x: 0, y: 0, tileIndex: 10 },
                { x: 0, y: 1, tileIndex: 26 },
              ],
            },
          ],
        });
      });

      useEditorStore.getState().placeObjectInstance('objects', 48, 80, 'village', 'tree');

      const layer = useEditorStore
        .getState()
        .currentMap?.layers.find((entry) => entry.id === 'objects');
      expect(layer?.objectInstances).toHaveLength(1);
      expect(layer?.objectInstances?.[0]).toMatchObject({
        tilesetId: 'village',
        objectDefinitionId: 'tree',
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
            sortingLayer: 'objects' as const,
            objectInstances: [
              {
                id: 'inst_tree',
                tilesetId: 'village',
                objectDefinitionId: 'tree',
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
      baseTilesetId: 'village',
      tilesetRefs: ['village'],
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

    it('should keep stamp when switching between tile layers', () => {
      useEditorStore.getState().setActiveTool('stamp');
      useEditorStore.getState().selectLayer('collision-layer');
      expect(useEditorStore.getState().activeTool).toBe('stamp');
    });

    it('should switch to stamp when selecting a collision layer while on entityDelete', () => {
      useEditorStore.getState().setActiveTool('entityDelete');
      useEditorStore.getState().selectLayer('collision-layer');
      expect(useEditorStore.getState().activeTool).toBe('stamp');
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
            sortingLayer: 'objects' as const,
            objectInstances: [],
          },
        ],
      };

      useEditorStore.getState().setCurrentMap(objectLayerMap);
      useEditorStore.getState().setActiveTool('fill');
      useEditorStore.getState().selectLayer('object-layer');

      expect(useEditorStore.getState().activeTool).toBe('objectPlace');
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

  describe('addLayerDefinition injects into currentMap', () => {
    const mockProject = {
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
      baseTilesetId: 'village',
      tilesetRefs: ['village'],
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
