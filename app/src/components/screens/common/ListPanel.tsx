import React from 'react';
import { Box, VStack, HStack, Text, IconButton, Flex, Tooltip } from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';
import { AddIcon, DeleteIcon, EditIcon } from '@chakra-ui/icons';

/**
 * ListPanel - A reusable panel for displaying lists of items with optional actions.
 * Used for layers, variations, maps, tilesets, entities, etc.
 */

export interface ListPanelItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface ListPanelAction {
  id: string;
  label: string;
  icon: React.ReactElement;
  onClick: (item: ListPanelItem) => void;
  ariaLabel?: string;
  color?: string;
  hoverColor?: string;
  hoverBg?: string;
}

export interface ListPanelProps {
  title: string;
  items: ListPanelItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  emptyMessage?: string;
  renderItem?: (item: ListPanelItem, isSelected: boolean) => React.ReactNode;
  itemActions?: (item: ListPanelItem) => ListPanelAction[];
  topContent?: React.ReactNode;
  actions?: React.ReactNode;
  autoSelectFirst?: boolean;
  onEditItem?: (item: ListPanelItem) => void;
  onDeleteItem?: (item: ListPanelItem) => void;
  editActionLabel?: string;
  deleteActionLabel?: string;
}

export const ListPanel: React.FC<ListPanelProps> = ({
  title,
  items,
  selectedId,
  onSelect,
  onAdd,
  emptyMessage = 'No items',
  renderItem,
  itemActions,
  topContent,
  actions,
  autoSelectFirst = false,
  onEditItem,
  onDeleteItem,
  editActionLabel = 'Edit',
  deleteActionLabel = 'Delete',
}) => {
  React.useEffect(() => {
    if (!onSelect || !autoSelectFirst) return;
    if (!items || items.length === 0) return;
    const hasSelected = selectedId != null && items.some((i) => i.id === selectedId);
    if (!hasSelected) {
      onSelect(items[0].id);
    }
  }, [items, selectedId, onSelect, autoSelectFirst]);

  return (
    <Flex direction="column" h="full" overflow="hidden">
      {/* Header */}
      <PanelHeader
        title={title}
        actions={
          <HStack spacing={1}>
            {actions}
            {onAdd && (
              <IconButton
                aria-label={`Add ${title}`}
                icon={<AddIcon fontSize="10px" />}
                size="xs"
                variant="ghost"
                color="gray.400"
                _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                onClick={onAdd}
              />
            )}
          </HStack>
        }
      />

      {/* Items */}
      {topContent && (
        <Box px={2} py={2} borderBottom="1px" borderColor="editor.border">
          {topContent}
        </Box>
      )}

      <Box flex={1} overflowY="auto" p={1}>
        {items.length === 0 ? (
          <Text fontSize="xs" color="gray.600" textAlign="center" mt={4} fontStyle="italic">
            {emptyMessage}
          </Text>
        ) : (
          <VStack spacing={1} align="stretch">
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              const resolvedActions: ListPanelAction[] = [
                ...(onEditItem
                  ? [
                      {
                        id: 'default-edit',
                        label: editActionLabel,
                        icon: <EditIcon fontSize="10px" />,
                        ariaLabel: editActionLabel,
                        onClick: onEditItem,
                      } satisfies ListPanelAction,
                    ]
                  : []),
                ...(itemActions ? itemActions(item) : []),
                ...(onDeleteItem
                  ? [
                      {
                        id: 'default-delete',
                        label: deleteActionLabel,
                        icon: <DeleteIcon fontSize="10px" />,
                        ariaLabel: deleteActionLabel,
                        hoverColor: 'red.300',
                        onClick: onDeleteItem,
                      } satisfies ListPanelAction,
                    ]
                  : []),
              ];

              if (renderItem) {
                return (
                  <Box key={item.id} onClick={() => onSelect?.(item.id)} cursor="pointer">
                    {renderItem(item, isSelected)}
                  </Box>
                );
              }

              return (
                <Box
                  key={item.id}
                  px={3}
                  py={2}
                  rounded="md"
                  cursor={item.disabled ? 'not-allowed' : 'pointer'}
                  opacity={item.disabled ? 0.5 : 1}
                  bg={isSelected ? 'blue.900' : 'transparent'}
                  border="1px"
                  borderColor={isSelected ? 'blue.500' : 'transparent'}
                  _hover={{ bg: isSelected ? 'blue.900' : 'whiteAlpha.50' }}
                  onClick={() => !item.disabled && onSelect?.(item.id)}
                  transition="all 0.1s"
                  role="group"
                >
                  <Flex align="center" justify="space-between" gap={2}>
                    <HStack spacing={2} flex={1} minW={0}>
                      {item.icon}
                      <VStack align="start" spacing={0} flex={1} minW={0}>
                        <Text
                          fontSize="xs"
                          fontWeight={isSelected ? 'bold' : 'normal'}
                          color="gray.200"
                          noOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {item.sublabel && (
                          <Text fontSize="10px" color="gray.500" noOfLines={1}>
                            {item.sublabel}
                          </Text>
                        )}
                      </VStack>
                      {item.badge}
                    </HStack>

                    {resolvedActions.length > 0 && (
                      <HStack spacing={1} opacity={0} _groupHover={{ opacity: 1 }}>
                        {resolvedActions.map((action) => (
                          <Tooltip key={action.id} label={action.label} placement="right" hasArrow>
                            <IconButton
                              aria-label={action.ariaLabel || action.label}
                              icon={action.icon}
                              size="xs"
                              variant="ghost"
                              color={action.color || 'gray.400'}
                              _hover={{
                                color: action.hoverColor || 'white',
                                bg: action.hoverBg || 'whiteAlpha.100',
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                action.onClick(item);
                              }}
                            />
                          </Tooltip>
                        ))}
                      </HStack>
                    )}
                  </Flex>
                </Box>
              );
            })}
          </VStack>
        )}
      </Box>
    </Flex>
  );
};

export default ListPanel;
