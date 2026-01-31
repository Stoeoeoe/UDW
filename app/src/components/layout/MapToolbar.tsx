import React from 'react';
import { HStack } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2, FiTrash2, FiUser, FiShuffle, FiGrid } from 'react-icons/fi';
import { FaEyeDropper } from "react-icons/fa6";
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';
import { Toolbar, ToolItem } from '../common/Toolbar';

// Map editor tools configuration
const MAP_TOOLS: ToolItem[] = [
    { id: 'select', icon: FiMousePointer, label: 'Select Object (V)', group: 'generic' },
    { id: 'stamp', icon: FiEdit2, label: 'Stamp (B)', group: 'tiles' },
    { id: 'random', icon: FiShuffle, label: 'Random (R)', group: 'tiles' },
    { id: 'erase', icon: FiTrash2, label: 'Erase (E)', group: 'tiles' },
    { id: 'eyedropper', icon: FaEyeDropper, label: 'Eyedropper (I) - Alt+Click', group: 'tiles' },
    { id: 'terrain', icon: FiGrid, label: 'Terrain Brush (T)', group: 'tiles' },
    { id: 'entityPlace', icon: FiUser, label: 'Place Entity (N)', group: 'entities' },
];

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);

    return (
        <HStack spacing={4}>
            {/* Main Tools */}
            <Toolbar
                items={MAP_TOOLS}
                activeId={activeTool}
                onActivate={(id) => setActiveTool(id as ToolType)}
            />
        </HStack>
    );
}

