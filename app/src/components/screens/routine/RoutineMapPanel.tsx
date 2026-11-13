import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import { MapPreviewPicker, type MapPreviewOverlay } from '../../common/MapPreviewPicker';
import { CompactInput, CompactSelect } from '../../common/Fields';
import { useEditorStore } from '../../../store/useEditorStore';
import { useProject } from '../../../hooks/useProject';
import { dayAt, resolvePlace, unusedId, type RoutineDayRef } from '../../../lib/routines';
import { formatWalk } from '../../../lib/routineTiming';
import type { RoutineLeg } from './useRoutineLegs';
import { setDayGoals } from '../../../lib/routineEditing';
import { LOCAL_ID_PATTERN } from '../../../lib/resourceIds';
import type { Map as GameMap } from '../../../types/schema';
import type { Routine, RoutinePlace } from '../../../types/routine';
import type { PlaceTarget } from './RoutineEditor';

type Point = [number, number];

/** A click this close to an anchor (in tiles) picks that anchor instead of creating a new one. */
const ANCHOR_PICK_RADIUS = 0.75;

const HOME_COLOR = 'var(--chakra-colors-green-300)';
const ROUTE_COLOR = 'var(--chakra-colors-cyan-300)';
const MISSING_COLOR = 'var(--chakra-colors-red-300)';
const ANCHOR_COLOR = 'var(--chakra-colors-gray-400)';

/**
 * The map of the selected goal (or home) with every leg of the day that stays on it, drawn as the route Unity's
 * pathfinder would walk. Picking a place assigns a nearby anchor or creates one where you click.
 */
export const RoutineMapPanel: React.FC<{
  routine: Routine;
  dayRef: RoutineDayRef;
  selectedGoal: number | null;
  onSelectGoal: (index: number | null) => void;
  picking: PlaceTarget | null;
  onPicked: () => void;
  onCancelPick: () => void;
  onChange: (routine: Routine) => void;
  legs: RoutineLeg[];
}> = ({ routine, dayRef, selectedGoal, picking, onPicked, onCancelPick, onChange, legs }) => {
  const maps = useEditorStore((state) => state.maps);
  const currentMap = useEditorStore((state) => state.currentMap);
  const addMapAnchor = useEditorStore((state) => state.addMapAnchor);
  const { tileSize } = useProject();
  const goals = useMemo(() => dayAt(routine, dayRef)?.goals ?? [], [routine, dayRef]);

  // The open map in the map editor may be newer than the copy in the map list.
  const mapById = (id: string): GameMap | undefined =>
    currentMap?.id === id ? currentMap : maps.find((map) => map.id === id);

  const focusPlace =
    selectedGoal !== null && goals[selectedGoal]
      ? resolvePlace(routine, goals[selectedGoal].destination)
      : routine.home;
  const [viewMapId, setViewMapId] = useState(focusPlace.map);
  useEffect(() => {
    if (focusPlace.map) setViewMapId(focusPlace.map);
  }, [focusPlace.map, selectedGoal]);
  const map = mapById(viewMapId);

  // Legs that stay on the shown map; the others are described in words.
  const routes = legs.filter((leg) => leg.points && leg.to.map === viewMapId);
  const toTiles = ([x, y]: Point): Point => [x / tileSize, y / tileSize];

  const overlays: MapPreviewOverlay[] = [];
  for (const anchor of map?.spatialPrimitives?.anchors ?? []) {
    const isHome = routine.home.map === viewMapId && routine.home.anchor === anchor.id;
    overlays.push({
      kind: 'marker',
      position: toTiles(anchor.position),
      label: isHome ? `⌂ ${anchor.id}` : anchor.id,
      color: isHome ? HOME_COLOR : ANCHOR_COLOR,
      emphasis: isHome,
    });
  }
  for (const route of routes) {
    const selected = selectedGoal === route.goalIndex;
    overlays.push({
      kind: 'route',
      points: route.points!,
      color: route.found && !route.problem ? ROUTE_COLOR : MISSING_COLOR,
      dashed: !route.found,
      opacity: selectedGoal === null || selected ? 1 : 0.35,
    });
    const end = route.points![route.points!.length - 1];
    overlays.push({
      kind: 'waypoint',
      position: [end[0], end[1] - 0.9],
      label: String(route.goalIndex + 1),
    });
  }

  const selectedLegInfo = (() => {
    if (selectedGoal === null) return null;
    const leg = legs.find((entry) => entry.goalIndex === selectedGoal);
    if (!leg) return 'This goal is skipped in the previewed day.';
    if (leg.from.map !== leg.to.map)
      return `Goes from ${leg.from.map} to ${leg.to.map}; travel between maps is not drawn.`;
    if (leg.to.map !== viewMapId) return null;
    if (!leg.points) return 'The start or destination anchor is missing on this map.';
    if (!leg.found)
      return 'No walkable route: the dashed line is only a straight stand-in. Check collisions around both anchors.';
    const length = `Route of ${Math.round(routeLength(leg.points))} tiles`;
    return leg.minutes === null
      ? `${length}. Walking time needs the game clock from Unity's bindings.`
      : `${length}, ${formatWalk(leg.minutes)} on foot.`;
  })();

  // ─── Picking ────────────────────────────────────────────────────────────────
  const [pending, setPending] = useState<{ mapId: string; position: Point; id: string } | null>(
    null,
  );
  useEffect(() => setPending(null), [picking]);

  const assign = (place: RoutinePlace) => {
    if (!picking) return;
    if (picking.kind === 'home') onChange({ ...routine, home: place });
    else
      onChange(
        setDayGoals(
          routine,
          dayRef,
          goals.map((goal, i) =>
            i === picking.goalIndex ? { ...goal, destination: place } : goal,
          ),
        ),
      );
    onPicked();
  };

  const suggestedAnchorId = () => {
    const character = routine.character.split(':').pop() ?? 'npc';
    const goal = picking?.kind === 'goal' ? goals[picking.goalIndex]?.id : 'home';
    const used = new Set((map?.spatialPrimitives?.anchors ?? []).map((anchor) => anchor.id));
    return unusedId(
      used,
      `${character}-${goal ?? 'spot'}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '-'),
    );
  };

  const onPick = ({ x, y }: { x: number; y: number }) => {
    if (!map) return;
    const near = (map.spatialPrimitives?.anchors ?? [])
      .map((anchor) => ({
        anchor,
        distance: Math.hypot(anchor.position[0] - x, anchor.position[1] - y) / tileSize,
      }))
      .filter((entry) => entry.distance <= ANCHOR_PICK_RADIUS)
      .sort((a, b) => a.distance - b.distance)[0];
    if (near) assign({ map: map.id, anchor: near.anchor.id });
    else setPending({ mapId: map.id, position: [x, y], id: suggestedAnchorId() });
  };

  const [createError, setCreateError] = useState<string | null>(null);
  const createAnchor = () => {
    if (!pending) return;
    try {
      addMapAnchor(pending.mapId, {
        id: pending.id,
        name: pending.id,
        position: pending.position,
        tags: [],
      });
      assign({ map: pending.mapId, anchor: pending.id });
      setPending(null);
      setCreateError(null);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    }
  };

  // ─── Layout ─────────────────────────────────────────────────────────────────
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 300 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      }),
    );
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);

  const focus: Point[] = routes
    .filter((route) => selectedGoal === null || route.goalIndex === selectedGoal)
    .flatMap((route) => route.points ?? []);

  return (
    <VStack align="stretch" spacing={2} h="full" minH={0} p={3}>
      <HStack spacing={2}>
        <CompactSelect
          aria-label="Shown map"
          value={viewMapId}
          onChange={(event) => setViewMapId(event.target.value)}
          maxW="220px"
        >
          {!map && <option value={viewMapId}>{viewMapId || 'No map'}</option>}
          {maps.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </CompactSelect>
        <Text fontSize="xs" color="editorMutedText" noOfLines={2}>
          {selectedLegInfo}
        </Text>
      </HStack>
      {picking && (
        <HStack spacing={2} px={2} py={1.5} bg="cyan.900" borderRadius="md">
          {pending ? (
            <>
              <Text fontSize="xs" flexShrink={0}>
                New anchor
              </Text>
              <CompactInput
                autoFocus
                value={pending.id}
                isInvalid={!LOCAL_ID_PATTERN.test(pending.id)}
                onChange={(event) => setPending({ ...pending, id: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && LOCAL_ID_PATTERN.test(pending.id)) createAnchor();
                }}
              />
              <Button
                size="xs"
                colorScheme="cyan"
                isDisabled={!LOCAL_ID_PATTERN.test(pending.id)}
                onClick={createAnchor}
              >
                Create and use
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setPending(null)}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Text fontSize="xs" flex={1}>
                Click an anchor to use it, or an empty spot to create one there.
              </Text>
              <Button size="xs" variant="ghost" onClick={onCancelPick}>
                Cancel
              </Button>
            </>
          )}
        </HStack>
      )}
      {createError && (
        <Text fontSize="xs" color="editorDangerText">
          {createError}
        </Text>
      )}
      <Box ref={viewport} flex={1} minH={0}>
        {map ? (
          <MapPreviewPicker
            mapId={map.id}
            width={size.width}
            height={Math.max(120, size.height - 24)}
            interactive={false}
            leftDragPan={!picking}
            initialZoom={1}
            overlays={overlays}
            focusPositions={focus}
            focusKey={`${viewMapId}:${selectedGoal}`}
            positionPick={picking ? { mode: 'tile', onPick, onHover: () => undefined } : undefined}
          />
        ) : (
          <Text fontSize="xs" color="editorMutedText">
            Choose a map to show.
          </Text>
        )}
      </Box>
    </VStack>
  );
};

function routeLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}
