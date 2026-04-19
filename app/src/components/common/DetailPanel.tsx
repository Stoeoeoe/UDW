import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';

interface DetailPanelProps extends BoxProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  children,
  maxWidth = '1120px',
  ...rest
}) => (
  <Box
    h="full"
    overflowY="auto"
    px={{ base: 5, md: 8 }}
    py={{ base: 5, md: 7 }}
    bg="editorWorkspaceBg"
    {...rest}
  >
    <Box w="full" maxW="1280px" mr="auto">
      <Box
        w="full"
        maxW={maxWidth}
        mr="auto"
        ml={0}
        bg="editorPanelBg"
        border="1px"
        borderColor="editorBorderSubtle"
        borderRadius="xl"
        px={{ base: 5, md: 7 }}
        py={{ base: 5, md: 6 }}
        boxShadow="0 18px 40px rgba(0, 0, 0, 0.18)"
        overflow="hidden"
      >
        {children}
      </Box>
    </Box>
  </Box>
);
