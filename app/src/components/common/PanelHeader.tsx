import React from 'react';
import { Box, VStack, Heading, HStack } from '@chakra-ui/react';
import { CaptionText, SectionLabel } from './Typography.tsx';

export interface PanelHeaderProps {
  label?: string; // small uppercase label above the title
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  left?: React.ReactNode; // optional left prop
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ label, title, subtitle, actions }) => {
  return (
    <Box
      bg="editorHeaderBg"
      borderBottom="1px"
      borderColor="editorShellBorder"
      px={4}
      py={3}
      flexShrink={0}
    >
      <HStack justify="space-between" align="start" spacing={3}>
        <VStack align="start" spacing={0} flex={1} minW={0}>
          {label && <SectionLabel textStyle="panelLabel">{label}</SectionLabel>}
          {title && (
            <Heading size="xs" color="white">
              {title}
            </Heading>
          )}
          {subtitle && (
            <CaptionText color="gray.500" mt={0.5}>
              {subtitle}
            </CaptionText>
          )}
        </VStack>

        {actions && <HStack spacing={1}>{actions}</HStack>}
      </HStack>
    </Box>
  );
};

export default PanelHeader;
