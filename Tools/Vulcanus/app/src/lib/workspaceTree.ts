import {
  Map as GameMap,
  Tileset,
  Character,
  EntityType,
  Item,
  Shop,
  DialogueDocument,
} from '../types/schema';
import { ResourceKind, WorkspaceTreeNode } from '../types/workspace';
import type { MusicCueSummary } from './musicApi';
import {
  listLocationDescriptors,
  listTilesetDescriptors,
  listCharacterDescriptors,
  listEntityDescriptors,
  listItemDescriptors,
  listShopDescriptors,
  listRoutineDescriptors,
  listQuestDescriptors,
  listBuildingKitDescriptors,
  listBuildingDescriptors,
  listDialogueDescriptors,
  listMusicDescriptors,
  listCutsceneDescriptors,
  ResourceDescriptor,
} from './resourceAdapters';
import { createWorkspaceScreenDocument } from './workspaceRouting';

// ─── Public input shape ───────────────────────────────────────────────────────

export interface WorkspaceTreeInput {
  maps: GameMap[];
  tilesets: Map<string, Tileset>;
  characters: Character[];
  entityTypes: EntityType[];
  items: Item[];
  shops: Shop[];
  quests?: import('../types/quest').Quest[];
  buildingKits?: import('../types/building').BuildingKit[];
  buildings?: import('../types/building').Building[];
  routines: import('../types/routine').Routine[];
  dialogues: DialogueDocument[];
  cutscenes?: import('../types/cutscene').Cutscene[];
  cutsceneLabels?: Record<string, string>;
  cutsceneFolders?: Record<string, string>;
  musicCues?: MusicCueSummary[];
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

export function buildWorkspaceTree(input: WorkspaceTreeInput): WorkspaceTreeNode[] {
  const locationNodes = buildResourceSection(
    'location',
    'Locations',
    'locations',
    listLocationDescriptors(input.maps),
    'location',
  );

  const tilesetNodes = buildResourceSection(
    'tileset',
    'Tilesets',
    'tilesets',
    listTilesetDescriptors(input.tilesets),
    'tileset',
  );

  const characterNodes = buildResourceSection(
    'character',
    'Characters',
    'characters',
    listCharacterDescriptors(input.characters),
    'characters',
  );

  const entityNodes = buildResourceSection(
    'entity',
    'Entities',
    'entities',
    listEntityDescriptors(input.entityTypes),
    'entities',
  );

  const itemNodes = buildResourceSection(
    'item',
    'Items',
    'items',
    listItemDescriptors(input.items),
    'items',
  );

  const shopNodes = buildResourceSection(
    'shop',
    'Shops',
    'shops',
    listShopDescriptors(input.shops),
    'shops',
  );

  const routineNodes = buildResourceSection(
    'routine',
    'Routines',
    'routines',
    listRoutineDescriptors(input.routines, input.characters),
    'routines',
  );

  const dialogueNodes = buildResourceSection(
    'dialogue',
    'Dialogues',
    'dialogues',
    listDialogueDescriptors(input.dialogues),
    'dialogues',
  );

  return [
    locationNodes,
    tilesetNodes,
    buildResourceSection(
      'building',
      'Buildings',
      'buildings',
      listBuildingDescriptors(input.buildings ?? []),
      'buildings',
    ),
    buildResourceSection(
      'building-kit',
      'Kits',
      'kits',
      listBuildingKitDescriptors(input.buildingKits ?? []),
      'kits',
    ),
    characterNodes,
    entityNodes,
    itemNodes,
    shopNodes,
    routineNodes,
    buildResourceSection(
      'quest',
      'Quests',
      'quests',
      listQuestDescriptors(input.quests ?? []),
      'quests',
    ),
    dialogueNodes,
    buildResourceSection(
      'cutscene',
      'Cutscenes',
      'cutscene',
      listCutsceneDescriptors(input.cutscenes ?? [], input.cutsceneLabels, input.cutsceneFolders),
      'cutscene',
    ),
    buildResourceSection(
      'music',
      'Music',
      'music',
      listMusicDescriptors(input.musicCues ?? []),
      'music',
    ),
    {
      id: 'data',
      kind: 'leaf',
      label: 'Data',
      icon: 'data',
      document: createWorkspaceScreenDocument('data'),
    },
    {
      id: 'scripting',
      kind: 'leaf',
      label: 'Scripting',
      icon: 'scripting',
      document: createWorkspaceScreenDocument('scripting'),
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
      id: 'config',
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

// ─── Section builder ──────────────────────────────────────────────────────────

function buildResourceSection(
  resourceKind: ResourceKind,
  label: string,
  icon: string,
  descriptors: ResourceDescriptor[],
  leafIcon: string,
): WorkspaceTreeNode {
  const groupId = `group:${getResourceGroupIdSuffix(resourceKind)}`;
  const sorted = descriptors.slice().sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: groupId,
    kind: 'group',
    label,
    icon,
    resourceKind,
    defaultExpanded: true,
    children: buildFolderChildren('', resourceKind, sorted, '', leafIcon),
  };
}

// ─── Folder partitioning ──────────────────────────────────────────────────────

function buildFolderChildren(
  _parentId: string,
  resourceKind: ResourceKind,
  descriptors: ResourceDescriptor[],
  currentPath: string,
  leafIcon: string,
): WorkspaceTreeNode[] {
  const directItems: ResourceDescriptor[] = [];
  const subfolderMap = new globalThis.Map<string, ResourceDescriptor[]>();

  for (const descriptor of descriptors) {
    const rel = getRelativePath(descriptor.folderPath, currentPath);
    if (!rel) {
      directItems.push(descriptor);
      continue;
    }

    const topSegment = rel.split('/')[0];
    if (!subfolderMap.has(topSegment)) subfolderMap.set(topSegment, []);
    subfolderMap.get(topSegment)!.push(descriptor);
  }

  const folderNodes: WorkspaceTreeNode[] = Array.from(subfolderMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([segment, children]) => {
      const folderPath = currentPath ? `${currentPath}/${segment}` : segment;
      const folderId = `folder:${resourceKind}:${folderPath}`;
      return {
        id: folderId,
        kind: 'folder' as const,
        label: segment,
        icon: 'folder',
        resourceKind,
        children: buildFolderChildren('', resourceKind, children, folderPath, leafIcon),
      };
    });

  const leafNodes: WorkspaceTreeNode[] = directItems.map((descriptor) =>
    buildResourceLeaf(descriptor, leafIcon),
  );

  return [...folderNodes, ...leafNodes];
}

function getRelativePath(folderPath: string, currentPath: string): string {
  if (!folderPath) return '';
  if (!currentPath) return folderPath;
  if (folderPath === currentPath) return '';
  if (folderPath.startsWith(currentPath + '/')) {
    return folderPath.slice(currentPath.length + 1);
  }
  return '';
}

function buildResourceLeaf(descriptor: ResourceDescriptor, icon: string): WorkspaceTreeNode {
  return {
    id: getLeafNodeId(descriptor),
    kind: 'leaf',
    label: descriptor.name,
    icon,
    resourceIcon: descriptor.resourceIcon,
    resourceKind: descriptor.kind,
    document: descriptor.document,
  };
}

export function getLeafNodeId(descriptor: ResourceDescriptor): string {
  return `${descriptor.kind}:${descriptor.id}`;
}

function getResourceGroupIdSuffix(resourceKind: ResourceKind): string {
  switch (resourceKind) {
    case 'location':
      return 'locations';
    case 'tileset':
      return 'tilesets';
    case 'character':
      return 'characters';
    case 'entity':
      return 'entities';
    case 'item':
      return 'items';
    case 'shop':
      return 'shops';
    case 'quest':
      return 'quests';
    case 'building-kit':
      return 'kits';
    case 'building':
      return 'buildings';
    case 'routine':
      return 'routines';
    case 'cutscene':
      return 'cutscenes';
    case 'dialogue':
      return 'dialogues';
    case 'music':
      return 'music';
  }
}

// ─── Helpers used by App.tsx ──────────────────────────────────────────────────

export function collectDefaultExpandedNodeIds(nodes: WorkspaceTreeNode[]): string[] {
  const collected: string[] = [];
  for (const node of nodes) {
    if (node.defaultExpanded) {
      collected.push(node.id);
    }
    if (node.children?.length) {
      collected.push(...collectDefaultExpandedNodeIds(node.children));
    }
  }
  return collected;
}

export function findFirstDocument(
  nodes: WorkspaceTreeNode[],
  predicate: (node: WorkspaceTreeNode) => boolean,
): WorkspaceTreeNode | null {
  for (const node of nodes) {
    if (node.document && predicate(node)) {
      return node;
    }
    if (node.children?.length) {
      const child = findFirstDocument(node.children, predicate);
      if (child) return child;
    }
  }
  return null;
}
