import React from 'react';
import { Box, HStack, Icon, Text, VStack } from '@chakra-ui/react';
import {
  FiBox,
  FiCode,
  FiChevronDown,
  FiChevronRight,
  FiDatabase,
  FiGrid,
  FiMap,
  FiMapPin,
  FiMessageSquare,
  FiPackage,
  FiSettings,
  FiSliders,
  FiUsers,
} from 'react-icons/fi';
import { WorkspaceTreeNode } from '../../types/workspace';
import { useSaveStore } from '../../lib/saveManager';
import { SectionLabel } from '../common/Typography.tsx';
import { supportsPreviewTab } from '../../store/useWorkspaceStore';

interface WorkspaceExplorerProps {
  nodes: WorkspaceTreeNode[];
  expandedNodeIds: string[];
  activeTabId: string | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
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
    case 'game-data':
      return FiDatabase;
    case 'entities':
      return FiBox;
    case 'actors':
      return FiUsers;
    case 'items':
      return FiPackage;
    case 'dialogues':
      return FiMessageSquare;
    case 'scripting':
      return FiCode;
    case 'settings':
      return FiSettings;
    case 'configuration':
      return FiSliders;
    default:
      return FiMap;
  }
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  nodes,
  expandedNodeIds,
  activeTabId,
  onToggleNode,
  onOpenNode,
}) => {
  return (
    <VStack align="stretch" spacing={0} h="full" bg="editorSidebarBg" overflow="hidden">
      <Box px={4} py={3} borderBottom="1px" borderColor="editorShellBorder">
        <SectionLabel textStyle="panelLabel">Project</SectionLabel>
      </Box>
      <Box flex={1} overflowY="auto" px={2} py={2}>
        <VStack align="stretch" spacing={1}>
          {nodes.map((node) => (
            <WorkspaceExplorerNode
              key={node.id}
              node={node}
              expandedNodeIds={expandedNodeIds}
              activeTabId={activeTabId}
              depth={0}
              onToggleNode={onToggleNode}
              onOpenNode={onOpenNode}
            />
          ))}
        </VStack>
      </Box>
    </VStack>
  );
};

const WorkspaceExplorerNode: React.FC<{
  node: WorkspaceTreeNode;
  expandedNodeIds: string[];
  activeTabId: string | null;
  depth: number;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
}> = ({ node, expandedNodeIds, activeTabId, depth, onToggleNode, onOpenNode }) => {
  const saveUnits = useSaveStore((state) => state.saveUnits);
  const isExpanded = expandedNodeIds.includes(node.id);
  const IconComponent = getNodeIcon(node);
  const isActive = Boolean(node.document) && activeTabId === getActiveId(node);
  const isDirty = Boolean(node.document && saveUnits[node.document.saveUnitId]?.dirty);

  const paddingLeft = 2 + depth * 4;

  if (node.kind === 'group') {
    return (
      <Box>
        <HStack
          px={paddingLeft}
          py={2}
          borderRadius="md"
          cursor="pointer"
          color="editorMutedText"
          _hover={{ bg: 'editorHoverBg', color: 'editorText' }}
          onClick={() => onToggleNode(node.id)}
        >
          <Icon as={isExpanded ? FiChevronDown : FiChevronRight} boxSize={3.5} />
          <Icon as={IconComponent} boxSize={3.5} />
          <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider">
            {node.label}
          </Text>
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <WorkspaceExplorerNode
              key={child.id}
              node={child}
              expandedNodeIds={expandedNodeIds}
              activeTabId={activeTabId}
              depth={depth + 1}
              onToggleNode={onToggleNode}
              onOpenNode={onOpenNode}
            />
          ))}
      </Box>
    );
  }

  if (node.kind === 'branch') {
    return (
      <Box>
        <HStack spacing={1}>
          <Box
            px={paddingLeft}
            py={2}
            borderRadius="md"
            cursor="pointer"
            color="editorMutedText"
            _hover={{ bg: 'editorHoverBg', color: 'editorText' }}
            onClick={() => onToggleNode(node.id)}
          >
            <Icon as={isExpanded ? FiChevronDown : FiChevronRight} boxSize={3.5} />
          </Box>
          <HStack
            px={3}
            py={2}
            borderRadius="md"
            cursor="pointer"
            bg={isActive ? 'editorPanelBg' : 'transparent'}
            color={isActive ? 'editorText' : 'editorMutedText'}
            borderWidth="1px"
            borderColor={isActive ? 'blue.500' : 'transparent'}
            _hover={{ bg: isActive ? 'editorPanelBg' : 'editorHoverBg', color: 'editorText' }}
            onClick={() =>
              node.document
                ? onOpenNode(node, { pin: !supportsPreviewTab(node.document) })
                : onToggleNode(node.id)
            }
            onDoubleClick={() => {
              if (!node.document || !supportsPreviewTab(node.document)) return;
              onOpenNode(node, { pin: true });
            }}
            flex={1}
            minW={0}
          >
            <Icon as={IconComponent} boxSize={3.5} color={isActive ? 'blue.300' : 'inherit'} />
            <Text
              fontSize="sm"
              fontWeight={isActive ? 'semibold' : 'medium'}
              noOfLines={1}
              flex={1}
            >
              {node.label}
            </Text>
            {isDirty && <Box boxSize="2" borderRadius="full" bg="orange.400" flexShrink={0} />}
          </HStack>
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <WorkspaceExplorerNode
              key={child.id}
              node={child}
              expandedNodeIds={expandedNodeIds}
              activeTabId={activeTabId}
              depth={depth + 1}
              onToggleNode={onToggleNode}
              onOpenNode={onOpenNode}
            />
          ))}
      </Box>
    );
  }

  return (
    <HStack
      px={paddingLeft + 6}
      py={2}
      borderRadius="md"
      cursor="pointer"
      bg={isActive ? 'editorPanelBg' : 'transparent'}
      color={isActive ? 'editorText' : 'editorMutedText'}
      borderWidth="1px"
      borderColor={isActive ? 'blue.500' : 'transparent'}
      _hover={{ bg: isActive ? 'editorPanelBg' : 'editorHoverBg', color: 'editorText' }}
      onClick={() =>
        onOpenNode(node, { pin: !node.document || !supportsPreviewTab(node.document) })
      }
      onDoubleClick={() => {
        if (!node.document || !supportsPreviewTab(node.document)) return;
        onOpenNode(node, { pin: true });
      }}
    >
      <Icon as={IconComponent} boxSize={3.5} color={isActive ? 'blue.300' : 'inherit'} />
      <Text fontSize="sm" fontWeight={isActive ? 'semibold' : 'medium'} noOfLines={1} flex={1}>
        {node.label}
      </Text>
      {isDirty && <Box boxSize="2" borderRadius="full" bg="orange.400" flexShrink={0} />}
    </HStack>
  );
};

function getActiveId(node: WorkspaceTreeNode): string | null {
  if (!node.document) return null;
  switch (node.document.kind) {
    case 'location':
      return `location:${node.document.mapId}`;
    case 'tileset':
      return `tileset:${node.document.tilesetId}`;
    case 'settings':
      return 'settings';
    case 'configuration':
      return 'config';
    case 'entities':
    case 'actors':
    case 'items':
    case 'dialogues':
    case 'scripting':
      return node.document.kind;
    default:
      return null;
  }
}

export default WorkspaceExplorer;
