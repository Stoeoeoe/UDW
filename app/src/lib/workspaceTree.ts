import { Map as GameMap, Tileset } from '../types/schema';
import { WorkspaceTreeNode } from '../types/workspace';
import { createLocationDocument, createWorkspaceScreenDocument } from './workspaceRouting';

export function buildWorkspaceTree(
  maps: GameMap[],
  tilesets: Map<string, Tileset>,
): WorkspaceTreeNode[] {
  const locationChildren = maps
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((map) => buildLocationNode(map));

  const tilesetChildren = Array.from(tilesets.values())
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map<WorkspaceTreeNode>((tileset) => ({
      id: `tileset:${tileset.id}`,
      kind: 'leaf',
      label: tileset.name,
      icon: 'tileset',
      document: {
        kind: 'tileset',
        tilesetId: tileset.id,
        label: tileset.name,
        saveUnitId: `tileset:${tileset.id}`,
      },
    }));

  return [
    {
      id: 'group:locations',
      kind: 'group',
      label: 'Locations',
      icon: 'locations',
      defaultExpanded: true,
      children: locationChildren,
    },
    {
      id: 'group:tilesets',
      kind: 'group',
      label: 'Tilesets',
      icon: 'tilesets',
      defaultExpanded: true,
      children: tilesetChildren,
    },
    {
      id: 'group:game-data',
      kind: 'group',
      label: 'Game Data',
      icon: 'game-data',
      defaultExpanded: true,
      children: [
        {
          id: 'entities',
          kind: 'leaf',
          label: 'Entities',
          icon: 'entities',
          document: createWorkspaceScreenDocument('entities'),
        },
        {
          id: 'actors',
          kind: 'leaf',
          label: 'Actors',
          icon: 'actors',
          document: createWorkspaceScreenDocument('actors'),
        },
        {
          id: 'items',
          kind: 'leaf',
          label: 'Items',
          icon: 'items',
          document: createWorkspaceScreenDocument('items'),
        },
        {
          id: 'dialogues',
          kind: 'leaf',
          label: 'Dialogues',
          icon: 'dialogues',
          document: createWorkspaceScreenDocument('dialogues'),
        },
        {
          id: 'scripting',
          kind: 'leaf',
          label: 'Scripting',
          icon: 'scripting',
          document: createWorkspaceScreenDocument('scripting'),
        },
      ],
    },
    {
      id: 'settings',
      kind: 'leaf',
      label: 'Settings',
      icon: 'settings',
      document: {
        kind: 'settings',
        label: 'Settings',
        saveUnitId: 'settings',
      },
    },
    {
      id: 'configuration',
      kind: 'leaf',
      label: 'Configuration',
      icon: 'configuration',
      document: {
        kind: 'configuration',
        label: 'Configuration',
        saveUnitId: 'configuration',
        configTab: 'terrain',
      },
    },
  ];
}

function buildLocationNode(map: GameMap): WorkspaceTreeNode {
  return {
    id: `location:${map.id}`,
    kind: 'leaf',
    label: map.name,
    icon: 'location',
    document: createLocationDocument(map, null),
  };
}
