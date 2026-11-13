import { useMemo } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useProject } from '../../../hooks/useProject';
import { computeMapNavigation, planRoute, type MapNavigation } from '../../../lib/navigationPath';
import { goalRuns, resolvePlace } from '../../../lib/routines';
import { timeLegs, walkMinutes } from '../../../lib/routineTiming';
import { DEFAULT_WALK_SPEED, type Map as GameMap, type Tileset } from '../../../types/schema';
import type { Routine, RoutineGoal, RoutinePlace } from '../../../types/routine';

type Point = [number, number];

export interface RoutineLeg {
  goalIndex: number;
  from: RoutinePlace;
  to: RoutinePlace;
  /** The walked route in tile units, or a straight stand-in when `found` is false; null without both anchors. */
  points: Point[] | null;
  found: boolean;
  /** In-game minutes of walking, or null when unknown (no route, another map, or no clock exported). */
  minutes: number | null;
  arriveMinute: number | null;
  problem?: string;
}

// Map documents are replaced on every edit, so a map object identifies one version of its navigation data.
const navigationCache = new WeakMap<
  GameMap,
  { tilesets: Map<string, Tileset>; tileSize: number; navigation: MapNavigation }
>();

function navigationFor(map: GameMap, tilesets: Map<string, Tileset>, tileSize: number) {
  const cached = navigationCache.get(map);
  if (cached && cached.tilesets === tilesets && cached.tileSize === tileSize)
    return cached.navigation;
  const navigation = computeMapNavigation(map, tilesets, tileSize);
  navigationCache.set(map, { tilesets, tileSize, navigation });
  return navigation;
}

/**
 * The day's legs (home to the first goal, then goal to goal) with their routes and walking times. Goals the day
 * preview skips are left out, as Unity's planner leaves them out.
 */
export function useRoutineLegs(
  routine: Routine,
  goals: readonly RoutineGoal[],
  preview: ReadonlySet<string> | null,
): RoutineLeg[] {
  const maps = useEditorStore((state) => state.maps);
  const currentMap = useEditorStore((state) => state.currentMap);
  const tilesets = useEditorStore((state) => state.tilesets);
  const speed = useEditorStore(
    (state) =>
      state.characters.find((character) => character.id === routine.character)?.walkSpeed ??
      DEFAULT_WALK_SPEED,
  );
  const clock = useScriptingManifestStore((state) => state.manifest?.clock);
  const { tileSize } = useProject();

  return useMemo(() => {
    // The map open in the map editor may be newer than the copy in the map list.
    const mapById = (id: string) =>
      currentMap?.id === id ? currentMap : maps.find((map) => map.id === id);
    const anchor = (place: RoutinePlace): Point | null =>
      mapById(place.map)?.spatialPrimitives?.anchors?.find((entry) => entry.id === place.anchor)
        ?.position ?? null;

    const legs: Omit<RoutineLeg, 'arriveMinute' | 'problem'>[] = [];
    let from = routine.home;
    goals.forEach((goal, goalIndex) => {
      if (preview && !goalRuns(goal, preview)) return;
      const to = resolvePlace(routine, goal.destination);
      const map = from.map === to.map ? mapById(to.map) : undefined;
      const start = map ? anchor(from) : null;
      const end = map ? anchor(to) : null;
      let points: Point[] | null = null;
      let found = false;
      if (map && start && end) {
        const route = planRoute(navigationFor(map, tilesets, tileSize), start, end, tileSize);
        found = route !== null;
        points = route ?? [
          [start[0] / tileSize, start[1] / tileSize],
          [end[0] / tileSize, end[1] / tileSize],
        ];
      }
      const minutes =
        found && points && clock
          ? walkMinutes(routeLength(points), speed, clock.secondsPerInGameMinute)
          : null;
      legs.push({ goalIndex, from, to, points, found, minutes });
      from = to;
    });

    const timings = timeLegs(
      legs.map((leg) => ({
        goalIndex: leg.goalIndex,
        goalId: goals[leg.goalIndex].id,
        departAt: goals[leg.goalIndex].departAt,
        minutes: leg.minutes,
      })),
      clock?.endOfDay ?? 24,
    );
    return legs.map((leg, i) => ({
      ...leg,
      ...timings[i],
      problem:
        timings[i].problem ??
        (leg.points && !leg.found
          ? 'No walkable route: check collisions around both anchors.'
          : undefined),
    }));
  }, [routine, goals, preview, maps, currentMap, tilesets, tileSize, speed, clock]);
}

function routeLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}
