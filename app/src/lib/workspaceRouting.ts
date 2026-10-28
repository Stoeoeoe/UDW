import { Map as GameMap } from '../types/schema';
import { createEditorResourceDocument } from './editorResourceTypes';
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
  const document = createEditorResourceDocument({
    type: 'location',
    id: map.id,
    name: map.name,
  }) as Extract<WorkspaceDocument, { kind: 'location' }>;

  return {
    ...document,
    variationId,
  };
}

export function createWorkspaceScreenDocument(kind: WorkspaceScreenKind): WorkspaceDocument {
  switch (kind) {
    case 'data':
      return { kind, label: 'Data', saveUnitId: 'configuration' };
    case 'cutscenes':
      return { kind, label: 'Cutscenes', saveUnitId: 'cutscenes' };
    case 'entities':
      return {
        kind,
        label: 'Entities',
        saveUnitId: 'configuration',
      };
    case 'characters':
      return {
        kind,
        label: 'Characters',
        saveUnitId: 'characters',
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
    case 'character':
      params.set('doc', 'character');
      params.set('id', document.characterId);
      break;
    case 'entity':
      params.set('doc', 'entity');
      params.set('id', document.entityTypeId);
      break;
    case 'item':
      params.set('doc', 'item');
      params.set('id', document.itemId);
      break;
    case 'cutscene':
      params.set('doc', 'cutscene');
      params.set('id', document.cutsceneId);
      break;
    case 'dialogue':
      params.set('doc', 'dialogue');
      params.set('id', document.dialogueId);
      break;
    case 'variable':
      params.set('doc', 'variable');
      params.set('id', document.variableKey);
      break;
    case 'entities':
    case 'characters':
    case 'items':
    case 'dialogues':
    case 'cutscenes':
    case 'scripting':
    case 'data':
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
    return createEditorResourceDocument({
      type: 'tileset',
      id: tilesetId,
      name: tileset?.name ?? tilesetId,
    });
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

  if (doc === 'character') {
    const characterId = params.get('id');
    if (!characterId) return null;
    const character = snapshot.characters?.find((a) => a.id === characterId);
    if (!character) return null;
    return createEditorResourceDocument({
      type: 'character',
      id: character.id,
      name: character.name,
    });
  }

  if (doc === 'entity') {
    const entityTypeId = params.get('id');
    if (!entityTypeId) return null;
    const et = snapshot.entityTypes?.find((e) => e.id === entityTypeId);
    if (!et) return null;
    return createEditorResourceDocument({
      type: 'entity',
      id: et.id,
      name: et.displayName,
    });
  }

  if (doc === 'item') {
    const itemId = params.get('id');
    if (!itemId) return null;
    const item = snapshot.items?.find((i) => i.id === itemId);
    if (!item) return null;
    return createEditorResourceDocument({
      type: 'item',
      id: item.id,
      name: item.name,
    });
  }

  if (doc === 'cutscene') {
    const scene = snapshot.cutscenes?.find((scene) => scene.id === params.get('id'));
    return scene
      ? createEditorResourceDocument({
          type: 'cutscene',
          id: scene.id,
          name: snapshot.cutsceneLabels?.[scene.id] || scene.id,
        })
      : null;
  }

  if (doc === 'dialogue') {
    const dialogueId = params.get('id');
    if (!dialogueId) return null;
    const dialogue = snapshot.dialogues?.find((d) => d.id === dialogueId);
    if (!dialogue) return null;
    return createEditorResourceDocument({
      type: 'dialogue',
      id: dialogue.id,
      name: dialogue.name,
    });
  }

  if (doc === 'variable') {
    const variableKey = params.get('id');
    if (!variableKey) return null;
    const variable = snapshot.gameVariables?.find((v) => v.key === variableKey);
    if (!variable) return null;
    return createEditorResourceDocument({
      type: 'variable',
      id: variable.key,
      name: variable.key,
    });
  }

  if (
    doc === 'cutscenes' ||
    doc === 'entities' ||
    doc === 'characters' ||
    doc === 'items' ||
    doc === 'dialogues' ||
    doc === 'scripting' ||
    doc === 'data'
  ) {
    return createWorkspaceScreenDocument(doc);
  }

  if (doc === 'legacy') {
    const mode = params.get('mode');
    if (
      mode === 'entities' ||
      mode === 'characters' ||
      mode === 'items' ||
      mode === 'dialogues' ||
      mode === 'scripting'
    ) {
      return createWorkspaceScreenDocument(mode);
    }
  }

  return null;
}
