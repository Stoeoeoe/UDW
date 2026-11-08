import React from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useWorkspaceStore, supportsPreviewTab } from '../store/useWorkspaceStore';
import { ensureDocumentSession } from '../lib/workspaceController';
import {
  buildCommandPaletteResources,
  CommandPaletteFilter,
  CommandPaletteMatch,
  searchCommandPaletteResources,
} from '../lib/workspaceCommandPalette';

function filterCommandPaletteMatch(
  match: CommandPaletteMatch,
  filter: CommandPaletteFilter,
): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'locations':
      return match.resource.type === 'location';
    case 'tilesets':
      return match.resource.type === 'tileset';
    case 'entities':
      return match.resource.type === 'entity';
    case 'characters':
      return match.resource.type === 'character';
    case 'items':
      return match.resource.type === 'item';
    case 'shops':
      return match.resource.type === 'shop';
    case 'cutscenes':
      return match.resource.type === 'cutscene';
    case 'dialogues':
      return match.resource.type === 'dialogue';
    default:
      return true;
  }
}

export function useCommandPalette() {
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const characters = useEditorStore((state) => state.characters);
  const items = useEditorStore((state) => state.items);
  const shops = useEditorStore((state) => state.shops);
  const dialogues = useEditorStore((state) => state.dialogues);
  const cutscenes = useEditorStore((s) => s.cutscenes);
  const cutsceneLabels = useEditorStore((s) => s.cutsceneLabels);

  const recentResourceKeys = useWorkspaceStore((state) => state.recentResourceKeys);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const markRecentResource = useWorkspaceStore((state) => state.markRecentResource);
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<CommandPaletteFilter>('all');
  const [selectedIndex, setSelectedIndex] = React.useState(-1);

  const resources = React.useMemo(
    () =>
      buildCommandPaletteResources({
        maps,
        tilesets,
        entityTypes,
        characters,
        items,
        shops,
        dialogues: Array.from(dialogues.values()),
        cutscenes,
        cutsceneLabels,
      }),
    [
      characters,
      dialogues,
      cutscenes,
      cutsceneLabels,
      entityTypes,
      items,
      maps,
      shops,
      tilesets,
    ],
  );

  const resourceMap = React.useMemo(
    () => new Map(resources.map((resource) => [resource.key, resource])),
    [resources],
  );

  const results = React.useMemo(() => {
    if (!query.trim()) {
      return recentResourceKeys
        .map((key) => resourceMap.get(key))
        .filter((resource): resource is NonNullable<typeof resource> => resource !== undefined)
        .map(
          (resource, index): CommandPaletteMatch => ({
            resource,
            matchedField: 'label',
            labelMatchIndices: [],
            secondaryMatchIndices: [],
            score: 1000 - index,
          }),
        )
        .filter((match) => filterCommandPaletteMatch(match, filter));
    }

    return searchCommandPaletteResources(resources, query, filter);
  }, [filter, query, resourceMap, resources, recentResourceKeys]);

  const open = React.useCallback(() => {
    setQuery('');
    setFilter('all');
    setSelectedIndex(-1);
    setIsOpen(true);
  }, []);

  const close = React.useCallback(() => setIsOpen(false), []);

  const openResult = React.useCallback(
    (result: CommandPaletteMatch, options?: { pin?: boolean }) => {
      const tab = openDocument(result.resource.document, {
        preview: !options?.pin && supportsPreviewTab(result.resource.document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
      markRecentResource(result.resource.key);
      close();
    },
    [activateTab, close, markRecentResource, openDocument],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.defaultPrevented || event.key.toLowerCase() !== 'p') return;
      event.preventDefault();
      if (isOpen) {
        close();
        return;
      }
      open();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [close, isOpen, open]);

  React.useEffect(() => {
    const handleOpenCommandPalette = () => {
      if (isOpen) {
        close();
        return;
      }
      open();
    };

    window.addEventListener('openCommandPalette', handleOpenCommandPalette as EventListener);
    return () =>
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette as EventListener);
  }, [close, isOpen, open]);

  return {
    isOpen,
    query,
    filter,
    results,
    selectedIndex,
    open,
    close,
    setQuery,
    setFilter,
    setSelectedIndex,
    openResult,
  };
}
