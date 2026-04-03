import { useCallback } from 'react';
import { useEditorStore } from '../store/useEditorStore';

/**
 * Custom hook for tile selection with Ctrl+click (toggle) and Shift+click (range) support.
 * Eliminates duplicate selection logic across TilesetEditor, TilesetPalette, etc.
 */
import { useState, useMemo } from 'react';

export function useTileSelection(options?: { local?: boolean }) {
  // Always call hooks in the same order
  const storeSelectedTileIndex = useEditorStore((state) => state.selectedTileIndex);
  const storeSelectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const storeSetSelectedTile = useEditorStore((state) => state.setSelectedTile);
  const storeSetSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const storeToggleSelectedTile = useEditorStore((state) => state.toggleSelectedTile);

  const [localSelectedTileIndex, setLocalSelectedTileIndex] = useState<number | null>(null);
  const [localSelectedTileIndices, setLocalSelectedTileIndices] = useState<number[]>([]);

  const useLocal = options?.local;

  const selectedTileIndex = useLocal ? localSelectedTileIndex : storeSelectedTileIndex;
  const selectedTileIndices = useLocal ? localSelectedTileIndices : storeSelectedTileIndices;
  const setSelectedTile = useLocal ? setLocalSelectedTileIndex : storeSetSelectedTile;
  const setSelectedTiles = useLocal ? setLocalSelectedTileIndices : storeSetSelectedTiles;

  const toggleSelectedTile = useMemo(() => {
    if (!useLocal) return storeToggleSelectedTile;
    return (index: number) => {
      setLocalSelectedTileIndices((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        } else {
          return [...prev, index];
        }
      });
      setLocalSelectedTileIndex(index);
    };
  }, [useLocal, storeToggleSelectedTile]);

  const handleTileSelect = useCallback(
    (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => {
      // Ctrl+click: toggle individual tile in selection
      toggleSelectedTile(index);
      if (meta?.ctrlKey) {
        setSelectedTile(index);
        return;
      }

      // Shift+click: range selection from last selected to current
      if (meta?.shiftKey && selectedTileIndices.length > 0) {
        const last = selectedTileIndices[selectedTileIndices.length - 1] ?? selectedTileIndex ?? 0;
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
    },
    [selectedTileIndices, selectedTileIndex, setSelectedTile, setSelectedTiles, toggleSelectedTile],
  );

  return {
    selectedTileIndex,
    selectedTileIndices,
    handleTileSelect,
  };
}
