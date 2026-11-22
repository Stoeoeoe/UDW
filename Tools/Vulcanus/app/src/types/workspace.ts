import {
  Map as GameMap,
  Tileset,
  Character,
  EntityType,
  Item,
  Shop,
  DialogueDocument,
} from './schema';
import { ToolType } from './editor';
import { EditorResourceTypeId } from './editorResource';
import type { MusicCueSummary } from '../lib/musicApi';

export type WorkspaceScreenKind =
  | 'cutscenes'
  | 'entities'
  | 'characters'
  | 'items'
  | 'dialogues'
  | 'scripting'
  | 'data';

export type WorkspaceDocument =
  | { kind: 'quest'; questId: string; label: string; saveUnitId: string }
  | { kind: 'object'; objectId: string; label: string; saveUnitId: string }
  | { kind: 'data'; label: string; saveUnitId: 'configuration' }
  | { kind: 'cutscene'; cutsceneId: string; label: string; saveUnitId: string }
  | { kind: 'cutscenes'; label: string; saveUnitId: 'cutscenes' }
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
      kind: 'characters';
      label: string;
      saveUnitId: 'characters';
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
    }
  | { kind: 'music'; cueId: string; label: string; saveUnitId: string }
  | {
      kind: 'character';
      characterId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'entity';
      entityTypeId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'item';
      itemId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'shop';
      shopId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'routine';
      routineId: string;
      label: string;
      saveUnitId: string;
    }
  | {
      kind: 'dialogue';
      dialogueId: string;
      label: string;
      saveUnitId: string;
    };

export type WorkspaceConfigTab =
  | 'terrain'
  | 'metadata'
  | 'layers'
  | 'locations'
  | 'itemclasses'
  | 'emotions';

export interface WorkspaceTab {
  id: string;
  document: WorkspaceDocument;
  isPreview?: boolean;
}

export type ResourceKind = EditorResourceTypeId;

export interface WorkspaceTreeNode {
  id: string;
  kind: 'group' | 'branch' | 'leaf' | 'folder';
  label: string;
  icon?: string;
  resourceIcon?:
    | {
        type: 'game-icon' | 'asset' | 'emoji';
        value: string;
      }
    | undefined;
  resourceKind?: ResourceKind;
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
  selectedCollisionId: string | null;
  timePreviewEnabled: boolean;
  timeOfDay: number;
}

export interface TilesetTabSession {
  activeTilesetId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[];
  selectedObjectId: string | null;
  selectedTerrainId: string | null;
  tilesetToolMode: 'select' | 'terrain' | 'objects';
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
  characters?: Character[];
  entityTypes?: EntityType[];
  items?: Item[];
  shops?: Shop[];
  quests?: import('./quest').Quest[];
  objects?: import('./object').ObjectDefinition[];
  routines?: import('./routine').Routine[];
  dialogues?: DialogueDocument[];
  cutscenes?: import('./cutscene').Cutscene[];
  cutsceneLabels?: Record<string, string>;
  cutsceneFolders?: Record<string, string>;
  musicCues?: MusicCueSummary[];
}
