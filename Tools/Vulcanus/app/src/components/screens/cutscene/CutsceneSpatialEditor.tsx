import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, HStack, Select, Text } from '@chakra-ui/react';
import { MapPreviewPicker, type MapPreviewOverlay } from '../../common/MapPreviewPicker';
import { MapPositionField } from '../../common/MapPositionField';
import { NullableMapPositionField } from '../../common/NullableMapPositionField';
import {
  resolveMapPosition,
  type PositionArgument,
  type PlacementMode,
} from '../../../lib/mapPosition';
import type { Map as GameMap } from '../../../types/schema';
import type { CutsceneData } from '../../../types/cutscene';

export function CutsceneSpatialEditor({
  map,
  tileSize,
  title,
  value,
  path,
  nullable,
  start,
  onDone,
  onCancel,
}: {
  map: GameMap;
  tileSize: number;
  title: string;
  value: CutsceneData | undefined;
  path: boolean;
  nullable: boolean;
  start?: [number, number];
  onDone: (value: CutsceneData) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<(PositionArgument | '' | null)[]>(
    () =>
      structuredClone(path ? (Array.isArray(value) ? value : []) : [value]) as (
        | PositionArgument
        | ''
        | null
      )[],
  );
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState<number>();
  const [mode, setMode] = useState<PlacementMode>('pixel');
  const [fit, setFit] = useState(0);
  const panel = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; width: number }>();
  const [size, setSize] = useState({ width: 500, height: 400 });
  const anchors = map.spatialPrimitives?.anchors ?? [];
  const resolved = points.map((p) =>
    resolveMapPosition(p, anchors, map.width, map.height, tileSize),
  );
  const framePoints = () =>
    [...(start ? [start] : []), ...resolved.filter((p): p is [number, number] => p !== null)].map(
      (p) => [p[0] / tileSize, p[1] / tileSize] as [number, number],
    );
  const [focus, setFocus] = useState(framePoints); // Reframe on demand, not on every drag.
  const valid =
    points.length > 0 &&
    points.every((p, i) => (p === null ? !path && nullable : resolved[i] !== null));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    panel.current!.focus();
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCancel]);
  const replace = (index: number, point: PositionArgument | '' | null) =>
    setPoints((current) => current.map((p, i) => (i === index ? point : p)));
  const remove = () => {
    setPoints((current) => current.filter((_, i) => i !== selected));
    setSelected(Math.max(0, Math.min(selected, points.length - 2)));
  };
  const overlays: MapPreviewOverlay[] = [];
  let previous = start;
  resolved.forEach((point) => {
    if (point && previous)
      overlays.push({
        kind: 'segment',
        from: [previous[0] / tileSize, previous[1] / tileSize],
        to: [point[0] / tileSize, point[1] / tileSize],
        label: '',
      });
    previous = point ?? undefined;
  });
  if (start)
    overlays.push({
      kind: 'placement',
      position: [start[0] / tileSize, start[1] / tileSize],
      label: 'Start',
    });
  const PositionField = nullable && !path ? NullableMapPositionField : MapPositionField;
  return (
    <Box
      ref={panel}
      role="dialog"
      aria-label={`Edit ${title} on map`}
      aria-modal={false}
      tabIndex={-1}
      className={`cutscene-spatial-editor ${expanded ? 'expanded' : ''}`}
      style={!expanded && width ? { width } : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Delete' && !(e.target instanceof HTMLInputElement) && path) remove();
      }}
    >
      {!expanded && (
        <div
          role="separator"
          aria-label="Resize map editor"
          className="cutscene-spatial-resize"
          onPointerDown={(e) => {
            resize.current = { x: e.clientX, width: panel.current!.getBoundingClientRect().width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (resize.current)
              setWidth(
                Math.max(
                  420,
                  Math.min(
                    panel.current!.parentElement!.clientWidth - 24,
                    resize.current.width + resize.current.x - e.clientX,
                  ),
                ),
              );
          }}
          onPointerUp={(e) => {
            resize.current = undefined;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
      )}
      <HStack
        p={3}
        justify="space-between"
        borderBottomWidth="1px"
        borderColor="editorSequenceBorder"
      >
        <Box>
          <Text textStyle="fieldLabel">Edit on map</Text>
          <Text fontWeight="semibold">{title}</Text>
        </Box>
        <Button size="xs" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Restore' : 'Expand'}
        </Button>
        <Button size="xs" aria-label="Cancel map edit" onClick={onCancel}>
          ×
        </Button>
      </HStack>
      <HStack px={3} py={2} justify="space-between">
        <Text fontSize="xs">
          {path ? 'Click to add · drag points to move' : 'Click to place · drag to move'}
        </Text>
        <Select
          size="xs"
          w="100px"
          value={mode}
          onChange={(e) => setMode(e.target.value as PlacementMode)}
        >
          <option value="pixel">Map pixels</option>
          <option value="tile">Tile centers</option>
        </Select>
      </HStack>
      {path && !start && (
        <Text px={3} pb={2} fontSize="10px" color="editorMutedText">
          Starting position is unavailable in this preview; only the authored waypoints are shown.
        </Text>
      )}
      <Box ref={viewport} flex={1} minH="160px" overflow="hidden">
        <MapPreviewPicker
          mapId={map.id}
          width={size.width}
          height={Math.max(120, size.height - 34)}
          leftDragPan
          initialZoom={1}
          focusKey={`spatial-${fit}`}
          focusPositions={focus}
          overlays={overlays}
          positionPick={{
            mode,
            onHover: () => {},
            onPick: (point) => {
              if (path) {
                setPoints((current) => [...current, point]);
                setSelected(points.length);
              } else {
                setPoints([point]);
                setSelected(0);
              }
            },
          }}
          editablePoints={{
            points: resolved.flatMap((p, index) =>
              p
                ? [{ index, position: [p[0] / tileSize, p[1] / tileSize] as [number, number] }]
                : [],
            ),
            selected,
            onSelect: setSelected,
            onMove: (index, point) => replace(index, point),
          }}
        />
      </Box>
      <Box
        p={3}
        borderTopWidth="1px"
        borderColor="editorSequenceBorder"
        maxH="300px"
        overflow="auto"
      >
        <HStack justify="space-between">
          <Text fontSize="xs">{path ? `${points.length} waypoints` : 'Position'}</Text>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setFocus(framePoints());
              setFit((v) => v + 1);
            }}
          >
            Fit {path ? 'path' : 'position'}
          </Button>
        </HStack>
        {path && (
          <HStack my={2} flexWrap="wrap">
            {points.map((_, i) => (
              <Button
                key={i}
                size="xs"
                variant={selected === i ? 'solid' : 'outline'}
                onClick={() => setSelected(i)}
              >
                {i + 1}
              </Button>
            ))}
          </HStack>
        )}
        {points.length > 0 && (
          <PositionField
            value={points[selected]}
            modes={['pixel', 'tile', 'anchor']}
            anchors={anchors.map((a) => ({ id: a.id, label: a.name || a.id }))}
            isPicking={false}
            onChange={(point) => replace(selected, point)}
            onPick={(next) => setMode(next === 'anchor' ? 'pixel' : next)}
            onModeChange={(next) => setMode(next === 'anchor' ? 'pixel' : next)}
            onCancel={() => {}}
          />
        )}
        {path && (
          <HStack mt={2}>
            <Button size="xs" isDisabled={!points.length} onClick={remove}>
              Delete point
            </Button>
            <Button
              size="xs"
              isDisabled={selected === 0 || !points.length}
              onClick={() => {
                const copy = [...points];
                [copy[selected - 1], copy[selected]] = [copy[selected], copy[selected - 1]];
                setPoints(copy);
                setSelected(selected - 1);
              }}
            >
              Move earlier
            </Button>
          </HStack>
        )}
        {!valid && (
          <Text mt={2} color="editorDangerText" fontSize="xs">
            Choose {path ? 'at least one valid waypoint' : 'a valid position'} on this map before
            applying.
          </Text>
        )}
      </Box>
      <HStack p={3} borderTopWidth="1px" borderColor="editorSequenceBorder">
        <Text fontSize="10px" color="editorMutedText" flex={1}>
          Draft · node changes only on Done
        </Text>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          colorScheme="blue"
          isDisabled={!valid}
          onClick={() => onDone((path ? points : points[0]) as CutsceneData)}
        >
          Done
        </Button>
      </HStack>
    </Box>
  );
}
