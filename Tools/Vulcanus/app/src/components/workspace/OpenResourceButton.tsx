import React, { useMemo } from 'react';
import { Tooltip } from '@chakra-ui/react';
import { FiExternalLink } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { buildCommandPaletteResources } from '../../lib/workspaceCommandPalette';
import type { ResourceKey } from '../../lib/resourceReferences';
import { GhostIconButton } from '../common/IconButtons';

/** Every resource of the project by `type:id`, with the document that opens it. */
export function useResourceIndex() {
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const characters = useEditorStore((state) => state.characters);
  const items = useEditorStore((state) => state.items);
  const shops = useEditorStore((state) => state.shops);
  const quests = useEditorStore((state) => state.quests);
  const routines = useEditorStore((state) => state.routines);
  const dialogues = useEditorStore((state) => state.dialogues);
  const cutscenes = useEditorStore((state) => state.cutscenes);
  const buildingKits = useEditorStore((state) => state.buildingKits);
  const buildings = useEditorStore((state) => state.buildings);
  return useMemo(
    () =>
      new Map(
        buildCommandPaletteResources({
          maps,
          tilesets,
          entityTypes,
          characters,
          items,
          shops,
          quests,
          routines,
          dialogues: Array.from(dialogues.values()),
          cutscenes,
          buildingKits,
          buildings,
        }).map((resource) => [resource.key, resource]),
      ),
    [
      buildingKits,
      buildings,
      characters,
      cutscenes,
      dialogues,
      entityTypes,
      items,
      maps,
      quests,
      routines,
      shops,
      tilesets,
    ],
  );
}

/** Opens the referenced resource in its own tab, next to the field that names it. Disabled when it does not exist. */
export const OpenResourceButton: React.FC<{ resource: ResourceKey | null; label?: string }> = ({
  resource,
  label = 'Open',
}) => {
  const index = useResourceIndex();
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const target = resource?.id ? index.get(`${resource.type}:${resource.id}`) : undefined;
  return (
    <Tooltip hasArrow label={target ? `${label} ${target.label}` : label}>
      <GhostIconButton
        aria-label={label}
        icon={<FiExternalLink />}
        size="xs"
        isDisabled={!target}
        onClick={() => target && openDocument(target.document, { pin: true })}
      />
    </Tooltip>
  );
};
