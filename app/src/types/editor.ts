import { Project, Tileset, Map, Variation } from './schema';

export interface EditorState {
    // Project data
    project: Project | null;
    projectPath: string | null;           // Folder path or null if unsaved

    // Assets
    tilesets: globalThis.Map<string, Tileset>;       // Keyed by tileset.id
    loadedSprites: globalThis.Map<string, HTMLImageElement>;  // Keyed by sprite path

    // Current editing context
    currentMap: Map | null;
    currentMapPath: string | null;

    // Variation & temporal context
    activeVariation: string | null;       // null = base
    timePreviewEnabled: boolean;
    timeOfDay: number;                    // 0.0 to 1.0, normalized

    // Selection & active tool
    activeTool: ToolType;
    selectedLayerId: string | null;
    selectedTileId: string | null;        // For tile painting
    selectedEntityTypeId: string | null;  // For entity placement
    selectedEntityIds: Set<string>;       // Currently selected entities

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
