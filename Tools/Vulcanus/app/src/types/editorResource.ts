import type { AnyResourceDefinition } from '../lib/resourceRegistry';
import { z } from 'zod';

export const editorResourceTypeIds = [
  'location',
  'tileset',
  'character',
  'entity',
  'item',
  'shop',
  'routine',
  'quest',
  'building-kit',
  'building',
  'dialogue',
  'cutscene',
  'music',
] as const;

export type EditorResourceTypeId = (typeof editorResourceTypeIds)[number];

export const editorResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export type EditorResource = z.infer<typeof editorResourceSchema>;

export type EditorResourceCreateFlow =
  | 'none'
  | 'simple'
  | 'location'
  | 'tileset'
  | 'dialogue'
  | 'routine'
  | 'quest'
  | 'music';
export type EditorResourceMetadataFlow =
  | 'none'
  | 'location'
  | 'tileset'
  | 'character'
  | 'entity'
  | 'item'
  | 'dialogue';

export type EditorResourceMetadataFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'icon'
  | 'color'
  | 'number';

export interface EditorResourceMetadataOption {
  label: string;
  value: string;
}

export interface EditorResourceMetadataField {
  key: string;
  label: string;
  type: EditorResourceMetadataFieldType;
  placeholder?: string;
  width?: 'full' | 'half';
  min?: number;
  options?: EditorResourceMetadataOption[];
}

export type EditorResourceIcon =
  | {
      type: 'game-icon' | 'asset' | 'emoji';
      value: string;
    }
  | undefined;

export interface EditorResourceDescriptor extends EditorResource {
  type: EditorResourceTypeId;
  folderPath: string;
  saveUnitId: string;
  resourceIcon?: EditorResourceIcon;
}

export interface EditorResourceTypeDefinition {
  id: EditorResourceTypeId;
  documentDefinition?: AnyResourceDefinition;
  label: string;
  collectionLabel: string;
  editorIcon: string;
  createFlow: EditorResourceCreateFlow;
  metadataFlow: EditorResourceMetadataFlow;
  metadataTitle?: string;
  getMetadataFields?: () => EditorResourceMetadataField[];
  getMetadataInitialValues?: (resourceId: string) => Record<string, unknown> | null;
  submitMetadata?: (resourceId: string, values: Record<string, unknown>) => Promise<void>;
  sharedSaveUnitId?: string;
  saveUnitPrefix?: string;
  accentColor: string;
  tint: string;
  hoverTint: string;
  rowGradient: string;
  headerGradient: string;
  canCreate: boolean;
  canRename: boolean;
  canEditMetadata: boolean;
  canDelete: boolean;
  canRevealInFileExplorer: boolean;
  fileExplorerPath?: (resourceId: string) => string;
  renameResource?: (resourceId: string, name: string) => Promise<void>;
  deleteResource?: (resourceId: string) => Promise<void>;
  getFolderPath?: (resourceId: string) => string;
}
