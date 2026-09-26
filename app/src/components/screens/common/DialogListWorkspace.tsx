import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Badge,
  Flex,
  Tooltip,
  Input,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';

export interface DialogListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
}

interface DialogListWorkspaceProps {
  title: string;
  description?: string;
  items: DialogListItem[];
  onAdd?: () => void;
  addLabel?: string;
  onOpenItem?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  emptyIcon?: string | React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  maxWidth?: string;
  enableSearch?: boolean;
  searchPlaceholder?: string;
}

export const DialogListWorkspace: React.FC<DialogListWorkspaceProps> = ({
  title,
  description,
  items,
  onAdd,
  addLabel = 'Add',
  onOpenItem,
  onDeleteItem,
  emptyIcon = '•',
  emptyTitle = 'No items yet',
  emptyDescription = 'Create your first item to get started.',
  maxWidth = '980px',
  enableSearch = false,
  searchPlaceholder,
}) => {
  const [search, setSearch] = React.useState('');
  const normalizedQuery = search.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? items.filter((item) =>
        [item.title, item.subtitle, item.id]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery)),
      )
    : items;

  return (
    <Box h="full" overflowY="auto" px={6} py={5}>
      <VStack align="stretch" spacing={4} maxW={maxWidth} mx="auto">
        <Flex align="center" justify="space-between" gap={3}>
          <VStack align="start" spacing={0}>
            <HStack spacing={2}>
              <Text fontSize="sm" fontWeight="black" color="white" textTransform="uppercase">
                {title}
              </Text>
              <Badge fontSize="10px" colorScheme="gray" variant="subtle">
                {items.length}
              </Badge>
            </HStack>
            {description && (
              <Text fontSize="xs" color="gray.500">
                {description}
              </Text>
            )}
          </VStack>

          {onAdd && (
            <Button
              size="sm"
              colorScheme="blue"
              leftIcon={<AddIcon fontSize="10px" />}
              onClick={onAdd}
            >
              {addLabel}
            </Button>
          )}
        </Flex>

        {enableSearch ? (
          <Input
            size="sm"
            variant="compact"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}...`}
          />
        ) : null}

        {visibleItems.length === 0 ? (
          <VStack
            spacing={2}
            align="center"
            justify="center"
            minH="320px"
            borderWidth="1px"
            borderColor="whiteAlpha.100"
            borderRadius="lg"
            bg="editorSectionBg"
          >
            <Text fontSize="4xl">{emptyIcon}</Text>
            <Text color="gray.300" fontWeight="semibold">
              {items.length === 0 ? emptyTitle : `No ${title.toLowerCase()} match "${search}"`}
            </Text>
            <Text color="gray.600" fontSize="sm" textAlign="center" maxW="460px">
              {items.length === 0 ? emptyDescription : 'Try a different name or id.'}
            </Text>
          </VStack>
        ) : (
          <VStack spacing={2} align="stretch">
            {visibleItems.map((item) => (
              <Box
                key={item.id}
                px={4}
                py={3}
                borderWidth="1px"
                borderColor="editorInlineBorder"
                borderRadius="md"
                bg="editorInlineBg"
                cursor={onOpenItem ? 'pointer' : 'default'}
                _hover={
                  onOpenItem
                    ? { borderColor: 'editorFieldBorderHover', bg: 'editorInlineHoverBg' }
                    : undefined
                }
                onClick={() => onOpenItem?.(item.id)}
                role={onOpenItem ? 'button' : undefined}
              >
                <HStack align="start" spacing={3}>
                  {item.icon}
                  <VStack align="start" spacing={0} flex={1} minW={0}>
                    <HStack spacing={2} w="full" justify="space-between">
                      <Text fontSize="sm" color="gray.100" fontWeight="semibold" noOfLines={1}>
                        {item.title}
                      </Text>
                      {item.badge}
                    </HStack>
                    {item.subtitle && (
                      <Text fontSize="xs" color="gray.500" noOfLines={1}>
                        {item.subtitle}
                      </Text>
                    )}
                    {item.meta && <Box mt={1}>{item.meta}</Box>}
                  </VStack>

                  {onDeleteItem && (
                    <Tooltip label="Delete" hasArrow>
                      <IconButton
                        aria-label="Delete"
                        icon={<DeleteIcon fontSize="9px" />}
                        size="xs"
                        variant="ghost"
                        color="gray.600"
                        _hover={{ color: 'red.300', bg: 'red.900' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteItem(item.id);
                        }}
                      />
                    </Tooltip>
                  )}
                </HStack>
              </Box>
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
};

export default DialogListWorkspace;
