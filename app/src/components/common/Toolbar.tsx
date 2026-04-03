import React from 'react';
import { HStack, IconButton, Tooltip, Box } from '@chakra-ui/react';
import { IconType } from 'react-icons';

export interface ToolItem {
  id: string;
  icon: IconType;
  label: string;
  group?: string;
}

export interface ToolbarProps {
  items: ToolItem[];
  activeId?: string | null;
  onActivate?: (id: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Generic Toolbar component that renders grouped tool buttons.
 * Uses react-icons for icons and Chakra UI for styling.
 */
export const Toolbar: React.FC<ToolbarProps> = ({ items, activeId, onActivate, size = 'sm' }) => {
  // Group items by their group property
  const groups = items.reduce<Record<string, ToolItem[]>>((acc, item) => {
    const groupKey = item.group || 'default';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  const groupKeys = Object.keys(groups);

  return (
    <HStack
      bg="gray.900"
      p="1"
      rounded="xl"
      border="1px"
      borderColor="gray.800"
      spacing="1"
      boxShadow="lg"
    >
      {groupKeys.map((groupKey, groupIndex) => (
        <React.Fragment key={groupKey}>
          {groups[groupKey].map((tool) => {
            const Icon = tool.icon;
            const isActive = activeId === tool.id;
            return (
              <Tooltip key={tool.id} label={tool.label} placement="bottom" hasArrow>
                <IconButton
                  aria-label={tool.label}
                  icon={<Icon />}
                  size={size}
                  variant={isActive ? 'solid' : 'ghost'}
                  colorScheme={isActive ? 'blue' : 'gray'}
                  bg={isActive ? 'blue.600' : 'transparent'}
                  color={isActive ? 'white' : 'gray.400'}
                  _hover={{ bg: isActive ? 'blue.500' : 'gray.800', color: 'white' }}
                  onClick={() => onActivate?.(tool.id)}
                  minW={size === 'sm' ? '32px' : undefined}
                  h={size === 'sm' ? '32px' : undefined}
                  rounded="md"
                />
              </Tooltip>
            );
          })}
          {groupIndex < groupKeys.length - 1 && <Box w="1px" h="4" bg="gray.700" mx={1} />}
        </React.Fragment>
      ))}
    </HStack>
  );
};

export default Toolbar;
