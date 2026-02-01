import React from 'react';
import { VStack, Text, HStack, Slider, SliderTrack, SliderFilledTrack, SliderThumb, Tooltip, Button, Box, Divider, Circle } from '@chakra-ui/react';
import { FiCrosshair, FiSquare, FiCircle, FiMinus, FiDroplet } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { PanelShell } from '../common/PanelShell';

interface DrawModeOption {
    id: 'point' | 'rect' | 'circle' | 'line' | 'flood';
    icon: React.ElementType;
    label: string;
}

const DRAW_MODE_OPTIONS: DrawModeOption[] = [
    { id: 'point', icon: FiCrosshair, label: 'Point' },
    { id: 'rect', icon: FiSquare, label: 'Rectangle' },
    { id: 'circle', icon: FiCircle, label: 'Circle' },
    { id: 'line', icon: FiMinus, label: 'Line' },
    { id: 'flood', icon: FiDroplet, label: 'Flood Fill' },
];

/**
 * Panel showing tool properties for stamp/random/erase tools.
 * Displays shape selector and brush size controls.
 */
export const ToolPropertiesPanel: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const setDrawMode = useEditorStore(state => state.setDrawMode);
    const brushSize = useEditorStore(state => state.brushSize);
    const setBrushSize = useEditorStore(state => state.setBrushSize);
    const terrainTypes = useEditorStore(state => state.terrainTypes);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);
    const setSelectedTerrain = useEditorStore(state => state.setSelectedTerrain);
    const [showTooltip, setShowTooltip] = React.useState(false);

    // Show for stamp, random, erase, terrain tools
    const isTileTool = activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase';
    const isTerrainTool = activeTool === 'terrain';
    
    if (!isTileTool && !isTerrainTool) return null;

    // Show brush size for point and line modes only
    const showBrushSize = drawMode === 'point' || drawMode === 'line';

    // Get tool display name
    const getToolName = () => {
        switch (activeTool) {
            case 'stamp': return 'Stamp Tool';
            case 'random': return 'Random Tool';
            case 'erase': return 'Erase Tool';
            case 'terrain': return 'Terrain Brush';
            default: return 'Tool';
        }
    };

    // Terrain tool UI
    if (isTerrainTool) {
        return (
            <PanelShell title={getToolName()}>
                <VStack align="stretch" spacing={4} p={3}>
                    {/* Shape Selector - same as tile tools */}
                    <Box>
                        <Text fontSize="xs" color="gray.400" mb={2} fontWeight="medium">Shape</Text>
                        <HStack spacing={1} flexWrap="wrap">
                            {DRAW_MODE_OPTIONS.filter(opt => opt.id !== 'flood').map(option => {
                                const Icon = option.icon;
                                const isActive = drawMode === option.id;
                                return (
                                    <Tooltip key={option.id} label={option.label} placement="top" hasArrow>
                                        <Button
                                            size="sm"
                                            variant={isActive ? 'solid' : 'ghost'}
                                            colorScheme={isActive ? 'blue' : 'gray'}
                                            onClick={() => setDrawMode(option.id)}
                                            p={2}
                                            minW="32px"
                                        >
                                            <Icon />
                                        </Button>
                                    </Tooltip>
                                );
                            })}
                        </HStack>
                    </Box>

                    {/* Terrain Type Selector */}
                    <Box>
                        <Text fontSize="xs" color="gray.400" mb={2} fontWeight="medium">Terrain Type</Text>
                        {terrainTypes.length === 0 ? (
                            <Text fontSize="sm" color="gray.500">
                                No terrain types defined. Add terrain types in Settings → Terrain.
                            </Text>
                        ) : (
                            <VStack align="stretch" spacing={1}>
                                {terrainTypes.map(t => (
                                    <HStack
                                        key={t.id}
                                        spacing={3}
                                        align="center"
                                        px={3}
                                        py={2}
                                        rounded="md"
                                        cursor="pointer"
                                        bg={selectedTerrainId === t.id ? 'blue.700' : 'transparent'}
                                        _hover={{ bg: selectedTerrainId === t.id ? 'blue.600' : 'gray.700' }}
                                        onClick={() => setSelectedTerrain(t.id)}
                                    >
                                        <Circle size="14px" bg={t.color} />
                                        <Text fontSize="sm" flex={1} fontWeight={selectedTerrainId === t.id ? 'semibold' : 'normal'} color={selectedTerrainId === t.id ? 'white' : 'gray.300'}>
                                            {t.displayName}
                                        </Text>
                                    </HStack>
                                ))}
                            </VStack>
                        )}
                    </Box>

                    {/* Brush Size for Point Mode */}
                    {drawMode === 'point' && (
                        <>
                            <Divider borderColor="gray.700" />
                            <Box>
                                <HStack justify="space-between" mb={2}>
                                    <Text fontSize="xs" color="gray.400" fontWeight="medium">Brush Size</Text>
                                    <Text fontSize="xs" color="gray.300" fontWeight="bold">{brushSize}</Text>
                                </HStack>
                                <Slider
                                    aria-label="Brush size"
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={brushSize}
                                    onChange={setBrushSize}
                                    onMouseEnter={() => setShowTooltip(true)}
                                    onMouseLeave={() => setShowTooltip(false)}
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
                                        <SliderThumb boxSize={4} />
                                    </Tooltip>
                                </Slider>
                            </Box>
                        </>
                    )}

                    {/* Help text */}
                    <Box pt={2}>
                        <Text fontSize="xs" color="gray.500" fontStyle="italic">
                            Click and drag to paint terrain. Tiles will automatically update to match corner configurations.
                        </Text>
                    </Box>
                </VStack>
            </PanelShell>
        );
    }

    return (
        <PanelShell title={getToolName()}>
            <VStack align="stretch" spacing={4} p={3}>
                {/* Shape Selector */}
                <Box>
                    <Text fontSize="xs" color="gray.400" mb={2} fontWeight="medium">Shape</Text>
                    <HStack spacing={1} flexWrap="wrap">
                        {DRAW_MODE_OPTIONS.map(option => {
                            const Icon = option.icon;
                            const isActive = drawMode === option.id;
                            return (
                                <Tooltip key={option.id} label={option.label} placement="top" hasArrow>
                                    <Button
                                        size="sm"
                                        variant={isActive ? 'solid' : 'ghost'}
                                        colorScheme={isActive ? 'blue' : 'gray'}
                                        onClick={() => setDrawMode(option.id)}
                                        p={2}
                                        minW="32px"
                                    >
                                        <Icon />
                                    </Button>
                                </Tooltip>
                            );
                        })}
                    </HStack>
                </Box>

                {/* Brush Size */}
                {showBrushSize && (
                    <>
                        <Divider borderColor="gray.700" />
                        <Box>
                            <HStack justify="space-between" mb={2}>
                                <Text fontSize="xs" color="gray.400" fontWeight="medium">Brush Size</Text>
                                <Text fontSize="xs" color="gray.300" fontWeight="bold">{brushSize}</Text>
                            </HStack>
                            <Slider
                                aria-label="Brush size"
                                min={1}
                                max={10}
                                step={1}
                                value={brushSize}
                                onChange={setBrushSize}
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
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
                                    <SliderThumb boxSize={4} />
                                </Tooltip>
                            </Slider>
                        </Box>
                    </>
                )}

                {/* Help text */}
                <Box pt={2}>
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                        {drawMode === 'point' && 'Click to paint. Shift+click to draw lines.'}
                        {drawMode === 'rect' && 'Click and drag to paint a rectangle.'}
                        {drawMode === 'circle' && 'Click and drag to paint a circle.'}
                        {drawMode === 'line' && 'Click and drag to paint a line.'}
                        {drawMode === 'flood' && 'Click to flood fill an area.'}
                    </Text>
                </Box>
            </VStack>
        </PanelShell>
    );
};

export default ToolPropertiesPanel;
