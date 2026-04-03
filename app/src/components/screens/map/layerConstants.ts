import { LayerKind } from '../../../types/schema';

/** Available icons for layer dropdown */
export const LAYER_ICONS = [
  { value: '', label: 'None' },
  { value: 'tree', label: '🌳 Tree' },
  { value: 'building', label: '🏢 Building' },
  { value: 'water', label: '🌊 Water' },
  { value: 'ground', label: '📊 Ground' },
  { value: 'overlay', label: '📐 Overlay' },
];

export type LayerCategory = 'terrain' | 'tiles' | 'collision' | 'entities' | 'other';

/** Maps a LayerKind to its display category.
 *  'terrain' is reserved for future: currently all visual layers group under 'tiles'.
 *  When a separate terrain kind is added to the schema, update here. */
export function kindToCategory(kind: LayerKind): LayerCategory {
  switch (kind) {
    case 'visual':
      return 'tiles';
    case 'collision':
      return 'collision';
    case 'navigation':
      return 'other';
    case 'metadata':
      return 'other';
    case 'entity':
      return 'entities';
    default:
      return 'other';
  }
}

export interface LayerCategoryConfig {
  id: LayerCategory;
  label: string;
  /** Kinds that belong to this category (for the "Add Layer" modal filter) */
  kinds: LayerKind[];
  /** Accent color for the section header */
  color: string;
}

/** Ordered display config for all layer categories.
 *  To add a new category (e.g. Terrain), add an entry here and update kindToCategory. */
export const LAYER_CATEGORIES: LayerCategoryConfig[] = [
  { id: 'terrain', label: 'Terrain', kinds: [], color: 'green.700' },
  { id: 'tiles', label: 'Tiles', kinds: ['visual'], color: 'blue.700' },
  { id: 'collision', label: 'Collision', kinds: ['collision'], color: 'orange.700' },
  { id: 'entities', label: 'Entities', kinds: ['entity'], color: 'purple.700' },
  { id: 'other', label: 'Other', kinds: ['navigation', 'metadata'], color: 'gray.700' },
];
