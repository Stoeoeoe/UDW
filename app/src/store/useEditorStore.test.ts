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
        expect(state.activeTool).toBe('select');
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
        await loadProject(mockPath, mockProject);

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

        setActiveTool('tilePaint');
        expect(useEditorStore.getState().activeTool).toBe('tilePaint');
    });

    it('should update project and persist changes', async () => {
        const { updateProject, loadProject } = useEditorStore.getState();
        const initialProject = {
            version: "1.0",
            name: "Initial",
            tileSize: 16,
            defaultMapWidth: 32,
            defaultMapHeight: 32,
            metadata: { author: "", description: "" }
        };

        await loadProject("/path", initialProject);

        const updatedProject = { ...initialProject, name: "Updated Name" };
        await updateProject(updatedProject);

        expect(useEditorStore.getState().project?.name).toBe("Updated Name");
    });
});
