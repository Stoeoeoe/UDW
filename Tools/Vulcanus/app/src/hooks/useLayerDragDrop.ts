import { useState, useRef, useCallback } from 'react';
import { useEditorStore } from '../store/useEditorStore';

export interface DragDropState {
  draggedLayerId: string | null;
  dropTargetId: string | null;
}

/**
 * Custom hook for layer drag-and-drop reordering.
 * Extracts the DnD logic from LayersPanel for reusability.
 */
export function useLayerDragDrop() {
  const currentMap = useEditorStore((state) => state.currentMap);
  const updateLayer = useEditorStore((state) => state.updateLayer);

  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, layerId: string) => {
    setDraggedLayerId(layerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, layerId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (layerId !== draggedLayerId) {
        setDropTargetId(layerId);
      }
    },
    [draggedLayerId],
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetLayerId: string) => {
      e.preventDefault();
      setDropTargetId(null);

      if (!draggedLayerId || draggedLayerId === targetLayerId || !currentMap) {
        setDraggedLayerId(null);
        return;
      }

      // Layers are displayed in reverse order (highest zOrder first)
      const sortedLayers = [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder);
      const draggedIndex = sortedLayers.findIndex((l) => l.id === draggedLayerId);
      const targetIndex = sortedLayers.findIndex((l) => l.id === targetLayerId);

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedLayerId(null);
        return;
      }

      // Calculate new zOrder based on position
      let newZOrder: number;
      if (targetIndex === 0) {
        // Moving to the very bottom (lowest zOrder)
        newZOrder = sortedLayers[0].zOrder - 10;
      } else if (draggedIndex < targetIndex) {
        // Moving down in the list (dropping below target)
        const below = sortedLayers[targetIndex];
        const above = sortedLayers[targetIndex + 1];
        if (above) {
          newZOrder = Math.floor((below.zOrder + above.zOrder) / 2);
          if (newZOrder === below.zOrder) newZOrder = below.zOrder + 1;
        } else {
          newZOrder = below.zOrder + 10;
        }
      } else {
        // Moving up in the list (dropping above target)
        const above = sortedLayers[targetIndex];
        const below = sortedLayers[targetIndex - 1];
        if (below) {
          newZOrder = Math.floor((below.zOrder + above.zOrder) / 2);
          if (newZOrder === above.zOrder) newZOrder = above.zOrder - 1;
        } else {
          newZOrder = above.zOrder - 10;
        }
      }

      updateLayer(draggedLayerId, { zOrder: newZOrder });
      setDraggedLayerId(null);
    },
    [draggedLayerId, currentMap, updateLayer],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedLayerId(null);
    setDropTargetId(null);
  }, []);

  return {
    draggedLayerId,
    dropTargetId,
    dragNodeRef,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
