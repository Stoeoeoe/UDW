import React from 'react';
import {
    HStack,
    IconButton,
    Tooltip,
    Box,
    Text,
    Button,
    ButtonGroup,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';

// Icons
const CursorIcon = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" /></svg>;
const PaintBrushIcon = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M15.825.145a.5.5 0 0 1 .132.583l-4.908 11.45a.5.5 0 0 1-.736.232l-4.322-2.881-2.903 2.902a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 0-.707l2.902-2.903L1.012 3.085a.5.5 0 0 1 .232-.736L12.694.125a.5.5 0 0 1 .583.132zM2.17 3.312l2.373 3.561L8.586 10.45l3.561 2.373L14.015 1.985 2.17 3.312z" /></svg>;
const EraserIcon = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z" /></svg>;
const BucketIcon = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5V8zM2 8.5v4h6v-4H2zm9-5.5a.5.5 0 0 1 .5.5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1a.5.5 0 0 1 .5-.5z" /></svg>;
const EntityIcon = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z" /></svg>;

const PointIcon = () => <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>;
const RectIcon = () => <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" /></svg>;
const CircleIcon = () => <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" fill="none" /></svg>;

const TOOLS: { id: ToolType; icon: any; label: string; group: 'generic' | 'tiles' | 'entities' }[] = [
    { id: 'select', icon: CursorIcon, label: 'Select Object (V)', group: 'generic' },
    { id: 'tilePaint', icon: PaintBrushIcon, label: 'Paint Tile (B)', group: 'tiles' },
    { id: 'tileErase', icon: EraserIcon, label: 'Erase Tile (E)', group: 'tiles' },
    { id: 'tileFill', icon: BucketIcon, label: 'Bucket Fill (G)', group: 'tiles' },
    { id: 'entityPlace', icon: EntityIcon, label: 'Place Entity (N)', group: 'entities' },
];

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const setDrawMode = useEditorStore(state => state.setDrawMode);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);

    // Preparation for Terrain mode (UI only for now)
    const isTerrainMode = selectedTerrainId !== null;

    const renderGroup = (groupName: string) => {
        return TOOLS.filter(t => t.group === groupName).map((tool) => (
            <Tooltip key={tool.id} label={tool.label} placement="bottom" hasArrow>
                <IconButton
                    aria-label={tool.label}
                    icon={<tool.icon />}
                    size="sm"
                    variant={activeTool === tool.id ? 'solid' : 'ghost'}
                    colorScheme={activeTool === tool.id ? 'blue' : 'gray'}
                    bg={activeTool === tool.id ? 'blue.600' : 'transparent'}
                    color={activeTool === tool.id ? 'white' : 'gray.400'}
                    _hover={{ bg: activeTool === tool.id ? 'blue.500' : 'gray.800', color: 'white' }}
                    onClick={() => setActiveTool(tool.id)}
                    minW="32px"
                    h="32px"
                    rounded="md"
                />
            </Tooltip>
        ));
    };

    return (
        <HStack spacing={4}>
            <HStack bg="gray.900" p="1" rounded="xl" border="1px" borderColor="gray.800" spacing="1" boxShadow="lg">
                {renderGroup('generic')}
                <Box w="1px" h="4" bg="gray.700" mx={1} />
                {renderGroup('tiles')}
                <Box w="1px" h="4" bg="gray.700" mx={1} />
                {renderGroup('entities')}
            </HStack>

            {/* Shape / Draw Mode (Only for Tile tools) */}
            {(activeTool === 'tilePaint' || activeTool === 'tileErase') && (
                <HStack bg="gray.900" p="1" rounded="xl" border="1px" borderColor="gray.800" spacing="1" boxShadow="lg">
                    <Tooltip label="Single Point" hasArrow><IconButton aria-label="Point" icon={<PointIcon />} size="xs" variant={drawMode === 'point' ? 'solid' : 'ghost'} colorScheme="blue" onClick={() => setDrawMode('point')} /></Tooltip>
                    <Tooltip label="Rectangle" hasArrow><IconButton aria-label="Rect" icon={<RectIcon />} size="xs" variant={drawMode === 'rect' ? 'solid' : 'ghost'} colorScheme="blue" onClick={() => setDrawMode('rect')} /></Tooltip>
                    <Tooltip label="Circle" hasArrow><IconButton aria-label="Circle" icon={<CircleIcon />} size="xs" variant={drawMode === 'circle' ? 'solid' : 'ghost'} colorScheme="blue" onClick={() => setDrawMode('circle')} /></Tooltip>
                </HStack>
            )}

            {/* Mode Toggle Preparation (Terrain vs Tile) */}
            {(activeTool === 'tilePaint') && (
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
                        isDisabled // Not implemented yet
                    >
                        TERRAIN
                    </Button>
                </ButtonGroup>
            )}
        </HStack>
    );
};
