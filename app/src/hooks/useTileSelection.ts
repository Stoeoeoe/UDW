import { useCallback } from 'react';
import { useEditorStore } from '../store/useEditorStore';

/**
 * Custom hook for tile selection with Ctrl+click (toggle) and Shift+click (range) support.
 * Eliminates duplicate selection logic across TilesetEditor, TilesetPalette, etc.
 */
export function useTileSelection() {
    const selectedTileIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);
    const setSelectedTile = useEditorStore(state => state.setSelectedTile);
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const toggleSelectedTile = useEditorStore(state => state.toggleSelectedTile);

    const handleTileSelect = useCallback((index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => {
        // Ctrl+click: toggle individual tile in selection
        if (meta?.ctrlKey) {
            toggleSelectedTile(index);
            setSelectedTile(index);
            return;
        }

        // Shift+click: range selection from last selected to current
        if (meta?.shiftKey && selectedTileIndices.length > 0) {
            const last = selectedTileIndices[selectedTileIndices.length - 1] ?? (selectedTileIndex ?? 0);
            const start = Math.min(last, index);
            const end = Math.max(last, index);
            const range: number[] = [];
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            setSelectedTiles(range);
            setSelectedTile(index);
            return;
        }

        // Default: single selection
        setSelectedTiles([index]);
        setSelectedTile(index);
    }, [selectedTileIndices, selectedTileIndex, setSelectedTile, setSelectedTiles, toggleSelectedTile]);

    return {
        selectedTileIndex,
        selectedTileIndices,
        handleTileSelect,
    };
}
