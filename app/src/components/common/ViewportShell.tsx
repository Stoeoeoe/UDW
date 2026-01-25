import React from 'react';
import { Box, HStack, VStack, Heading, Text } from '@chakra-ui/react';

interface ViewportShellProps {
    title?: string;
    subtitle?: string;
    children?: React.ReactNode;
}

export const ViewportShell: React.FC<ViewportShellProps> = ({ title, subtitle, children }) => {
    return (
        <VStack h="full" w="full" align="stretch" spacing={0}>
            <HStack px={6} py={3} bg="#071018" borderBottom="1px" borderColor="#0b1116" justify="space-between" h="14" position="relative" zIndex={2}>
                <VStack align="start" spacing={0}>
                    {title && <Heading size="xs" color="white" textTransform="uppercase" letterSpacing="widest">{title}</Heading>}
                    {subtitle && <Text fontSize="10px" color="gray.500" fontWeight="bold">{subtitle}</Text>}
                </VStack>
            </HStack>
            <Box flex={1} position="relative" bg="#0a0a0b" overflow="hidden">
                {children}
            </Box>
        </VStack>
    );
};

export default ViewportShell;
