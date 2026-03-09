import React, { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

export interface AppShellProps {
  topBar: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode | null;
}

export const AppShell: React.FC<AppShellProps> = ({
  topBar,
  children,
  statusBar,
}) => {
  const showStatusBar = statusBar !== null;
  return (
    <Flex
      direction="column"
      h="100vh"
      w="100vw"
      overflow="hidden"
      bg="gray.900"
      color="gray.200"
      userSelect="none"
    >
      <Box
        h="12"
        borderBottom="1px"
        borderColor="gray.800"
        bg="gray.950"
        zIndex="20"
        flexShrink={0}
      >
        {topBar}
      </Box>
      <Flex flex={1} overflow="hidden" minH={0}>
        {children}
      </Flex>
      {showStatusBar && (
        <Flex
          h="6"
          bg="gray.900"
          borderTop="1px"
          borderColor="gray.800"
          alignItems="center"
          px="2"
          fontSize="xs"
          color="gray.500"
          zIndex="20"
          flexShrink={0}
        >
          {statusBar ?? <Text>Ready</Text>}
        </Flex>
      )}
    </Flex>
  );
};
