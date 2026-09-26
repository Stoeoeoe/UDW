import React from 'react';
import { Box, HStack, Icon, IconButton, Text, Tooltip } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  FiBox,
  FiCode,
  FiGrid,
  FiMap,
  FiMessageSquare,
  FiPackage,
  FiSettings,
  FiSliders,
  FiUsers,
} from 'react-icons/fi';
import { WorkspaceTab } from '../../types/workspace';
import { useSaveStore } from '../../lib/saveManager';
import { getDocumentSaveUnitId } from '../../store/useWorkspaceStore';

interface WorkspaceTabsProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onPin: (tabId: string) => void;
  onReorder: (draggedTabId: string, targetTabId: string) => void;
  onClose: (tabId: string) => void;
}

function getDocumentIcon(tab: WorkspaceTab) {
  switch (tab.document.kind) {
    case 'location':
      return FiMap;
    case 'tileset':
      return FiGrid;
    case 'settings':
      return FiSettings;
    case 'configuration':
      return FiSliders;
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
    default:
      return FiMap;
  }
}

function createDragPreviewElement(label: string): HTMLDivElement {
  const preview = document.createElement('div');
  preview.textContent = label;
  preview.style.position = 'fixed';
  preview.style.top = '-1000px';
  preview.style.left = '-1000px';
  preview.style.maxWidth = '240px';
  preview.style.padding = '8px 12px';
  preview.style.borderRadius = '10px';
  preview.style.border = '1px solid rgba(99, 179, 237, 0.75)';
  preview.style.background = 'rgba(26, 32, 44, 0.96)';
  preview.style.color = 'rgb(247, 250, 252)';
  preview.style.fontSize = '13px';
  preview.style.fontWeight = '600';
  preview.style.fontFamily = 'system-ui, sans-serif';
  preview.style.whiteSpace = 'nowrap';
  preview.style.overflow = 'hidden';
  preview.style.textOverflow = 'ellipsis';
  preview.style.boxShadow = '0 14px 30px rgba(15, 23, 42, 0.35)';
  preview.style.pointerEvents = 'none';
  return preview;
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({
  tabs,
  activeTabId,
  onActivate,
  onPin,
  onReorder,
  onClose,
}) => {
  const saveUnits = useSaveStore((state) => state.saveUnits);
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null);
  const dragPreviewRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(
    () => () => {
      dragPreviewRef.current?.remove();
      dragPreviewRef.current = null;
    },
    [],
  );

  return (
    <HStack
      spacing={1}
      px={2}
      py={1}
      bg="editorHeaderBg"
      borderBottom="1px"
      borderColor="editorShellBorder"
      overflowX="auto"
      overflowY="hidden"
      align="stretch"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const saveUnit = saveUnits[getDocumentSaveUnitId(tab.document)];
        const isDirty = Boolean(saveUnit?.dirty);
        const IconComponent = getDocumentIcon(tab);

        return (
          <Tooltip key={tab.id} label={tab.document.label} hasArrow openDelay={300}>
            <HStack
              spacing={2}
              px={2.5}
              h="8"
              minW="0"
              maxW="280px"
              borderRadius="md"
              borderWidth="1px"
              borderColor={isActive ? 'blue.500' : 'editorShellBorder'}
              bg={isActive ? 'editorPanelBg' : 'editorSidebarBg'}
              color={isActive ? 'editorText' : 'editorMutedText'}
              opacity={draggedTabId === tab.id ? 0.72 : 1}
              _hover={{
                bg: isActive ? 'editorPanelBg' : 'editorHoverBg',
                color: 'editorText',
              }}
              transition="background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s"
              onClick={() => onActivate(tab.id)}
              onDoubleClick={() => {
                if (tab.isPreview) onPin(tab.id);
              }}
              onMouseDown={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                event.stopPropagation();
                onClose(tab.id);
              }}
              onDragStart={(event) => {
                setDraggedTabId(tab.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
                const preview = createDragPreviewElement(tab.document.label);
                document.body.appendChild(preview);
                dragPreviewRef.current?.remove();
                dragPreviewRef.current = preview;
                event.dataTransfer.setDragImage(preview, 18, 18);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceTabId = event.dataTransfer.getData('text/plain') || draggedTabId;
                if (sourceTabId) {
                  onReorder(sourceTabId, tab.id);
                }
                setDraggedTabId(null);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                dragPreviewRef.current?.remove();
                dragPreviewRef.current = null;
              }}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              cursor="pointer"
              flexShrink={0}
              draggable
              title={tab.document.label}
            >
              <Icon as={IconComponent} boxSize={3.5} />
              <Text
                fontSize="sm"
                fontWeight={isActive ? 'semibold' : 'medium'}
                fontStyle={tab.isPreview ? 'italic' : 'normal'}
                noOfLines={1}
                flex={1}
              >
                {tab.document.label}
              </Text>
              {isDirty && (
                <Box
                  boxSize="2"
                  borderRadius="full"
                  bg={isActive ? 'orange.300' : 'orange.400'}
                  flexShrink={0}
                />
              )}
              <Tooltip label="Close tab" hasArrow>
                <IconButton
                  aria-label={`Close ${tab.document.label}`}
                  icon={<CloseIcon boxSize={2.5} />}
                  size="xs"
                  variant="ghost"
                  color="inherit"
                  _hover={{ bg: 'editorHoverBg' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                />
              </Tooltip>
            </HStack>
          </Tooltip>
        );
      })}
    </HStack>
  );
};

export default WorkspaceTabs;
