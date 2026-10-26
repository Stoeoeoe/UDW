import React from 'react';
import { Flex, HStack, Text, Button, Badge, Box } from '@chakra-ui/react';

export interface TopTabbedEditorTab<T extends string> {
  id: T;
  label: string;
  badge?: number;
  issueCount?: number;
}

interface TopTabbedEditorLayoutProps<T extends string> {
  title: string;
  tabs: TopTabbedEditorTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  mainContent: React.ReactNode;
  sidebarContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  sidebarWidth?: string;
}

export function TopTabbedEditorLayout<T extends string>({
  title,
  tabs,
  activeTab,
  onTabChange,
  mainContent,
  sidebarContent,
  footerContent,
  headerActions,
  sidebarWidth = '320px',
}: TopTabbedEditorLayoutProps<T>) {
  return (
    <Flex direction="column" h="full" overflow="hidden">
      <HStack
        px={4}
        minH="10"
        flexWrap="wrap"
        bg="editorPanelBg"
        borderBottom="1px"
        borderColor="editorShellBorder"
        flexShrink={0}
        spacing={1}
      >
        {title && (
          <Text fontWeight="bold" fontSize="sm" color="editorText" mr={3}>
            {title}
          </Text>
        )}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.badge ?? 0;

          return (
            <Button
              key={tab.id}
              size="xs"
              variant="ghost"
              color={isActive ? 'blue.300' : 'gray.500'}
              bg={isActive ? 'whiteAlpha.100' : 'transparent'}
              _hover={{ bg: 'whiteAlpha.100', color: isActive ? 'blue.300' : 'gray.300' }}
              onClick={() => onTabChange(tab.id)}
              px={2}
              h="6"
              fontSize="11px"
              fontWeight={isActive ? 'bold' : 'medium'}
            >
              {tab.label}
              {count > 0 && (
                <Badge
                  ml={1}
                  fontSize="9px"
                  colorScheme={isActive ? 'blue' : 'gray'}
                  variant="editor"
                >
                  {count}
                </Badge>
              )}
              {!!tab.issueCount && (
                <Badge ml={1} fontSize="9px" colorScheme="red">
                  {tab.issueCount} {tab.issueCount === 1 ? 'issue' : 'issues'}
                </Badge>
              )}
            </Button>
          );
        })}
        {headerActions && (
          <HStack ml="auto" spacing={2}>
            {headerActions}
          </HStack>
        )}
      </HStack>

      <Flex flex={1} overflow="hidden">
        <Flex flex={1} direction="column" overflow="hidden">
          <Box flex={1} overflow="hidden">
            {mainContent}
          </Box>
          {footerContent}
        </Flex>

        {sidebarContent && (
          <Box
            w={sidebarWidth}
            flexShrink={0}
            borderLeft="1px"
            borderColor="editorShellBorder"
            overflowY="auto"
            bg="editorHeaderBg"
          >
            {sidebarContent}
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

export default TopTabbedEditorLayout;
