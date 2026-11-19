import React, { useMemo } from 'react';
import {
  Menu,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  MenuList,
  Text,
} from '@chakra-ui/react';
import { FiLink } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useResourceIndex } from './OpenResourceButton';
import {
  allReferences,
  usedBy,
  usesOf,
  type ResourceKey,
  type ResourceReference,
} from '../../lib/resourceReferences';
import { GhostIconButton } from '../common/IconButtons';

/**
 * Header menu of one resource's links: what it uses and what uses it, each one click from opening. A reference to a
 * resource that does not exist is shown but cannot be opened.
 */
export const ResourceLinks: React.FC<{ resource: ResourceKey }> = ({ resource }) => {
  const characters = useEditorStore((state) => state.characters);
  const quests = useEditorStore((state) => state.quests);
  const routines = useEditorStore((state) => state.routines);
  const shops = useEditorStore((state) => state.shops);
  const dialogues = useEditorStore((state) => state.dialogues);
  const byKey = useResourceIndex();
  const openDocument = useWorkspaceStore((state) => state.openDocument);

  const { uses, usedByList } = useMemo(() => {
    const references = allReferences({
      characters,
      quests,
      routines,
      dialogues: Array.from(dialogues.values()),
      shops,
    });
    return { uses: usesOf(references, resource), usedByList: usedBy(references, resource) };
  }, [characters, dialogues, quests, resource, routines, shops]);

  const count = uses.length + usedByList.length;
  const entry = (key: ResourceKey) => byKey.get(`${key.type}:${key.id}`);

  const row = (reference: ResourceReference, other: ResourceKey) => {
    const target = entry(other);
    return (
      <MenuItem
        key={`${other.type}:${other.id}:${reference.via}`}
        isDisabled={!target}
        onClick={() => target && openDocument(target.document, { pin: true })}
      >
        <Text as="span" noOfLines={1}>
          {target?.label ?? other.id}
        </Text>
        <Text as="span" ml={2} fontSize="xs" color="editorMutedText" noOfLines={1}>
          {target?.typeLabel ?? 'missing'} · {reference.via}
        </Text>
      </MenuItem>
    );
  };

  return (
    <Menu isLazy placement="bottom-end">
      <MenuButton
        as={GhostIconButton}
        aria-label={`Links (${count})`}
        title={count ? `${uses.length} used, ${usedByList.length} used by` : 'No links'}
        icon={<FiLink />}
        size="xs"
        isDisabled={!count}
      />
      <MenuList maxH="60vh" overflowY="auto" minW="320px">
        {uses.length > 0 && (
          <MenuGroup title="Uses">
            {uses.map((reference) => row(reference, reference.to))}
          </MenuGroup>
        )}
        {uses.length > 0 && usedByList.length > 0 && <MenuDivider />}
        {usedByList.length > 0 && (
          <MenuGroup title="Used by">
            {usedByList.map((reference) => row(reference, reference.from))}
          </MenuGroup>
        )}
      </MenuList>
    </Menu>
  );
};
