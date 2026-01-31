import React from 'react';
import { HStack } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2, FiTrash2, FiDroplet, FiUser, FiCircle, FiSquare, FiCrosshair, FiShuffle } from 'react-icons/fi';
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
];

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const setDrawMode = useEditorStore(state => state.setDrawMode);

    const showDrawModes = activeTool === 'tilePaint' || activeTool === 'randomTile' || activeTool === 'tileErase';

    return (
        <HStack spacing={4}>
            {/* Main Tools */}
            <Toolbar
                items={MAP_TOOLS}
                activeId={activeTool}
                onActivate={(id) => setActiveTool(id as ToolType)}
            />

            {/* Draw Mode (Point/Rect/Circle) - Only for paint/erase tools */}
            {showDrawModes && (
                <Toolbar
                    items={DRAW_MODE_TOOLS}
                    activeId={drawMode}
                    onActivate={(id) => setDrawMode(id as 'point' | 'rect' | 'circle')}
                    size="sm"
                />
            )}
        </HStack>
    );
}

