import React from 'react';
import { Box, Flex, VStack, Heading, Text, HStack } from '@chakra-ui/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export interface ResizableEditorLayoutProps {
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
  /** Panel sizing (percentages for resizable panels) */
  leftPanelDefaultSize?: number;
  leftPanelMinSize?: number;
  rightPanelDefaultSize?: number;
  rightPanelMinSize?: number;
  bottomPanelDefaultSize?: number;
  bottomPanelMinSize?: number;
  /** Whether to show the dark viewport background or use transparent */
  viewportBackground?: boolean;
}

/** Styled resize handle for horizontal panels */
const HorizontalResizeHandle: React.FC = () => (
  <PanelResizeHandle>
    <Box
      w="4px"
      h="full"
      bg="transparent"
      cursor="col-resize"
      transition="background 0.15s"
      _hover={{ bg: 'blue.500' }}
      _active={{ bg: 'blue.400' }}
    />
  </PanelResizeHandle>
);

/** Styled resize handle for vertical panels */
const VerticalResizeHandle: React.FC = () => (
  <PanelResizeHandle>
    <Box
      w="full"
      h="4px"
      bg="transparent"
      cursor="row-resize"
      transition="background 0.15s"
      _hover={{ bg: 'blue.500' }}
      _active={{ bg: 'blue.400' }}
    />
  </PanelResizeHandle>
);

/**
 * ResizableEditorLayout - A flexible, resizable layout shell for any editor mode.
 * Uses react-resizable-panels for proper panel resizing.
 */
export const ResizableEditorLayout: React.FC<ResizableEditorLayoutProps> = ({
  header,
  content,
  leftPanel,
  rightPanel,
  bottomPanel,
  leftPanelDefaultSize = 20,
  leftPanelMinSize = 10,
  rightPanelDefaultSize = 20,
  rightPanelMinSize = 10,
  bottomPanelDefaultSize = 25,
  bottomPanelMinSize = 10,
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
          bg="editor.headerBg"
          borderBottom="1px"
          borderColor="editor.border"
          justify="space-between"
          h="14"
          flexShrink={0}
        >
          <VStack align="start" spacing={0}>
            {header?.title && (
              <Heading
                size="xs"
                color="white"
                textTransform="uppercase"
                letterSpacing="widest"
              >
                {header.title}
              </Heading>
            )}
            {header?.subtitle && (
              <Text fontSize="10px" color="gray.500" fontWeight="bold">
                {header.subtitle}
              </Text>
            )}
          </VStack>
          {header?.actions && <HStack spacing={2}>{header.actions}</HStack>}
        </HStack>
      )}

      {/* Main Area with Resizable Panels */}
      <Box flex={1} overflow="hidden">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
          {/* Left Panel */}
          {leftPanel && (
            <>
              <Panel
                defaultSize={leftPanelDefaultSize}
                minSize={leftPanelMinSize}
                order={1}
              >
                <Box
                  h="full"
                  bg="editor.panelBg"
                  borderRight="1px"
                  borderColor="editor.border"
                  overflow="hidden"
                >
                  {leftPanel}
                </Box>
              </Panel>
              <HorizontalResizeHandle />
            </>
          )}

          {/* Center: Content + Optional Bottom Panel */}
          <Panel order={2}>
            {bottomPanel ? (
              <PanelGroup direction="vertical" style={{ height: '100%' }}>
                <Panel order={1}>
                  <Box
                    h="full"
                    position="relative"
                    bg={
                      viewportBackground ? 'editor.viewportBg' : 'transparent'
                    }
                    overflow="hidden"
                  >
                    {content}
                  </Box>
                </Panel>
                <VerticalResizeHandle />
                <Panel
                  defaultSize={bottomPanelDefaultSize}
                  minSize={bottomPanelMinSize}
                  order={2}
                >
                  <Box
                    h="full"
                    bg="editor.panelBg"
                    borderTop="1px"
                    borderColor="editor.border"
                    overflow="hidden"
                  >
                    {bottomPanel}
                  </Box>
                </Panel>
              </PanelGroup>
            ) : (
              <Box
                h="full"
                position="relative"
                bg={viewportBackground ? 'editor.viewportBg' : 'transparent'}
                overflow="hidden"
              >
                {content}
              </Box>
            )}
          </Panel>

          {/* Right Panel */}
          {rightPanel && (
            <>
              <HorizontalResizeHandle />
              <Panel
                defaultSize={rightPanelDefaultSize}
                minSize={rightPanelMinSize}
                order={3}
              >
                <Box
                  h="full"
                  bg="editor.panelBg"
                  borderLeft="1px"
                  borderColor="editor.border"
                  overflow="hidden"
                >
                  {rightPanel}
                </Box>
              </Panel>
            </>
          )}
        </PanelGroup>
      </Box>
    </Flex>
  );
};
