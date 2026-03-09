import React from 'react';
import { Box, Flex, VStack, Heading, Text, HStack } from '@chakra-ui/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export interface ResizableEditorLayoutProps {
  header?: { title?: string; subtitle?: string; actions?: React.ReactNode };
  content: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  leftPanelDefaultSize?: number;
  leftPanelMinSize?: number;
  rightPanelDefaultSize?: number;
  rightPanelMinSize?: number;
  bottomPanelDefaultSize?: number;
  bottomPanelMinSize?: number;
  viewportBackground?: boolean;
}

const HResizeHandle: React.FC = () => (
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

const VResizeHandle: React.FC = () => (
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
      <Box flex={1} overflow="hidden">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
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
              <HResizeHandle />
            </>
          )}
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
                <VResizeHandle />
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
          {rightPanel && (
            <>
              <HResizeHandle />
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
