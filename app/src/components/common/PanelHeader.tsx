import React from 'react';
import { Box, VStack, Heading, Text, HStack } from '@chakra-ui/react';

export interface PanelHeaderProps {
  label?: string; // small uppercase label above the title
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  left?: React.ReactNode; // optional left prop
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ label, title, subtitle, actions }) => {
  return (
    <HStack justify="space-between" px={0} py={0} flexShrink={0}>
      <Box flex={1}>
        <Box bg="editor.headerBg" borderBottom="1px" borderColor="editor.border" px={4} py={3}>
          <VStack align="start" spacing={0}>
            {label && (
              <Text
                fontSize="9px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.500"
              >
                {label}
              </Text>
            )}
            {title && (
              <Heading size="xs" color="white">
                {title}
              </Heading>
            )}
            {subtitle && (
              <Text fontSize="10px" color="gray.500" mt={0.5}>
                {subtitle}
              </Text>
            )}
          </VStack>
        </Box>
      </Box>

      {actions && <Box ml={2}>{actions}</Box>}
    </HStack>
  );
};

export default PanelHeader;
