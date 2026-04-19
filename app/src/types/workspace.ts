import { Map as GameMap, Tileset } from './schema';
import { ToolType } from './editor';

export type WorkspaceScreenKind = 'entities' | 'actors' | 'items' | 'dialogues' | 'scripting';

export type WorkspaceDocument =
  | {
      kind: 'location';
      mapId: string;
      variationId: string | null;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'tileset';
      tilesetId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'settings';
      label: string;
      saveUnitId: 'settings';
    }
  | {
      kind: 'configuration';
      label: string;
      saveUnitId: 'configuration';
      configTab?: WorkspaceConfigTab;
    }
  | {
      kind: 'entities';
      label: string;
      saveUnitId: 'configuration';
    }
  | {
      kind: 'actors';
      label: string;
      saveUnitId: 'actors';
    }
  | {
      kind: 'items';
      label: string;
      saveUnitId: 'items';
    }
  | {
      kind: 'dialogues';
      label: string;
      saveUnitId: 'dialogues';
    }
  | {
      kind: 'scripting';
      label: string;
      saveUnitId: 'configuration';
    };

export type WorkspaceConfigTab = 'terrain' | 'metadata' | 'layers' | 'locations' | 'itemclasses';

export interface WorkspaceTab {
  id: string;
  document: WorkspaceDocument;
  isPreview?: boolean;
}

export interface WorkspaceTreeNode {
  id: string;
  kind: 'group' | 'branch' | 'leaf';
  label: string;
  icon?: string;
  document?: WorkspaceDocument;
  children?: WorkspaceTreeNode[];
  defaultExpanded?: boolean;
}

export interface LocationTabSession {
  activeVariationId: string | null;
  selectedLayerId: string | null;
  activeTilesetId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[];
  selectedTerrainId: string | null;
  activeTool: ToolType;
  drawMode: 'point' | 'rect' | 'circle' | 'line' | 'flood';
  brushSize: number;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  selectedEntityId: string | null;
  selectedEntityTypeId: string | null;
  selectedLinkId: string | null;
  selectedAnchorId: string | null;
  selectedTriggerId: string | null;
  timePreviewEnabled: boolean;
  timeOfDay: number;
}

export interface TilesetTabSession {
  activeTilesetId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[];
  selectedTerrainId: string | null;
  tilesetToolMode: 'select' | 'terrain';
  showTilesetCollisionOverlay: boolean;
  showTilesetSortPivotOverlay: boolean;
}

export interface WorkspaceRouteState {
  document: WorkspaceDocument | null;
}

export type LocationWorkspaceLeaf = {
  kind: 'direct';
  map: GameMap;
};

export interface WorkspaceProjectSnapshot {
  maps: GameMap[];
  tilesets: Map<string, Tileset>;
}
