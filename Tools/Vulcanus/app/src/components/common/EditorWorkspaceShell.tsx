import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export interface EditorWorkspaceShellProps {
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
  return (
    <Flex direction="column" h="full" w="full" overflow="hidden">
      <Box flex={1} minH={0} overflow="hidden">
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
