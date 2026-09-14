import React from 'react';
import { IconButton, Tooltip, type IconButtonProps, type TooltipProps } from '@chakra-ui/react';

export interface GhostIconButtonProps extends IconButtonProps {
  tooltip?: React.ReactNode;
  tooltipPlacement?: TooltipProps['placement'];
}

export const GhostIconButton = React.forwardRef<HTMLButtonElement, GhostIconButtonProps>(
  (
    {
      tooltip,
      tooltipPlacement = 'bottom',
      size = 'xs',
      variant = 'ghost',
      color = 'gray.600',
      _hover,
      ...props
    },
    ref,
  ) => {
    const button = (
      <IconButton
        ref={ref}
        size={size}
        variant={variant}
        color={color}
        _hover={{ color: 'white', bg: 'editorHoverBg', ..._hover }}
        {...props}
      />
    );

    if (!tooltip) {
      return button;
    }

    return (
      <Tooltip label={tooltip} placement={tooltipPlacement} hasArrow fontSize="xs">
        {button}
      </Tooltip>
    );
  },
);
