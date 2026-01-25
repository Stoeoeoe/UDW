import { Project, Tileset, Map } from './schema';

export interface EditorState {
    // Project data
    project: Project | null;
    projectPath: string | null;           // Folder path or null if unsaved
    mode: EditorMode;

    // Assets
    tilesets: globalThis.Map<string, Tileset>;       // Keyed by tileset.id
    loadedSprites: globalThis.Map<string, HTMLImageElement>;  // Keyed by sprite path

    // Current editing context
    currentMap: Map | null;
    currentMapPath: string | null;

    // Variation & temporal context
    activeVariationId: string | null;       // null = base
    timePreviewEnabled: boolean;
    timeOfDay: number;                    // 0.0 to 1.0, normalized

    // Selection & active tool
    activeTool: ToolType;
    selectedLayerId: string | null;
    selectedTileIndex: number | null;     // Selected index within active tileset
    selectedTileIndices: number[];        // Multiple selected indices for stencil selection
    selectedTerrainId: string | null;     // Selected terrain for autotiling
    activeTilesetId: string | null;       // Currently visible tileset in palette
    selectedEntityTypeId: string | null;  // For entity placement
    selectedEntityId: string | null;      // Currently active entity for inspection
    selectedEntityIds: Set<string>;       // Multiple selected entities

    drawMode: 'point' | 'rect' | 'circle'; // How tools behave
    hoveredTile: { x: number, y: number } | null; // Currently hovered tile in viewport

    // Camera
    camera: {
        x: number;                          // Pan offset X in pixels
        y: number;                          // Pan offset Y in pixels
        zoom: number;                       // Zoom level (0.5 = 50%, 2.0 = 200%)
    };

    // UI state
    panels: {
        layersOpen: boolean;
        tilesetPaletteOpen: boolean;
        entitiesOpen: boolean;
        inspectorOpen: boolean;
        variationsOpen: boolean;
    };

    // Validation
    validationErrors: ValidationError[];
}

export type ToolType =
    | "select"
    | "tilePaint"
    | "tileErase"
    | "tileFill"        // Phase 2
    | "entityPlace"
    | "entitySelect"
    | "pathDraw"        // Phase 2
    | "areaDraw"        // Phase 2
    | "anchorPlace";     // Phase 2

export interface ValidationError {
    severity: "error" | "warning";
    message: string;
    location?: {
        mapId?: string;
        layerId?: string;
        entityId?: string;
        position?: [number, number];
    };
}

export type EditorMode = 'project' | 'maps' | 'tilesets' | 'entities';
