import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import PanelHeader from './PanelHeader';

interface PanelShellProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({ title, subtitle, children }) => {
  return (
    <VStack h="full" w="full" align="stretch" spacing={0} bg="editorPanelBg">
      <PanelHeader title={title} subtitle={subtitle} />

      <Box p={4} overflowY="auto" flex={1} bg="editorPanelBg">
        {children}
      </Box>
    </VStack>
  );
};

export default PanelShell;
