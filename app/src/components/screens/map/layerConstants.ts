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

export type LayerCategory = 'visual' | 'collision' | 'entities' | 'other';

/** Maps a LayerKind to its display category. */
export function kindToCategory(kind: LayerKind): LayerCategory {
  switch (kind) {
    case 'terrain':
    case 'visual':
    case 'object':
      return 'visual';
    case 'collision':
      return 'collision';
    case 'entity':
      return 'entities';
    case 'navigation':
    case 'metadata':
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
  /**
   * Kinds within this category that are system-managed (auto-created, not user-addable).
   * The + button is hidden when ALL kinds are system kinds.
   */
  systemKinds?: LayerKind[];
}

/** Ordered display config for all layer categories. */
export const LAYER_CATEGORIES: LayerCategoryConfig[] = [
  {
    id: 'visual',
    label: 'Visual',
    kinds: ['visual', 'terrain', 'object'],
    color: 'blue.700',
  },
  { id: 'collision', label: 'Collision', kinds: ['collision'], color: 'orange.700' },
  { id: 'entities', label: 'Entities', kinds: ['entity'], color: 'purple.700' },
  {
    id: 'other',
    label: 'Other',
    kinds: ['navigation', 'metadata'],
    systemKinds: ['navigation'],
    color: 'gray.700',
  },
];
