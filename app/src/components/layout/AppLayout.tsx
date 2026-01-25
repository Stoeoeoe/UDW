import React, { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

interface AppLayoutProps {
    topBar: ReactNode;
    leftPanel: ReactNode;
    rightPanel: ReactNode;
    viewport: ReactNode;
    leftPanelOpen?: boolean;
    rightPanelOpen?: boolean;
    leftWidth?: string | number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
    topBar,
    leftPanel,
    rightPanel,
    viewport,
    leftPanelOpen = true,
    rightPanelOpen = true,
    leftWidth = "80"
}) => {
    return (
        <Flex direction="column" h="100vh" w="100vw" overflow="hidden" bg="gray.900" color="gray.200" userSelect="none">
            {/* Top Bar Area */}
            <Box h="12" borderBottom="1px" borderColor="gray.800" bg="gray.950" zIndex="20" flexShrink={0}>
                {topBar}
            </Box>

            {/* Main Workspace Area */}
            <Flex flex={1} overflow="hidden" minH={0}>

                {/* Left Panel */}
                <Box
                    flexShrink={0}
                    bg="gray.950"
                    borderRightWidth={leftPanelOpen ? "1px" : "0"}
                    borderColor="gray.800"
                    transition="width 0.2s ease-in-out"
                    w={leftPanelOpen ? leftWidth : "0"}
                    overflow="hidden"
                >
                    <Flex direction="column" h="full" w={leftWidth}>
                        {leftPanel}
                    </Flex>
                </Box>

                {/* Viewport (Center) */}
                <Box flex={1} bg="gray.800" position="relative" zIndex={0} overflow="hidden" display="flex" flexDirection="column">
                    {viewport}
                </Box>

                {/* Right Panel */}
                <Box
                    flexShrink={0}
                    bg="gray.950"
                    borderLeftWidth={rightPanelOpen ? "1px" : "0"}
                    borderColor="gray.800"
                    transition="width 0.2s ease-in-out"
                    w={rightPanelOpen ? "80" : "0"}
                    overflow="hidden"
                >
                    <Flex direction="column" h="full" w="80">
                        {rightPanel}
                    </Flex>
                </Box>

            </Flex>

            {/* Status Bar */}
            <Flex h="6" bg="gray.900" borderTop="1px" borderColor="gray.800" alignItems="center" px="2" fontSize="xs" color="gray.500" zIndex="20" flexShrink={0}>
                <Text>Ready</Text>
            </Flex>
        </Flex>
    );
};
