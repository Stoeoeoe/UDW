import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from './useEditorStore';

// Mock dependencies
vi.mock('../lib/recentProjects', () => ({
    recentProjects: {
        add: vi.fn(),
        get: vi.fn(() => []),
        remove: vi.fn(),
    }
}));

vi.mock('../lib/fileSystem', () => ({
    fileSystem: {
        saveJson: vi.fn(),
        loadAllTilesets: vi.fn(async () => []),
        loadAllMaps: vi.fn(async () => []),
    }
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
            version: "1.0",
            name: "Test Project",
            tileSize: 16,
            defaultMapWidth: 32,
            defaultMapHeight: 32,
            metadata: { author: "Test", description: "" }
        };
        const mockPath = "/test/path";

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
            version: "1.0",
            name: "Initial",
            tileSize: 16,
            defaultMapWidth: 32,
            defaultMapHeight: 32,
            metadata: { author: "", description: "" }
        };

        await loadProject("/path", initialProject as any);

        const updatedProject = { ...initialProject, name: "Updated Name" };
        await updateProject(updatedProject as any);

        expect(useEditorStore.getState().project?.name).toBe("Updated Name");
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
            layers: [
                {
                    id: 'ground',
                    name: 'Ground',
                    kind: 'visual' as const,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    zOrder: 0,
                    data: Array(10).fill(null).map(() => Array(10).fill(null))
                }
            ],
            entities: []
        };

        beforeEach(() => {
            const { setCurrentMap } = useEditorStore.getState();
            setCurrentMap(mockMap as any);
        });

        it('should paint a tile in the base layer', () => {
            const { paintTile } = useEditorStore.getState();
            paintTile('ground', 0, 0, 'village', 5);

            const state = useEditorStore.getState();
            expect(state.currentMap?.layers[0].data[0][0]).toBe('village:5');
        });

        it('should add a variation', () => {
            const { addVariation } = useEditorStore.getState();
            addVariation({
                id: 'winter',
                displayName: 'Winter',
                kind: 'season',
                layerOverrides: {},
                entityOverrides: []
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
                entityOverrides: []
            });
            setActiveVariation('winter');

            paintTile('ground', 5, 5, 'village', 10);

            const state = useEditorStore.getState();
            // Base layer should still be null
            expect(state.currentMap?.layers[0].data[5][5]).toBeNull();

            // Variation override should have the tile
            const winterVar = state.currentMap?.variations?.find(v => v.id === 'winter');
            expect(winterVar?.layerOverrides?.['ground'].data[5][5]).toBe('village:10');
        });

        it('should erase a tile in a variation override', () => {
            const { addVariation, setActiveVariation, paintTile, eraseTile } = useEditorStore.getState();

            addVariation({
                id: 'winter',
                displayName: 'Winter',
                kind: 'season',
                layerOverrides: {},
                entityOverrides: []
            });
            setActiveVariation('winter');

            paintTile('ground', 1, 1, 'village', 20);
            expect(useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1]).toBe('village:20');

            eraseTile('ground', 1, 1);
            expect(useEditorStore.getState().currentMap?.variations?.[0].layerOverrides?.['ground'].data[1][1]).toBeNull();
        });
    });
});
