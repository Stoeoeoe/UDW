import React from 'react';
import { HStack, Tooltip, Box, type HStackProps, type IconButtonProps } from '@chakra-ui/react';
import { IconType } from 'react-icons';
import { GhostIconButton } from './IconButtons.tsx';

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
  shellProps?: HStackProps;
}

export const ToolbarShell: React.FC<HStackProps> = ({ children, spacing = '1', ...props }) => (
  <HStack
    bg="editorChromeBg"
    p="1"
    rounded="xl"
    border="1px"
    borderColor="editorBorderSubtle"
    spacing={spacing}
    boxShadow="lg"
    {...props}
  >
    {children}
  </HStack>
);

export interface ToolbarToggleButtonProps extends Omit<IconButtonProps, 'aria-label' | 'icon'> {
  label: string;
  icon: React.ReactElement;
  isActive?: boolean;
  colorScheme?: string;
}

export const ToolbarToggleButton: React.FC<ToolbarToggleButtonProps> = ({
  label,
  icon,
  isActive = false,
  colorScheme = 'blue',
  size = 'xs',
  variant,
  color,
  bg,
  _hover,
  ...props
}) => (
  <Tooltip label={label} placement="bottom" hasArrow fontSize="xs">
    <GhostIconButton
      aria-label={label}
      icon={icon}
      size={size}
      variant={variant ?? (isActive ? 'solid' : 'ghost')}
      colorScheme={colorScheme}
      bg={bg ?? (isActive ? `${colorScheme}.600` : 'transparent')}
      color={color ?? (isActive ? 'white' : 'gray.400')}
      _hover={{ bg: isActive ? `${colorScheme}.500` : 'editorHoverBg', color: 'white', ..._hover }}
      minW={size === 'sm' ? '32px' : undefined}
      h={size === 'sm' ? '32px' : undefined}
      rounded="md"
      {...props}
    />
  </Tooltip>
);

/**
 * Generic Toolbar component that renders grouped tool buttons.
 * Uses react-icons for icons and Chakra UI for styling.
 */
export const Toolbar: React.FC<ToolbarProps> = ({
  items,
  activeId,
  onActivate,
  size = 'sm',
  shellProps,
}) => {
  // Group items by their group property
  const groups = items.reduce<Record<string, ToolItem[]>>((acc, item) => {
    const groupKey = item.group || 'default';
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  const groupKeys = Object.keys(groups);

  return (
    <ToolbarShell {...shellProps}>
      {groupKeys.map((groupKey, groupIndex) => (
        <React.Fragment key={groupKey}>
          {groups[groupKey].map((tool) => {
            const Icon = tool.icon;
            const isActive = activeId === tool.id;
            return (
              <ToolbarToggleButton
                key={tool.id}
                label={tool.label}
                icon={<Icon />}
                size={size}
                isActive={isActive}
                onClick={() => onActivate?.(tool.id)}
              />
            );
          })}
          {groupIndex < groupKeys.length - 1 && <Box w="1px" h="4" bg="gray.700" mx={1} />}
        </React.Fragment>
      ))}
    </ToolbarShell>
  );
};

export default Toolbar;
