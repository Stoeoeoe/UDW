import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

export interface AppShellProps {
  topBar: React.ReactNode;
  workspace: React.ReactNode;
  status?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ topBar, workspace, status }) => (
  <Flex
    direction="column"
    h="100vh"
    w="100vw"
    overflow="hidden"
    bg="editorAppBg"
    color="editorText"
    userSelect="none"
  >
    <Box
      h="12"
      borderBottom="1px"
      borderColor="editorShellBorder"
      bg="editorPanelBg"
      zIndex="20"
      flexShrink={0}
    >
      {topBar}
    </Box>

    <Box flex={1} overflow="hidden">
      {workspace}
    </Box>

    <Flex
      h="6"
      bg="editorChromeBg"
      borderTop="1px"
      borderColor="editorShellBorder"
      alignItems="center"
      px="2"
      fontSize="xs"
      color="editorMutedText"
      zIndex="20"
      flexShrink={0}
    >
      {status ?? <Text>Ready</Text>}
    </Flex>
  </Flex>
);

export default AppShell;
