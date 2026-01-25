import React from 'react';
import { HStack, IconButton, Button, Box } from '@chakra-ui/react';
import { AddIcon, MinusIcon, RepeatIcon } from '@chakra-ui/icons';

interface ZoomControlsProps {
    zoomPercent: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoomPercent, onZoomIn, onZoomOut, onReset }) => {
    return (
        <HStack position="absolute" bottom="4" left="4" bg="gray.800" p={1} rounded="lg" border="1px" borderColor="gray.700" spacing={1}>
            <IconButton aria-label="Zoom Out" icon={<MinusIcon />} size="xs" variant="ghost" onClick={onZoomOut} />
            <Button size="xs" variant="ghost" px={2} onClick={onReset} fontSize="xs" color="gray.300">
                {Math.round(zoomPercent)}%
            </Button>
            <IconButton aria-label="Zoom In" icon={<AddIcon />} size="xs" variant="ghost" onClick={onZoomIn} />
            <Box w="1px" h="4" bg="gray.700" mx={1} />
            <IconButton aria-label="Home" icon={<RepeatIcon />} size="xs" variant="ghost" onClick={onReset} />
        </HStack>
    );
};
