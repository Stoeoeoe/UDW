import React from 'react';
import { HStack } from '@chakra-ui/react';
import { FiMousePointer, FiEdit2 } from 'react-icons/fi';
import Toolbar, { ToolItem } from '../../common/Toolbar';
import { useEditorStore } from '../../../store/useEditorStore';

export const TilesetToolbar: React.FC = () => {
    const tilesetToolMode = useEditorStore(state => state.tilesetToolMode);
    const setTilesetToolMode = useEditorStore(state => state.setTilesetToolMode);

    const TOOLS: ToolItem[] = [
        { id: 'select', icon: FiMousePointer, label: 'Select', group: 'main' },
        { id: 'terrain', icon: FiEdit2, label: 'Terrain Paint', group: 'main' },
    ];

    return (
        <HStack spacing={4}>
            <Toolbar items={TOOLS} activeId={tilesetToolMode} onActivate={(id) => setTilesetToolMode(id as 'select' | 'terrain')} />
        </HStack>
    );
};
