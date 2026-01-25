import React from 'react';
import { Box, VStack, Heading, Text } from '@chakra-ui/react';

interface PanelShellProps {
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({ title, subtitle, children }) => {
    return (
        <VStack h="full" w="full" align="stretch" spacing={0} bg="#03040a">
            <Box bg="#05060a" borderBottom="1px" borderColor="#071018" px={4} py={3}>
                <VStack align="start" spacing={0}>
                    {title && <Heading size="xs" color="white">{title}</Heading>}
                    {subtitle && <Text fontSize="10px" color="gray.500">{subtitle}</Text>}
                </VStack>
            </Box>

            <Box p={4} overflowY="auto" flex={1}>
                {children}
            </Box>
        </VStack>
    );
};

export default PanelShell;
