import React from 'react';
import { Box, HStack, Spacer, type BoxProps } from '@chakra-ui/react';
import { SectionLabel } from './Typography.tsx';

export const EditorCard: React.FC<BoxProps> = ({
  children,
  bg = 'editorChromeBg',
  border = '1px',
  borderColor = 'editorBorderSubtle',
  rounded = '2xl',
  boxShadow = '2xl',
  ...props
}) => (
  <Box
    bg={bg}
    border={border}
    borderColor={borderColor}
    rounded={rounded}
    boxShadow={boxShadow}
    {...props}
  >
    {children}
  </Box>
);

export interface SurfaceSectionHeaderProps extends Omit<BoxProps, 'title'> {
  title: React.ReactNode;
  actions?: React.ReactNode;
}

export const SurfaceSectionHeader: React.FC<SurfaceSectionHeaderProps> = ({
  title,
  actions,
  bg = 'editorChromeBg',
  borderBottom = '1px',
  borderColor = 'editorBorderSubtle',
  px = 4,
  py = 2,
  children,
  ...props
}) => (
  <Box bg={bg} borderBottom={borderBottom} borderColor={borderColor} px={px} py={py} {...props}>
    <HStack spacing={2}>
      <SectionLabel>{title}</SectionLabel>
      <Spacer />
      {actions}
    </HStack>
    {children}
  </Box>
);
