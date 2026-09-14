import React from 'react';
import * as GiIcons from 'react-icons/gi';
import { Box, BoxProps } from '@chakra-ui/react';

interface GameIconProps extends BoxProps {
  iconName?: string;
  size?: number;
  fallback?: React.ReactNode;
}

export const GameIcon: React.FC<GameIconProps> = ({
  iconName,
  size = 24,
  fallback = '👤',
  ...boxProps
}) => {
  const Icon = iconName ? (GiIcons as any)[iconName] : null;

  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize={`${size}px`}
      {...boxProps}
    >
      {Icon ? <Icon size={size} /> : fallback}
    </Box>
  );
};
