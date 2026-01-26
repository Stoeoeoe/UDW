import React from 'react';
import { Box, VStack, HStack, Text, IconButton, Flex } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

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

export interface ListPanelProps {
    title: string;
    items: ListPanelItem[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onAdd?: () => void;
    onRemove?: (id: string) => void;
    emptyMessage?: string;
    renderItem?: (item: ListPanelItem, isSelected: boolean) => React.ReactNode;
    actions?: React.ReactNode;
    autoSelectFirst?: boolean;
}

export const ListPanel: React.FC<ListPanelProps> = ({
    title,
    items,
    selectedId,
    onSelect,
    onAdd,
    emptyMessage = 'No items',
    renderItem,
    actions,
    autoSelectFirst = false,
}) => {
    React.useEffect(() => {
        if (!onSelect || !autoSelectFirst) return;
        if (!items || items.length === 0) return;
        const hasSelected = selectedId != null && items.some(i => i.id === selectedId);
        if (!hasSelected) {
            onSelect(items[0].id);
        }
    }, [items, selectedId, onSelect, autoSelectFirst]);

    return (
        <Flex direction="column" h="full" overflow="hidden">
            {/* Header */}
            <HStack
                px={3}
                py={2}
                bg="#05060a"
                borderBottom="1px"
                borderColor="#071018"
                justify="space-between"
                flexShrink={0}
            >
                <Text fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">
                    {title}
                </Text>
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
            </HStack>

            {/* Items */}
            <Box flex={1} overflowY="auto" p={1}>
                {items.length === 0 ? (
                    <Text fontSize="xs" color="gray.600" textAlign="center" mt={4} fontStyle="italic">
                        {emptyMessage}
                    </Text>
                ) : (
                    <VStack spacing={1} align="stretch">
                        {items.map(item => {
                            const isSelected = item.id === selectedId;
                            
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
                                >
                                    <HStack spacing={2}>
                                        {item.icon}
                                        <VStack align="start" spacing={0} flex={1}>
                                            <Text
                                                fontSize="xs"
                                                fontWeight={isSelected ? 'bold' : 'normal'}
                                                color="gray.200"
                                            >
                                                {item.label}
                                            </Text>
                                            {item.sublabel && (
                                                <Text fontSize="10px" color="gray.500">
                                                    {item.sublabel}
                                                </Text>
                                            )}
                                        </VStack>
                                        {item.badge}
                                    </HStack>
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
