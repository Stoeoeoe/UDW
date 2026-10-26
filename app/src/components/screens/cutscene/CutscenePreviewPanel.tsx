import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, HStack, Text, VStack } from '@chakra-ui/react';
import {
  MapPreviewPicker,
  type MapPreviewOverlay,
  type MapPositionPick,
} from '../../common/MapPreviewPicker';
import { SequenceToolbar } from '../../common/SequenceEditor';
import type { CutscenePreview } from '../../../lib/cutscenePreview';

export const CutscenePreviewPanel: React.FC<{
  mapId?: string;
  mapName?: string;
  caption: string;
  focusKey: string;
  tileSize: number;
  overlays: MapPreviewOverlay[];
  preview: CutscenePreview | null;
  stepNumbers: Record<string, number | string>;
  selectedStepId?: string;
  dialogueNames: Record<string, string>;
  positionPick?: MapPositionPick & { label: string; onCancel: () => void };
}> = ({
  mapId,
  mapName,
  caption,
  focusKey,
  tileSize,
  overlays,
  preview,
  stepNumbers,
  selectedStepId,
  dialogueNames,
  positionPick,
}) => {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 480, height: 320 });
  const [showMovementHistory, setShowMovementHistory] = useState(false);
  useEffect(() => {
    if (!viewport.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const selectedSegments = preview?.segments.filter((s) => s.stepId === selectedStepId) ?? [];
  const selectedPlacements = preview?.placements.filter((p) => p.stepId === selectedStepId) ?? [];
  const selectedFacings = preview?.facings.filter((f) => f.stepId === selectedStepId) ?? [];
  const characterName = (id: string) =>
    preview?.characters.find((a) => a.id === id)?.label || id || 'Not set';
  const visibleOverlays = overlays
    .filter(
      (o) =>
        !selectedFacings.length ||
        showMovementHistory ||
        (o.kind !== 'segment' && o.kind !== 'waypoint' && !(o.kind === 'character' && o.ghost)) ||
        (o.kind === 'segment' && o.dashed && o.opacity === 1),
    )
    .map((o) => {
      if (o.kind !== 'character' || o.ghost) return o;
      const facing = selectedFacings.find(
        (f) => f.characterId === o.characterId || f.targetId === o.characterId,
      );
      return facing
        ? {
            ...o,
            label: `${o.label} (${facing.characterId === o.characterId ? 'turning' : 'target'})`,
          }
        : o;
    });
  const focusPositions: [number, number][] =
    selectedSegments.length || selectedPlacements.length
      ? [
          ...selectedSegments.flatMap((s) => [s.from, s.to]),
          ...selectedPlacements.map((p) => p.position),
        ].map((p) => [p[0] / tileSize, p[1] / tileSize])
      : overlays
          .filter(
            (o): o is Extract<MapPreviewOverlay, { kind: 'character' }> =>
              o.kind === 'character' && !o.ghost,
          )
          .map((o) => o.position);
  const selectedNotices =
    preview?.notices.filter((n) => !n.stepId || n.stepId === selectedStepId) ?? [];
  const earlierNotices =
    preview?.notices.filter((n) => n.stepId && n.stepId !== selectedStepId) ?? [];
  return (
    <VStack h="full" minH={0} align="stretch" spacing={0} bg="editorWorkspaceBg">
      <SequenceToolbar justify="space-between" flexWrap="wrap">
        <Text fontSize="xs" fontWeight="semibold">
          {caption}
        </Text>
        <Text textStyle="helperText" noOfLines={1}>
          {mapName}
        </Text>
      </SequenceToolbar>
      {positionPick && (
        <HStack px={3} py={2} bg="editorSectionBg" justify="space-between">
          <Text fontSize="xs">
            Place {positionPick.label} ·{' '}
            {positionPick.mode === 'tile' ? 'Tile centers' : 'Map pixels'}. Click to confirm; Escape
            cancels.
          </Text>
          <Button size="xs" variant="outline" onClick={positionPick.onCancel}>
            Cancel placement
          </Button>
        </HStack>
      )}
      {(selectedFacings.length > 0 || selectedNotices.length > 0) && (
        <VStack
          align="stretch"
          spacing={1}
          px={3}
          py={2}
          bg="editorSectionBg"
          borderBottom="1px"
          borderColor="editorShellBorder"
          role="status"
          aria-live="polite"
        >
          {selectedFacings.map((f, i) => (
            <Text key={i} fontSize="sm" fontWeight="semibold">
              {characterName(f.characterId)} faces {characterName(f.targetId)}
            </Text>
          ))}
          {selectedNotices.map((n, i) => (
            <Text key={i} fontSize="xs" color="editorMutedText">
              {n.message}
            </Text>
          ))}
          {selectedFacings.length > 0 &&
            (preview?.segments.some((s) => s.kind === 'move') ?? false) && (
              <Checkbox
                size="sm"
                isChecked={showMovementHistory}
                onChange={(e) => setShowMovementHistory(e.target.checked)}
              >
                Show movement history
              </Checkbox>
            )}
        </VStack>
      )}
      <Box ref={viewport} flex={1} minH={0} minW={0} overflow="hidden" p={0}>
        {mapId ? (
          <MapPreviewPicker
            mapId={mapId}
            interactive={false}
            overlays={visibleOverlays}
            width={size.width}
            height={Math.max(80, size.height - 30)}
            wheelZoom
            leftDragPan
            initialZoom={1}
            focusPositions={focusPositions}
            focusKey={focusKey}
            positionPick={positionPick}
          />
        ) : (
          <Text p={3} textStyle="helperText">
            Choose a map in Scene settings.
          </Text>
        )}
      </Box>
      <VStack
        align="stretch"
        spacing={1}
        px={3}
        py={2}
        borderTop="1px"
        borderColor="editorShellBorder"
        maxH="28%"
        overflowY="auto"
        role="status"
        aria-live="polite"
      >
        {preview?.cues
          .filter((c) => c.stepId === selectedStepId)
          .map((c, i) => (
            <Text key={i} fontSize="xs">
              Dialogue: {dialogueNames[c.dialogueId] || c.dialogueId}
            </Text>
          ))}
        <HStack justify="space-between" align="start" spacing={3}>
          <Box as="details">
            <Box as="summary" textStyle="helperText" cursor="pointer">
              Preview guide
            </Box>
            <Text textStyle="helperText" mt={1}>
              Solid arrows: movement. Dashed arrows: facing. Hollow markers: previous positions.
              Schematic displacement, not a navigation path.
            </Text>
          </Box>
          {earlierNotices.length > 0 && (
            <Box as="details">
              <Box as="summary" textStyle="helperText" cursor="pointer">
                {earlierNotices.length} earlier preview notes
              </Box>
              {earlierNotices.map((n, i) => (
                <Text key={i} textStyle="helperText">
                  Step {stepNumbers[n.stepId!]}: {n.message}
                </Text>
              ))}
            </Box>
          )}
        </HStack>
      </VStack>
    </VStack>
  );
};
