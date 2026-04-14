import React from 'react';
import { Box, Flex, VStack, Text, HStack } from '@chakra-ui/react';
import { SectionLabel } from '../../../components/common/Typography.tsx';

/**
 * EditorLayout is a flexible layout shell for any editor mode.
 * It provides:
 * - An optional header bar with title/subtitle and actions
 * - A main content area (canvas, form, etc.)
 * - Optional left sidebar (lists, trees)
 * - Optional right panel (inspector/properties)
 * - Optional bottom panel (palette, console)
 */

export interface EditorLayoutProps {
  /** Header configuration */
  header?: {
    title?: string;
    subtitle?: string;
    actions?: React.ReactNode;
  };
  /** Main content area */
  content: React.ReactNode;
  /** Optional left sidebar content */
  leftPanel?: React.ReactNode;
  /** Optional right panel content */
  rightPanel?: React.ReactNode;
  /** Optional bottom panel content */
  bottomPanel?: React.ReactNode;
  /** Panel sizing */
  leftWidth?: string | number;
  rightWidth?: string | number;
  bottomHeight?: string | number;
  /** Whether to show the dark viewport background or use transparent */
  viewportBackground?: boolean;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({
  header,
  content,
  leftPanel,
  rightPanel,
  bottomPanel,
  leftWidth = '280px',
  rightWidth = '280px',
  bottomHeight = '200px',
  viewportBackground = true,
}) => {
  const hasHeader = header?.title || header?.subtitle || header?.actions;

  return (
    <Flex direction="column" h="full" w="full" overflow="hidden">
      {/* Header Bar */}
      {hasHeader && (
        <HStack
          px={6}
          py={3}
          bg="#071018"
          borderBottom="1px"
          borderColor="#0b1116"
          justify="space-between"
          h="14"
          flexShrink={0}
        >
          <VStack align="start" spacing={0}>
            {header?.title && <SectionLabel textStyle="panelLabel">{header.title}</SectionLabel>}
            {header?.subtitle && (
              <Text fontSize="10px" color="gray.500" fontWeight="bold">
                {header.subtitle}
              </Text>
            )}
          </VStack>
          {header?.actions && <HStack spacing={2}>{header.actions}</HStack>}
        </HStack>
      )}

      {/* Main Area */}
      <Flex flex={1} overflow="hidden" minH={0}>
        {/* Left Panel */}
        {leftPanel && (
          <Box
            w={leftWidth}
            flexShrink={0}
            bg="#03040a"
            borderRight="1px"
            borderColor="#071018"
            overflow="hidden"
          >
            {leftPanel}
          </Box>
        )}

        {/* Center + Bottom Stack */}
        <Flex direction="column" flex={1} overflow="hidden">
          {/* Content Area */}
          <Box
            flex={1}
            position="relative"
            bg={viewportBackground ? '#0a0a0b' : 'transparent'}
            overflow="hidden"
          >
            {content}
          </Box>

          {/* Bottom Panel */}
          {bottomPanel && (
            <Box
              h={bottomHeight}
              flexShrink={0}
              bg="#03040a"
              borderTop="1px"
              borderColor="#071018"
              overflow="hidden"
            >
              {bottomPanel}
            </Box>
          )}
        </Flex>

        {/* Right Panel */}
        {rightPanel && (
          <Box
            w={rightWidth}
            flexShrink={0}
            bg="#03040a"
            borderLeft="1px"
            borderColor="#071018"
            overflow="hidden"
          >
            {rightPanel}
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

export default EditorLayout;
