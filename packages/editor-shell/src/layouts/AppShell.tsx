import React, { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

export interface AppShellProps {
  /** Content rendered in the fixed top bar area */
  topBar: ReactNode;
  /** The main content area (sidebar + editor content are typically placed here) */
  children: ReactNode;
  /** Optional status bar content. If omitted, shows "Ready". Pass `null` to hide. */
  statusBar?: ReactNode | null;
}

/**
 * AppShell provides the outermost application frame:
 * - A fixed top bar (h=12)
 * - A flexible main area that fills remaining space
 * - An optional status bar at the bottom (h=6)
 *
 * @example
 * ```tsx
 * <AppShell topBar={<MyTopBar />}>
 *   <Sidebar ... />
 *   <Box flex={1}>{editorContent}</Box>
 * </AppShell>
 * ```
 */
export const AppShell: React.FC<AppShellProps> = ({ topBar, children, statusBar }) => {
  const showStatusBar = statusBar !== null;

  return (
    <Flex direction="column" h="100vh" w="100vw" overflow="hidden" bg="gray.900" color="gray.200" userSelect="none">
      {/* Top Bar */}
      <Box h="12" borderBottom="1px" borderColor="gray.800" bg="gray.950" zIndex="20" flexShrink={0}>
        {topBar}
      </Box>

      {/* Main Workspace */}
      <Flex flex={1} overflow="hidden" minH={0}>
        {children}
      </Flex>

      {/* Status Bar */}
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
