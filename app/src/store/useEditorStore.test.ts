import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from './useEditorStore';

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
    await loadProject(mockPath, mockProject as any);

    const state = useEditorStore.getState();
    expect(state.project).toEqual(mockProject);
    expect(state.projectPath).toBe(mockPath);
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

    await loadProject('/path', initialProject as any);

    const updatedProject = { ...initialProject, name: 'Updated Name' };
    await updateProject(updatedProject as any);

    expect(useEditorStore.getState().project?.name).toBe('Updated Name');
  });

  it('should handle tileset selection', () => {
    const { setActiveTileset, setSelectedTile } = useEditorStore.getState();

    setActiveTileset('village');
    expect(useEditorStore.getState().activeTilesetId).toBe('village');

    setSelectedTile(5);
    expect(useEditorStore.getState().selectedTileIndex).toBe(5);
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
      setCurrentMap(mockMap as any);
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
      useEditorStore.getState().setCurrentMap(mapWithLayers as any);
    });

    it('should switch to entityPlace when selecting an entity layer while on a tile tool', () => {
      useEditorStore.getState().setActiveTool('stamp');
      useEditorStore.getState().selectLayer('entity-layer');
      expect(useEditorStore.getState().activeTool).toBe('entityPlace');
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
      await useEditorStore.getState().loadProject('/test', mockProject as any);
      useEditorStore.getState().setCurrentMap(mapWithoutDefinitionLayer as any);

      const newDef = {
        id: 'my-collision',
        name: 'Collision',
        kind: 'collision' as const,
        required: true,
        defaultVisible: true,
        defaultLocked: false,
        defaultOpacity: 1,
      };

      await useEditorStore.getState().addLayerDefinition(newDef as any);

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

      await useEditorStore.getState().loadProject('/test', mockProject as any);
      useEditorStore.getState().setCurrentMap(mapWithLayer as any);

      const existingDef = {
        id: 'my-collision',
        name: 'Collision',
        kind: 'collision' as const,
        required: true,
        defaultVisible: true,
        defaultLocked: false,
        defaultOpacity: 1,
      };

      await useEditorStore.getState().addLayerDefinition(existingDef as any);

      const map = useEditorStore.getState().currentMap;
      const count = map?.layers.filter((l) => l.id === 'my-collision').length;
      expect(count).toBe(1);
    });
  });
});
