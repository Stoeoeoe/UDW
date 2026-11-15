import React from 'react';
import { AddIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  SimpleGrid,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { ContextMenuState, WorkspaceContextMenu } from './WorkspaceContextMenu';
import {
  FiBox,
  FiFilm,
  FiCode,
  FiDatabase,
  FiChevronDown,
  FiChevronRight,
  FiChevronsDown,
  FiSearch,
  FiStar,
  FiClock,
  FiX,
  FiFolder,
  FiGrid,
  FiMap,
  FiMapPin,
  FiMessageSquare,
  FiPackage,
  FiEdit2,
  FiSettings,
  FiSliders,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi';
import { WorkspaceDocument, WorkspaceTreeNode } from '../../types/workspace';
import { useSaveStore } from '../../lib/saveManager';
import { SectionLabel } from '../common/Typography.tsx';
import {
  supportsPreviewTab,
  getDocumentSaveUnitId,
  getWorkspaceTabId,
  useWorkspaceStore,
} from '../../store/useWorkspaceStore';
import {
  canDeleteEditorResourceDocument,
  canEditMetadataForResourceDocument,
  deleteEditorResourceDocument,
  getEditorResourceDocumentTabId,
  getNodeAccent,
  getDocumentResourceKind,
  NodeAccent,
} from '../../lib/editorResourceTypes';
import { canCreateResourceKind } from '../../lib/resourceAdapters';
import { WorkspaceNodeVisual } from './WorkspaceNodeVisual';
import { WorkspaceCreateDialog, CreateDialogState } from './WorkspaceCreateDialog';
import { WorkspaceEditDialog, EditDialogState } from './WorkspaceEditDialog';

interface WorkspaceExplorerProps {
  nodes: WorkspaceTreeNode[];
  expandedNodeIds: string[];
  activeTabId: string | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  headerAction?: React.ReactNode;
  onOpenDocument?: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}

function getNodeIcon(node: WorkspaceTreeNode) {
  switch (node.icon) {
    case 'locations':
    case 'location':
      return FiMapPin;
    case 'map-base':
    case 'map-variation':
      return FiMap;
    case 'tilesets':
    case 'tileset':
      return FiGrid;
    case 'entities':
      return FiBox;
    case 'characters':
      return FiUsers;
    case 'items':
      return FiPackage;
    case 'cutscene':
      return FiFilm;
    case 'quests':
      return FiStar;
    case 'routines':
      return FiClock;
    case 'dialogues':
      return FiMessageSquare;
    case 'scripting':
      return FiCode;
    case 'data':
      return FiDatabase;
    case 'settings':
      return FiSettings;
    case 'configuration':
      return FiSliders;
    case 'folder':
      return FiFolder;
    default:
      return FiMap;
  }
}

function getNodeAccentFromNode(node: WorkspaceTreeNode): NodeAccent | null {
  const resourceKind = node.resourceKind ?? getDocumentResourceKind(node.document);
  return getNodeAccent(resourceKind);
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  nodes,
  expandedNodeIds,
  activeTabId,
  onToggleNode,
  onOpenNode,
  headerAction,
  onOpenDocument,
}) => {
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [createDialog, setCreateDialog] = React.useState<CreateDialogState>(null);
  const [editDialog, setEditDialog] = React.useState<EditDialogState>(null);
  const favoriteResourceKeys = useWorkspaceStore((state) => state.favoriteResourceKeys);
  const recentResourceKeys = useWorkspaceStore((state) => state.recentResourceKeys);
  const toggleFavoriteResource = useWorkspaceStore((state) => state.toggleFavoriteResource);
  const favorites = React.useMemo(() => new Set(favoriteResourceKeys), [favoriteResourceKeys]);

  const primaryNodes = React.useMemo(
    () =>
      nodes.filter(
        (node) =>
          !(
            node.kind === 'leaf' &&
            (node.document?.kind === 'scripting' ||
              node.document?.kind === 'data' ||
              node.document?.kind === 'settings' ||
              node.document?.kind === 'configuration')
          ),
      ),
    [nodes],
  );

  const utilityNodes = React.useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.kind === 'leaf' &&
          (node.document?.kind === 'scripting' ||
            node.document?.kind === 'data' ||
            node.document?.kind === 'settings' ||
            node.document?.kind === 'configuration'),
      ),
    [nodes],
  );

  const activePath = React.useMemo(
    () => findActiveNodePath(primaryNodes, activeTabId),
    [primaryNodes, activeTabId],
  );
  const activeSectionId = activePath[0]?.id;
  const [selectedSectionId, setSelectedSectionId] = React.useState(
    () => activeSectionId ?? primaryNodes[0]?.id,
  );
  const [query, setQuery] = React.useState('');
  const selectedSection =
    primaryNodes.find((node) => node.id === selectedSectionId) ?? primaryNodes[0];

  // Reveal on document activation, not on every folder toggle or resource edit.
  const navigation = React.useRef({ activePath, expandedNodeIds, onToggleNode });
  navigation.current = { activePath, expandedNodeIds, onToggleNode };
  React.useEffect(() => {
    if (!activeSectionId) return;
    setSelectedSectionId(activeSectionId);
    setQuery('');
    const current = navigation.current;
    for (const node of current.activePath) {
      if (node.children && !current.expandedNodeIds.includes(node.id))
        current.onToggleNode(node.id);
    }
  }, [activeTabId, activeSectionId]);

  const searchTerm = query.trim().toLocaleLowerCase();
  const visibleSection = selectedSection && {
    ...selectedSection,
    children: searchTerm
      ? filterNodes(selectedSection.children ?? [], searchTerm)
      : selectedSection.children,
  };
  const visibleExpandedIds =
    searchTerm && visibleSection
      ? [...expandedNodeIds, ...collectBranchIds([visibleSection])]
      : expandedNodeIds;
  const resourceIndex = React.useMemo(() => {
    const index = new Map<string, { node: WorkspaceTreeNode; context: string }>();
    const visit = (node: WorkspaceTreeNode, context: string) => {
      const key = getEditorResourceDocumentTabId(node.document);
      if (key) index.set(key, { node, context });
      for (const child of node.children ?? [])
        visit(child, node.kind === 'folder' ? `${context} / ${node.label}` : context);
    };
    for (const section of primaryNodes) visit(section, section.label);
    return index;
  }, [primaryNodes]);
  // Deleted resources can leave preference keys behind; only live content is navigable.
  const resolveResources = (keys: string[]) =>
    keys
      .map((key) => resourceIndex.get(key))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const recentItems = resolveResources(recentResourceKeys.filter((key) => !favorites.has(key)));
  const favoriteItems = resolveResources(favoriteResourceKeys);
  const searchLabel = selectedSection?.label;

  const handleContextMenu = React.useCallback(
    (node: WorkspaceTreeNode, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ node, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const handleOpenDocument = React.useCallback(
    (document: WorkspaceDocument, options?: { pin?: boolean }) => {
      if (onOpenDocument) {
        onOpenDocument(document, options);
        return;
      }
      onOpenNode({ id: '', kind: 'leaf', label: '', document }, options);
    },
    [onOpenDocument, onOpenNode],
  );

  const handleCreateResource = React.useCallback(
    (kind: NonNullable<WorkspaceTreeNode['resourceKind']>, folderPath: string) => {
      setCreateDialog({ kind, folderPath });
    },
    [],
  );

  const handleEditResource = React.useCallback((node: WorkspaceTreeNode) => {
    if (!node.document) return;
    if (!canEditMetadataForResourceDocument(node.document)) return;
    setEditDialog({ document: node.document });
  }, []);

  const handleDeleteResource = React.useCallback(async (node: WorkspaceTreeNode) => {
    if (!node.document) return;
    if (!canDeleteEditorResourceDocument(node.document)) return;
    if (!confirm(`Delete "${node.label}"?`)) return;
    await deleteEditorResourceDocument(node.document);
  }, []);

  const sharedNodeProps = {
    expandedNodeIds: visibleExpandedIds,
    activeTabId,
    onToggleNode,
    onOpenNode,
    onContextMenu: handleContextMenu,
    onCreateResource: handleCreateResource,
    onEditResource: handleEditResource,
    onDeleteResource: handleDeleteResource,
    favorites,
    onToggleFavorite: toggleFavoriteResource,
  };

  return (
    <VStack align="stretch" spacing={0} h="full" bg="editorSidebarBg" overflow="hidden">
      <HStack
        px={4}
        py={3}
        borderBottom="1px"
        borderColor="editorShellBorder"
        justify="space-between"
        align="center"
      >
        <VStack align="start" spacing={0}>
          <SectionLabel textStyle="panelLabel">Project</SectionLabel>
        </VStack>
        {headerAction}
      </HStack>
      <Box px={2} pt={3} pb={2}>
        <WorkspaceEditorPicker
          primaryNodes={primaryNodes}
          utilityNodes={utilityNodes}
          selectedSection={selectedSection}
          activeTabId={activeTabId}
          onSelect={(node) => {
            if (node.kind === 'group') {
              setSelectedSectionId(node.id);
              setQuery('');
              if (!expandedNodeIds.includes(node.id)) onToggleNode(node.id);
            } else {
              onOpenNode(node, { pin: true });
            }
          }}
        />
      </Box>
      {searchLabel && (
        <Box px={3} pb={3}>
          <InputGroup size="sm">
            <InputLeftElement pointerEvents="none" color="editorMutedText">
              <Icon as={FiSearch} boxSize={3.5} />
            </InputLeftElement>
            <Input
              aria-label={`Search ${searchLabel}`}
              placeholder={`Search ${searchLabel.toLocaleLowerCase()}...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setQuery('');
                }
              }}
              pr={8}
              fontSize="xs"
            />
            {query && (
              <InputRightElement>
                <IconButton
                  aria-label="Clear content search"
                  icon={<Icon as={FiX} />}
                  size="xs"
                  variant="ghost"
                  onClick={() => setQuery('')}
                />
              </InputRightElement>
            )}
          </InputGroup>
        </Box>
      )}
      <Box flex={1} minH={0} overflowY="auto" px={2} pb={3}>
        <VStack align="stretch" spacing={1}>
          {visibleSection && (
            <WorkspaceExplorerNode
              node={visibleSection}
              depth={0}
              accent={getNodeAccentFromNode(visibleSection)}
              itemCount={countDocuments(selectedSection?.children ?? [])}
              {...sharedNodeProps}
            />
          )}
          {visibleSection?.children?.length === 0 && (
            <Text role="status" fontSize="xs" color="editorMutedText" px={3} py={4}>
              {searchTerm
                ? 'No matching content.'
                : `No ${visibleSection.label.toLocaleLowerCase()} yet.`}
            </Text>
          )}
        </VStack>
      </Box>
      <Box
        borderTop="1px"
        borderColor="editorShellBorder"
        bg="editorHeaderBg"
        flexShrink={0}
        maxH="35%"
        display="flex"
        flexDirection="column"
      >
        {[
          {
            title: 'Favorites',
            icon: FiStar,
            items: favoriteItems,
            empty: 'Star content to keep it here.',
          },
          {
            title: 'Recently opened',
            icon: FiClock,
            items: recentItems,
            empty: 'No recently opened content yet.',
          },
        ].map(({ title, icon, items, empty }) => (
          <WorkspaceShortcutSection key={title} title={title} icon={icon} count={items.length}>
            {items.map(({ node, context }) => (
              <WorkspaceExplorerNode
                key={node.id}
                node={node}
                depth={0}
                accent={getNodeAccentFromNode(node)}
                contextLabel={context}
                {...sharedNodeProps}
              />
            ))}
            {items.length === 0 && (
              <Text fontSize="xs" color="editorMutedText" px={2} py={1}>
                {empty}
              </Text>
            )}
          </WorkspaceShortcutSection>
        ))}
      </Box>
      <WorkspaceContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpenDocument={handleOpenDocument}
        onCreateResource={handleCreateResource}
      />
      <WorkspaceCreateDialog
        state={createDialog}
        onClose={() => setCreateDialog(null)}
        onOpenDocument={handleOpenDocument}
      />
      <WorkspaceEditDialog
        state={editDialog}
        onClose={() => setEditDialog(null)}
        onOpenDocument={handleOpenDocument}
      />
    </VStack>
  );
};

const WorkspaceShortcutSection: React.FC<
  React.PropsWithChildren<{
    title: string;
    icon: React.ComponentType;
    count: number;
  }>
> = ({ title, icon, count, children }) => {
  const [expanded, setExpanded] = React.useState(true);
  const contentId = React.useId();
  return (
    <Box as="section" aria-label={title} display="flex" flexDirection="column" minH={7}>
      <Button
        variant="ghost"
        size="xs"
        h={7}
        minH={7}
        borderRadius={0}
        px={3}
        aria-label={title}
        aria-expanded={expanded}
        aria-controls={contentId}
        justifyContent="flex-start"
        flexShrink={0}
        color="editorMutedText"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon as={expanded ? FiChevronDown : FiChevronRight} boxSize={3} mr={2} />
        <Icon as={icon} boxSize={3} mr={2} />
        <SectionLabel flex={1} textAlign="left">
          {title}
        </SectionLabel>
        <Text fontSize="xs" fontWeight="normal">
          {count}
        </Text>
      </Button>
      <VStack
        id={contentId}
        hidden={!expanded}
        display={expanded ? 'flex' : 'none'}
        align="stretch"
        spacing={0}
        px={2}
        pb={1}
        minH={0}
        overflowY="auto"
      >
        {children}
      </VStack>
    </Box>
  );
};

const WorkspaceEditorPicker: React.FC<{
  primaryNodes: WorkspaceTreeNode[];
  utilityNodes: WorkspaceTreeNode[];
  selectedSection: WorkspaceTreeNode | undefined;
  activeTabId: string | null;
  onSelect: (node: WorkspaceTreeNode) => void;
}> = ({ primaryNodes, utilityNodes, selectedSection, activeTabId, onSelect }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const match = (node: WorkspaceTreeNode) =>
    node.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const sections = [
    { label: 'Editors', nodes: primaryNodes.filter(match) },
    { label: 'Project tools', nodes: utilityNodes.filter(match) },
  ];
  const results = sections.flatMap((section) => section.nodes);
  const select = (node: WorkspaceTreeNode) => {
    onSelect(node);
    onClose();
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpen={() => {
        setQuery('');
        onOpen();
      }}
      onClose={onClose}
      initialFocusRef={inputRef}
      placement="bottom-start"
      isLazy
    >
      <PopoverTrigger>
        <Button
          aria-label="Choose editor"
          size="sm"
          w="full"
          justifyContent="space-between"
          fontWeight="medium"
          bg="editorPanelBg"
          borderWidth="1px"
          borderColor="editorFieldBorderHover"
          leftIcon={<Icon as={selectedSection ? getNodeIcon(selectedSection) : FiFolder} />}
          rightIcon={<Icon as={FiChevronsDown} color="editorMutedText" />}
        >
          <Text noOfLines={1} flex={1} textAlign="left">
            {selectedSection?.label ?? 'Editors'}
          </Text>
        </Button>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          aria-label="Editor picker"
          w="460px"
          maxW="calc(100vw - 24px)"
          bg="editorPanelBg"
          borderColor="editorFieldBorderHover"
          boxShadow="2xl"
        >
          <PopoverBody p={3}>
            <InputGroup size="sm" mb={3}>
              <InputLeftElement pointerEvents="none">
                <Icon as={FiSearch} color="editorMutedText" boxSize={3.5} />
              </InputLeftElement>
              <Input
                ref={inputRef}
                aria-label="Find an editor"
                placeholder="Find an editor..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && results[0]) {
                    event.preventDefault();
                    select(results[0]);
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    event.currentTarget
                      .closest('[role="dialog"]')!
                      .querySelector<HTMLButtonElement>('[data-editor-option]')
                      ?.focus();
                  }
                }}
              />
            </InputGroup>
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} maxH="60vh" overflowY="auto">
              {sections.map(
                (section) =>
                  section.nodes.length > 0 && (
                    <VStack key={section.label} align="stretch" spacing={1}>
                      <SectionLabel px={2} py={1}>
                        {section.label}
                      </SectionLabel>
                      {section.nodes.map((node) => {
                        const accent = getNodeAccentFromNode(node);
                        const selected =
                          node.kind === 'group'
                            ? selectedSection?.id === node.id
                            : getActiveTabId(node) === activeTabId;
                        return (
                          <Button
                            key={node.id}
                            data-editor-option
                            aria-pressed={selected}
                            size="sm"
                            variant="ghost"
                            justifyContent="flex-start"
                            fontWeight="medium"
                            color={accent?.color ?? 'editorMutedText'}
                            bg={selected ? (accent?.tint ?? 'editorActiveBg') : 'transparent'}
                            leftIcon={<Icon as={getNodeIcon(node)} />}
                            onClick={() => select(node)}
                            onKeyDown={(event) => {
                              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                              event.preventDefault();
                              const buttons = Array.from(
                                event.currentTarget
                                  .closest('[role="dialog"]')!
                                  .querySelectorAll<HTMLButtonElement>('[data-editor-option]'),
                              );
                              const index = buttons.indexOf(event.currentTarget);
                              buttons[
                                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                                  buttons.length
                              ].focus();
                            }}
                          >
                            {node.label}
                          </Button>
                        );
                      })}
                    </VStack>
                  ),
              )}
            </SimpleGrid>
            {results.length === 0 && (
              <Text role="status" fontSize="sm" color="editorMutedText" p={2}>
                No matching editors.
              </Text>
            )}
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

function findActiveNodePath(nodes: WorkspaceTreeNode[], tabId: string | null): WorkspaceTreeNode[] {
  if (!tabId) return [];
  for (const node of nodes) {
    if (
      (node.document && getWorkspaceTabId(node.document) === tabId) ||
      node.id === `group:${tabId}`
    )
      return [node];
    const children = findActiveNodePath(node.children ?? [], tabId);
    if (children.length > 0) return [node, ...children];
  }
  return [];
}

function filterNodes(nodes: WorkspaceTreeNode[], query: string, path = ''): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => {
    const fullPath = path ? `${path}/${node.label}` : node.label;
    if (`${fullPath} ${node.id}`.toLocaleLowerCase().includes(query)) return [node];
    const children = filterNodes(node.children ?? [], query, fullPath);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

function collectBranchIds(nodes: WorkspaceTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children ? [node.id, ...collectBranchIds(node.children)] : [],
  );
}

function countDocuments(nodes: WorkspaceTreeNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.document ? 1 : 0) + countDocuments(node.children ?? []),
    0,
  );
}

const WorkspaceExplorerNode: React.FC<{
  node: WorkspaceTreeNode;
  expandedNodeIds: string[];
  activeTabId: string | null;
  depth: number;
  accent: NodeAccent | null;
  itemCount?: number;
  contextLabel?: string;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (resourceKey: string) => void;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  onContextMenu: (node: WorkspaceTreeNode, event: React.MouseEvent) => void;
  onCreateResource: (
    kind: NonNullable<WorkspaceTreeNode['resourceKind']>,
    folderPath: string,
  ) => void;
  onEditResource: (node: WorkspaceTreeNode) => void;
  onDeleteResource: (node: WorkspaceTreeNode) => void | Promise<void>;
}> = ({
  node,
  expandedNodeIds,
  activeTabId,
  depth,
  accent,
  itemCount,
  contextLabel,
  favorites,
  onToggleFavorite,
  onToggleNode,
  onOpenNode,
  onContextMenu,
  onCreateResource,
  onEditResource,
  onDeleteResource,
}) => {
  const saveUnits = useSaveStore((state) => state.saveUnits);
  const isExpanded = expandedNodeIds.includes(node.id);
  const IconComponent = getNodeIcon(node);
  const isActive = Boolean(node.document) && activeTabId === getActiveTabId(node);
  const isDirty = Boolean(node.document && saveUnits[getDocumentSaveUnitId(node.document)]?.dirty);
  const paddingLeft = 2 + depth * 4;
  const isUtilityLeaf =
    depth === 0 &&
    node.kind === 'leaf' &&
    (node.document?.kind === 'scripting' ||
      node.document?.kind === 'data' ||
      node.document?.kind === 'settings' ||
      node.document?.kind === 'configuration');
  const inheritedAccent = accent ?? getNodeAccentFromNode(node);
  const resourceKey = getEditorResourceDocumentTabId(node.document);
  const isFavorite = resourceKey !== null && favorites.has(resourceKey);

  const childProps = {
    expandedNodeIds,
    activeTabId,
    onToggleNode,
    onOpenNode,
    onContextMenu,
    onCreateResource,
    onEditResource,
    onDeleteResource,
    favorites,
    onToggleFavorite,
  };

  if (node.kind === 'group') {
    const canCreate = Boolean(node.resourceKind && canCreateResourceKind(node.resourceKind));
    return (
      <Box>
        <HStack
          px={Math.max(paddingLeft, 3)}
          h="8"
          pr={2}
          borderRadius="sm"
          cursor="pointer"
          color={inheritedAccent?.color ?? 'editorMutedText'}
          borderBottomWidth="1px"
          borderBottomColor="whiteAlpha.50"
          bgGradient={inheritedAccent?.headerGradient}
          _hover={{ bg: 'editorHoverBg', color: inheritedAccent?.color ?? 'editorText' }}
          onClick={() => onToggleNode(node.id)}
          onContextMenu={(event) => onContextMenu(node, event)}
          role="group"
          aria-label={`${node.label} section`}
        >
          <Icon
            as={isExpanded ? FiChevronDown : FiChevronRight}
            boxSize={3.5}
            color={inheritedAccent?.color ?? 'gray.500'}
          />
          <Text
            fontSize="xs"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="widest"
            flex={1}
            color={inheritedAccent?.color ?? 'blue.100'}
          >
            {node.label}
          </Text>
          {itemCount !== undefined && (
            <Text fontSize="xs" opacity={0.7}>
              {itemCount}
            </Text>
          )}
          {canCreate && (
            <IconButton
              aria-label={`Create ${node.label}`}
              icon={<AddIcon boxSize={2.5} />}
              size="xs"
              borderRadius="sm"
              bg="transparent"
              color={inheritedAccent?.color ?? 'gray.400'}
              opacity={0.7}
              _groupHover={{ opacity: 1 }}
              _hover={{ bg: 'whiteAlpha.100', color: inheritedAccent?.color ?? 'white' }}
              onClick={(event) => {
                event.stopPropagation();
                onCreateResource(node.resourceKind!, '');
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id} mt={1}>
              <WorkspaceExplorerNode
                node={child}
                depth={depth + 1}
                accent={inheritedAccent}
                {...childProps}
              />
            </Box>
          ))}
      </Box>
    );
  }

  if (node.kind === 'folder') {
    const canCreate = Boolean(node.resourceKind && canCreateResourceKind(node.resourceKind));
    const folderPath = node.id.replace(/^folder:[^:]+:/, '');
    return (
      <Box position="relative" pl={2}>
        <Box
          position="absolute"
          left="15px"
          top="6px"
          bottom="6px"
          w="1px"
          bg="whiteAlpha.50"
          pointerEvents="none"
        />
        <HStack
          px={paddingLeft}
          h="8"
          pr={2}
          borderRadius="sm"
          cursor="pointer"
          color="editorMutedText"
          _hover={{ bg: 'editorHoverBg', color: inheritedAccent?.color ?? 'editorText' }}
          onClick={() => onToggleNode(node.id)}
          onContextMenu={(event) => onContextMenu(node, event)}
          role="group"
        >
          <Icon
            as={isExpanded ? FiChevronDown : FiChevronRight}
            boxSize={3}
            color={inheritedAccent?.color ?? 'gray.600'}
          />
          <Icon as={FiFolder} boxSize={3} color={inheritedAccent?.color ?? 'gray.400'} />
          <Text
            fontSize="xs"
            fontWeight="semibold"
            flex={1}
            color={inheritedAccent?.color ?? 'editorMutedText'}
          >
            {node.label}
          </Text>
          {canCreate && (
            <IconButton
              aria-label={`Create in ${node.label}`}
              icon={<AddIcon boxSize={2.5} />}
              size="xs"
              borderRadius="full"
              bg="transparent"
              color={inheritedAccent?.color ?? 'gray.400'}
              opacity={0.3}
              _groupHover={{ opacity: 1 }}
              _hover={{ bg: 'whiteAlpha.100', color: inheritedAccent?.color ?? 'white' }}
              onClick={(event) => {
                event.stopPropagation();
                onCreateResource(node.resourceKind!, folderPath);
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id}>
              <WorkspaceExplorerNode
                node={child}
                depth={depth + 1}
                accent={inheritedAccent}
                {...childProps}
              />
            </Box>
          ))}
      </Box>
    );
  }

  return (
    <HStack
      px={contextLabel ? 2 : isUtilityLeaf ? 3 : paddingLeft + 5}
      minH={contextLabel ? 6 : 8}
      py={0}
      title={contextLabel ? `${node.label} — ${contextLabel}` : undefined}
      mt={isUtilityLeaf ? 1 : 0}
      borderRadius="sm"
      cursor="pointer"
      bg={isActive ? (inheritedAccent?.tint ?? 'editorHoverBg') : 'transparent'}
      bgGradient={isActive && !isUtilityLeaf ? inheritedAccent?.rowGradient : undefined}
      color={isActive ? 'editorText' : 'editorMutedText'}
      borderWidth="1px"
      borderColor={isActive ? 'whiteAlpha.100' : 'transparent'}
      role="group"
      _hover={{
        bg: isActive ? (inheritedAccent?.hoverTint ?? 'editorHoverBg') : 'editorHoverBg',
        color: 'editorText',
        borderColor: isActive ? 'whiteAlpha.200' : 'whiteAlpha.50',
      }}
      onClick={() =>
        onOpenNode(node, { pin: !node.document || !supportsPreviewTab(node.document) })
      }
      onDoubleClick={() => {
        if (!node.document || !supportsPreviewTab(node.document)) return;
        onOpenNode(node, { pin: true });
      }}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      <WorkspaceNodeVisual
        node={node}
        icon={IconComponent}
        isActive={isActive}
        compact={isUtilityLeaf || Boolean(contextLabel)}
      />
      <VStack align="stretch" spacing={0} flex={1} minW={0}>
        <Text
          fontSize={contextLabel ? 'xs' : 'sm'}
          fontWeight={isActive ? 'semibold' : 'medium'}
          noOfLines={1}
        >
          {node.label}
        </Text>
      </VStack>
      {resourceKey && (
        <IconButton
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${node.label} ${isFavorite ? 'from' : 'to'} favorites`}
          aria-pressed={isFavorite}
          icon={<Icon as={FiStar} boxSize={3} fill={isFavorite ? 'currentColor' : 'none'} />}
          size="xs"
          variant="ghost"
          flexShrink={0}
          color={isFavorite ? 'yellow.300' : 'editorMutedText'}
          opacity={isFavorite ? 1 : 0}
          _groupHover={{ opacity: 1 }}
          _focusVisible={{ opacity: 1 }}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(resourceKey);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      )}
      {isDirty && (
        <Box
          role="img"
          aria-label={`Unsaved changes: ${node.label}`}
          boxSize="2"
          borderRadius="full"
          bg="orange.400"
          flexShrink={0}
        />
      )}
      {!contextLabel &&
        node.document &&
        (canEditMetadataForResourceDocument(node.document) ||
          canDeleteEditorResourceDocument(node.document)) && (
          <HStack spacing={1} opacity={0} _groupHover={{ opacity: 1 }} flexShrink={0}>
            {canEditMetadataForResourceDocument(node.document) && (
              <IconButton
                aria-label={`Edit ${node.label}`}
                icon={<Icon as={FiEdit2} boxSize={3} />}
                size="xs"
                variant="ghost"
                color="gray.400"
                _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                onClick={(event) => {
                  event.stopPropagation();
                  onEditResource(node);
                }}
              />
            )}
            {canDeleteEditorResourceDocument(node.document) && (
              <IconButton
                aria-label={`Delete ${node.label}`}
                icon={<Icon as={FiTrash2} boxSize={3} />}
                size="xs"
                variant="ghost"
                color="gray.500"
                _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteResource(node);
                }}
              />
            )}
          </HStack>
        )}
    </HStack>
  );
};

function getActiveTabId(node: WorkspaceTreeNode): string | null {
  if (!node.document) return null;
  return getEditorResourceDocumentTabId(node.document) ?? getFallbackTabId(node.document);
}

function getFallbackTabId(document: WorkspaceDocument): string | null {
  switch (document.kind) {
    case 'settings':
      return 'settings';
    case 'configuration':
      return 'config';
    case 'entities':
    case 'characters':
    case 'items':
    case 'dialogues':
    case 'cutscenes':
    case 'scripting':
    case 'data':
      return document.kind;
    default:
      return null;
  }
}

export default WorkspaceExplorer;
