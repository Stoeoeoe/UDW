import React from 'react';
import { HStack, Text, Slider, SliderTrack, SliderFilledTrack, SliderThumb, Tooltip } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2, FiTrash2, FiDroplet, FiUser, FiCircle, FiSquare, FiCrosshair, FiShuffle, FiMinus } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';
import { Toolbar, ToolItem } from '../common/Toolbar';

// Map editor tools configuration
const MAP_TOOLS: ToolItem[] = [
    { id: 'select', icon: FiMousePointer, label: 'Select Object (V)', group: 'generic' },
    { id: 'tilePaint', icon: FiEdit2, label: 'Paint Tile (B)', group: 'tiles' },
    { id: 'randomTile', icon: FiShuffle, label: 'Random Tile (R)', group: 'tiles' },
    { id: 'tileErase', icon: FiTrash2, label: 'Erase Tile (E)', group: 'tiles' },
    { id: 'tileFill', icon: FiDroplet, label: 'Bucket Fill (G)', group: 'tiles' },
    { id: 'entityPlace', icon: FiUser, label: 'Place Entity (N)', group: 'entities' },
];

// Draw mode tools configuration
const DRAW_MODE_TOOLS: ToolItem[] = [
    { id: 'point', icon: FiCrosshair, label: 'Single Point' },
    { id: 'rect', icon: FiSquare, label: 'Rectangle' },
    { id: 'circle', icon: FiCircle, label: 'Circle' },
    { id: 'line', icon: FiMinus, label: 'Line' },
];

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const setDrawMode = useEditorStore(state => state.setDrawMode);
    const brushSize = useEditorStore(state => state.brushSize);
    const setBrushSize = useEditorStore(state => state.setBrushSize);
    const [showTooltip, setShowTooltip] = React.useState(false);

    const showDrawModes = activeTool === 'tilePaint' || activeTool === 'randomTile' || activeTool === 'tileErase';
    const showBrushSize = showDrawModes && (drawMode === 'point' || drawMode === 'line');

    return (
        <HStack spacing={4}>
            {/* Main Tools */}
            <Toolbar
                items={MAP_TOOLS}
                activeId={activeTool}
                onActivate={(id) => setActiveTool(id as ToolType)}
            />

            {/* Draw Mode (Point/Rect/Circle/Line) - Only for paint/erase tools */}
            {showDrawModes && (
                <Toolbar
                    items={DRAW_MODE_TOOLS}
                    activeId={drawMode}
                    onActivate={(id) => setDrawMode(id as 'point' | 'rect' | 'circle' | 'line')}
                    size="sm"
                />
            )}

            {/* Brush Size - Only for point/line modes */}
            {showBrushSize && (
                <HStack spacing={2} bg="gray.800" px={3} py={1} borderRadius="md">
                    <Text fontSize="xs" color="gray.400" whiteSpace="nowrap">Size</Text>
                    <Slider
                        aria-label="Brush size"
                        min={1}
                        max={10}
                        step={1}
                        value={brushSize}
                        onChange={setBrushSize}
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        w="80px"
                    >
                        <SliderTrack bg="gray.600">
                            <SliderFilledTrack bg="blue.500" />
                        </SliderTrack>
                        <Tooltip
                            hasArrow
                            bg="blue.500"
                            color="white"
                            placement="top"
                            isOpen={showTooltip}
                            label={brushSize}
                        >
                            <SliderThumb boxSize={3} />
                        </Tooltip>
                    </Slider>
                    <Text fontSize="xs" color="gray.300" w="16px" textAlign="center">{brushSize}</Text>
                </HStack>
            )}
        </HStack>
    );
}

