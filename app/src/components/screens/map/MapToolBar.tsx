import React from 'react';
import { HStack, Button, ButtonGroup } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2, FiSlash, FiDroplet, FiUser, FiCircle, FiSquare, FiTarget, FiShuffle } from 'react-icons/fi';
import Toolbar, { ToolItem } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';
import { ToolType } from '../../../types/editor';

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const setDrawMode = useEditorStore(state => state.setDrawMode);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);

    const isTerrainMode = selectedTerrainId !== null;

    const TOOLS: ToolItem[] = [
        { id: 'select', icon: FiMousePointer, label: 'Select Object (V)', group: 'generic' },
        { id: 'stamp', icon: FiEdit2, label: 'Stamp Tile (B)', group: 'tiles' },
        { id: 'random', icon: FiShuffle, label: 'Random Tile (R)', group: 'tiles' },
        { id: 'erase', icon: FiSlash, label: 'Erase Tile (E)', group: 'tiles' },
        { id: 'fill', icon: FiDroplet, label: 'Bucket Fill (G)', group: 'tiles' },
        { id: 'entityPlace', icon: FiUser, label: 'Place Entity (N)', group: 'entities' },
    ];

    return (
        <HStack spacing={4}>
            <Toolbar items={TOOLS} activeId={activeTool} onActivate={(id) => setActiveTool(id as ToolType)} />

            {(activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase') && (
                <HStack bg="gray.900" p="1" rounded="xl" border="1px" borderColor="gray.800" spacing="1" boxShadow="lg">
                    <Button aria-label="Point" onClick={() => setDrawMode('point')} size="xs" variant={drawMode === 'point' ? 'solid' : 'ghost'} colorScheme="blue"><FiTarget /></Button>
                    <Button aria-label="Rect" onClick={() => setDrawMode('rect')} size="xs" variant={drawMode === 'rect' ? 'solid' : 'ghost'} colorScheme="blue"><FiSquare /></Button>
                    <Button aria-label="Circle" onClick={() => setDrawMode('circle')} size="xs" variant={drawMode === 'circle' ? 'solid' : 'ghost'} colorScheme="blue"><FiCircle /></Button>
                </HStack>
            )}

            {(activeTool === 'stamp') && (
                <ButtonGroup size="xs" isAttached variant="outline" colorScheme="blue">
                    <Button
                        bg={!isTerrainMode ? 'blue.600' : 'transparent'}
                        color={!isTerrainMode ? 'white' : 'gray.400'}
                        borderColor="gray.700"
                        _hover={{ bg: !isTerrainMode ? 'blue.500' : 'gray.800' }}
                        fontSize="9px"
                        fontWeight="black"
                    >
                        TILE
                    </Button>
                    <Button
                        bg={isTerrainMode ? 'blue.600' : 'transparent'}
                        color={isTerrainMode ? 'white' : 'gray.400'}
                        borderColor="gray.700"
                        _hover={{ bg: isTerrainMode ? 'blue.500' : 'gray.800' }}
                        fontSize="9px"
                        fontWeight="black"
                        isDisabled
                    >
                        TERRAIN
                    </Button>
                </ButtonGroup>
            )}
        </HStack>
    );
};
