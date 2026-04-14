import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';

interface DetailPanelProps extends BoxProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  children,
  maxWidth = '900px',
  ...rest
}) => (
  <Box h="full" overflowY="auto" p={6} {...rest}>
    <Box
      w="80%"
      maxW={maxWidth}
      mx="auto"
      bg="editor.panelBg"
      border="1px"
      borderColor="whiteAlpha.100"
      borderRadius="lg"
      overflow="hidden"
    >
      {children}
    </Box>
  </Box>
);
