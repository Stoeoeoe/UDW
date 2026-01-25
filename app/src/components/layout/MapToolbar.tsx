import React from 'react';
import {
    HStack,
    IconButton,
    Tooltip,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { ToolType } from '../../types/editor';

// Icons
const CursorIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" /></svg>;
const PaintBrushIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h6z M6.5 7a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3z" /></svg>;
const EraserIcon = () => <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z" /></svg>;

const TOOL_BUTTONS: { id: ToolType; icon: any; label: string }[] = [
    { id: 'select', icon: CursorIcon, label: 'Select (V)' },
    { id: 'tilePaint', icon: PaintBrushIcon, label: 'Paint (B)' },
    { id: 'tileErase', icon: EraserIcon, label: 'Erase (E)' },
];

export const MapToolbar: React.FC = () => {
    const activeTool = useEditorStore(state => state.activeTool);
    const setActiveTool = useEditorStore(state => state.setActiveTool);

    return (
        <HStack bg="gray.800" p="1" rounded="lg" border="1px" borderColor="gray.700" spacing="1">
            {TOOL_BUTTONS.map((tool) => (
                <Tooltip key={tool.id} label={tool.label} placement="bottom" hasArrow>
                    <IconButton
                        aria-label={tool.label}
                        icon={<tool.icon />}
                        size="sm"
                        variant={activeTool === tool.id ? 'solid' : 'ghost'}
                        colorScheme={activeTool === tool.id ? 'gray' : 'whiteAlpha'}
                        bg={activeTool === tool.id ? 'gray.600' : 'transparent'}
                        _hover={{ bg: activeTool === tool.id ? 'gray.500' : 'gray.700' }}
                        onClick={() => setActiveTool(tool.id)}
                        minW="32px"
                        h="32px"
                    />
                </Tooltip>
            ))}
        </HStack>
    );
};
