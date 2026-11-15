import React from 'react';
import { Box } from '@chakra-ui/react';

/** The shared form layout owns width, spacing and surface; forms supply fields only. */
export const DetailPanel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box h="full" overflowY="auto" p={6} bg="editorWorkspaceBg">
    <Box w="full" maxW="1120px" mx="auto">
      {children}
    </Box>
  </Box>
);
