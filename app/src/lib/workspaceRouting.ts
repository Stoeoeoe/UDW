import { Map as GameMap } from '../types/schema';
import {
  WorkspaceConfigTab,
  WorkspaceDocument,
  WorkspaceProjectSnapshot,
  WorkspaceScreenKind,
} from '../types/workspace';

const CONFIG_TABS = new Set<WorkspaceConfigTab>([
  'terrain',
  'metadata',
  'layers',
  'locations',
  'itemclasses',
]);

export function createLocationDocument(
  map: GameMap,
  variationId: string | null = null,
): WorkspaceDocument {
  return {
    kind: 'location',
    mapId: map.id,
    variationId,
    label: map.name,
    saveUnitId: `location:${map.id}`,
  };
}

export function createWorkspaceScreenDocument(kind: WorkspaceScreenKind): WorkspaceDocument {
  switch (kind) {
    case 'entities':
      return {
        kind,
        label: 'Entities',
        saveUnitId: 'configuration',
      };
    case 'actors':
      return {
        kind,
        label: 'Actors',
        saveUnitId: 'actors',
      };
    case 'items':
      return {
        kind,
        label: 'Items',
        saveUnitId: 'items',
      };
    case 'dialogues':
      return {
        kind,
        label: 'Dialogues',
        saveUnitId: 'dialogues',
      };
    case 'scripting':
      return {
        kind,
        label: 'Scripting',
        saveUnitId: 'configuration',
      };
  }
}

export function documentToHash(document: WorkspaceDocument): string {
  const params = new URLSearchParams();

  switch (document.kind) {
    case 'location':
      params.set('doc', 'location');
      params.set('id', document.mapId);
      break;
    case 'tileset':
      params.set('doc', 'tileset');
      params.set('id', document.tilesetId);
      break;
    case 'settings':
      params.set('doc', 'settings');
      break;
    case 'configuration':
      params.set('doc', 'config');
      if (document.configTab) params.set('tab', document.configTab);
      break;
    case 'entities':
    case 'actors':
    case 'items':
    case 'dialogues':
    case 'scripting':
      params.set('doc', document.kind);
      break;
  }

  return `#/?${params.toString()}`;
}

export function documentFromHash(
  hash: string,
  snapshot: WorkspaceProjectSnapshot,
): WorkspaceDocument | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const query = raw.startsWith('/?') ? raw.slice(2) : raw.startsWith('?') ? raw.slice(1) : '';
  const params = new URLSearchParams(query);
  const doc = params.get('doc');

  if (!doc) return null;

  if (doc === 'location-overview' || doc === 'location') {
    const mapId = params.get('id');
    if (!mapId) return null;
    const map = snapshot.maps.find((entry) => entry.id === mapId);
    if (!map) return null;
    const variant = params.get('variant');
    const resolvedVariant =
      variant && variant !== 'base' && map.variations?.some((entry) => entry.id === variant)
        ? variant
        : null;
    return createLocationDocument(map, resolvedVariant);
  }

  if (doc === 'tileset') {
    const tilesetId = params.get('id');
    if (!tilesetId || !snapshot.tilesets.has(tilesetId)) return null;
    const tileset = snapshot.tilesets.get(tilesetId);
    return {
      kind: 'tileset',
      tilesetId,
      label: tileset?.name ?? tilesetId,
      saveUnitId: `tileset:${tilesetId}`,
    };
  }

  if (doc === 'settings') {
    return {
      kind: 'settings',
      label: 'Settings',
      saveUnitId: 'settings',
    };
  }

  if (doc === 'config') {
    const rawTab = params.get('tab');
    const configTab =
      rawTab && CONFIG_TABS.has(rawTab as WorkspaceConfigTab)
        ? (rawTab as WorkspaceConfigTab)
        : 'terrain';
    return {
      kind: 'configuration',
      label: 'Configuration',
      saveUnitId: 'configuration',
      configTab,
    };
  }

  if (
    doc === 'entities' ||
    doc === 'actors' ||
    doc === 'items' ||
    doc === 'dialogues' ||
    doc === 'scripting'
  ) {
    return createWorkspaceScreenDocument(doc);
  }

  if (doc === 'legacy') {
    const mode = params.get('mode');
    if (
      mode === 'entities' ||
      mode === 'actors' ||
      mode === 'items' ||
      mode === 'dialogues' ||
      mode === 'scripting'
    ) {
      return createWorkspaceScreenDocument(mode);
    }
  }

  return null;
}
