import React from 'react';
import { Box, Flex, HStack, VStack } from '@chakra-ui/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { SectionLabel } from './Typography.tsx';

export interface EditorWorkspaceShellProps {
  header?: {
    title?: string;
    subtitle?: string;
    //actions?: React.ReactNode;
  };
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

export const EditorResizeHandle: React.FC<{ direction: 'horizontal' | 'vertical' }> = ({
  direction,
}) => (
  <PanelResizeHandle aria-label={`Resize ${direction === 'horizontal' ? 'sidebar' : 'panel'}`}>
    <Box
      w={direction === 'horizontal' ? '5px' : 'full'}
      h={direction === 'horizontal' ? 'full' : '5px'}
      bg="editorShellBorder"
      cursor={direction === 'horizontal' ? 'col-resize' : 'row-resize'}
      transition="background 0.15s"
      _hover={{ bg: 'blue.500' }}
      _active={{ bg: 'blue.400' }}
    />
  </PanelResizeHandle>
);

const PanelSurface: React.FC<
  React.PropsWithChildren<{ borderLeft?: boolean; borderRight?: boolean; borderTop?: boolean }>
> = ({ children, borderLeft, borderRight, borderTop }) => (
  <Box
    h="full"
    bg="editorPanelBg"
    borderLeft={borderLeft ? '1px' : undefined}
    borderRight={borderRight ? '1px' : undefined}
    borderTop={borderTop ? '1px' : undefined}
    borderColor="editorShellBorder"
    overflow="hidden"
  >
    {children}
  </Box>
);

export const EditorWorkspaceShell: React.FC<EditorWorkspaceShellProps> = ({
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
  const hasHeader = header?.title; //|| header?.subtitle || header?.actions;

  return (
    <Flex direction="column" h="full" w="full" overflow="hidden">
      {hasHeader && (
        <HStack
          px={6}
          py={3}
          bg="editorHeaderBg"
          borderBottom="1px"
          borderColor="editorShellBorder"
          justify="space-between"
          h="8"
          flexShrink={0}
        >
          <VStack align="start" spacing={0}>
            {header?.title && <SectionLabel textStyle="panelLabel">{header.title}</SectionLabel>}
          </VStack>
        </HStack>
      )}

      <Box flex={1} overflow="hidden">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
          {leftPanel && (
            <>
              <Panel defaultSize={leftPanelDefaultSize} minSize={leftPanelMinSize} order={1}>
                <PanelSurface borderRight>{leftPanel}</PanelSurface>
              </Panel>
              <EditorResizeHandle direction="horizontal" />
            </>
          )}

          <Panel order={2}>
            <PanelGroup direction="vertical" style={{ height: '100%' }}>
              <Panel order={1}>
                <Box
                  h="full"
                  position="relative"
                  bg={viewportBackground ? 'editorCanvasBg' : 'transparent'}
                  overflow="hidden"
                >
                  {content}
                </Box>
              </Panel>

              {bottomPanel && (
                <>
                  <EditorResizeHandle direction="vertical" />
                  <Panel
                    defaultSize={bottomPanelDefaultSize}
                    minSize={bottomPanelMinSize}
                    order={2}
                  >
                    <PanelSurface borderTop>{bottomPanel}</PanelSurface>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {rightPanel && (
            <>
              <EditorResizeHandle direction="horizontal" />
              <Panel defaultSize={rightPanelDefaultSize} minSize={rightPanelMinSize} order={3}>
                <PanelSurface borderLeft>{rightPanel}</PanelSurface>
              </Panel>
            </>
          )}
        </PanelGroup>
      </Box>
    </Flex>
  );
};

export default EditorWorkspaceShell;
