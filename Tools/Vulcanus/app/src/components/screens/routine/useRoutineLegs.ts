import { useMemo } from 'react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useProject } from '../../../hooks/useProject';
import { computeMapNavigation, type MapNavigation } from '../../../lib/navigationPath';
import { indexObjects, type ObjectIndex } from '../../../lib/mapObjects';
import { planWorldRoute, routeLength, type WorldLeg } from '../../../lib/worldGraph';
import { goalRuns, mapEntities, resolvePlace } from '../../../lib/routines';
import { timeLegs, walkMinutes } from '../../../lib/routineTiming';
import {
  DEFAULT_WALK_SPEED,
  type LocationLink,
  type Map as GameMap,
  type Tileset,
} from '../../../types/schema';
import type { Routine, RoutineGoal, RoutinePlace } from '../../../types/routine';

type Point = [number, number];

/** The part of a walk on one map, in tile units. */
export interface LegPart {
  mapId: string;
  points: Point[];
  /** The link this part ends at, to go on on another map. */
  leaves?: LocationLink;
}

export interface RoutineLeg {
  goalIndex: number;
  from: RoutinePlace;
  to: RoutinePlace;
  /**
   * The walk, one part per map. Without a walkable route on one map it is a single straight stand-in (`found` false);
   * empty without both anchors, or when no walkable chain of links leads to another map.
   */
  parts: LegPart[];
  found: boolean;
  /** In-game minutes of walking, or null when unknown (no route or no clock exported). */
  minutes: number | null;
  arriveMinute: number | null;
  problem?: string;
}

// Map documents are replaced on every edit, so a map object identifies one version of its navigation data.
const navigationCache = new WeakMap<
  GameMap,
  {
    tilesets: Map<string, Tileset>;
    objects: ObjectIndex;
    tileSize: number;
    navigation: MapNavigation;
  }
>();

function navigationFor(
  map: GameMap,
  tilesets: Map<string, Tileset>,
  objects: ObjectIndex,
  tileSize: number,
) {
  const cached = navigationCache.get(map);
  if (
    cached &&
    cached.tilesets === tilesets &&
    cached.objects === objects &&
    cached.tileSize === tileSize
  )
    return cached.navigation;
  const navigation = computeMapNavigation(map, tilesets, objects, tileSize);
  navigationCache.set(map, { tilesets, objects, tileSize, navigation });
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
  const objects = useEditorStore((state) => state.objects);
  const speed = useEditorStore(
    (state) =>
      state.characters.find((character) => character.id === routine.character)?.walkSpeed ??
      DEFAULT_WALK_SPEED,
  );
  const clock = useScriptingManifestStore((state) => state.manifest?.clock);
  const { tileSize } = useProject();

  return useMemo(() => {
    // The map open in the map editor may be newer than the copy in the map list.
    const allMaps = maps.map((map) => (currentMap?.id === map.id ? currentMap : map));
    if (currentMap && !maps.some((map) => map.id === currentMap.id)) allMaps.push(currentMap);
    const mapById = (id: string) => allMaps.find((map) => map.id === id);
    // An entity is drawn where it stands; the character really stands at its slot, so this is only close.
    const anchor = (place: RoutinePlace): Point | null => {
      const map = mapById(place.map);
      if (!map) return null;
      return place.entity
        ? (mapEntities(map).find((entity) => entity.id === place.entity)?.position ?? null)
        : (map.spatialPrimitives?.anchors?.find((entry) => entry.id === place.anchor)?.position ??
            null);
    };

    const legs: Omit<RoutineLeg, 'arriveMinute' | 'problem'>[] = [];
    let from = routine.home;
    goals.forEach((goal, goalIndex) => {
      if (preview && !goalRuns(goal, preview)) return;
      const to = resolvePlace(routine, goal.destination);
      const start = anchor(from);
      const end = anchor(to);
      let parts: LegPart[] = [];
      let found = false;
      if (start && end) {
        const route: WorldLeg[] | null = planWorldRoute(
          allMaps,
          (map) => navigationFor(map, tilesets, indexObjects(objects), tileSize),
          { mapId: from.map, position: start },
          { mapId: to.map, position: end },
          tileSize,
        );
        found = route !== null;
        if (route) parts = route.map(({ mapId, points, leaves }) => ({ mapId, points, leaves }));
        else if (from.map === to.map)
          parts = [
            {
              mapId: to.map,
              points: [
                [start[0] / tileSize, start[1] / tileSize],
                [end[0] / tileSize, end[1] / tileSize],
              ],
            },
          ];
      }
      const minutes =
        found && clock
          ? walkMinutes(
              parts.reduce((sum, part) => sum + routeLength(part.points), 0),
              speed,
              clock.secondsPerInGameMinute,
            )
          : null;
      legs.push({ goalIndex, from, to, parts, found, minutes });
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
        (anchor(leg.from) && anchor(leg.to) && !leg.found && !leg.from.entity && !leg.to.entity
          ? leg.from.map === leg.to.map
            ? 'No walkable route: check collisions around both anchors.'
            : `No walkable route to ${leg.to.map}: check the doors on the way and the collisions around them.`
          : undefined),
    }));
  }, [routine, goals, preview, maps, currentMap, tilesets, objects, tileSize, speed, clock]);
}

/** The doors a walk goes through, as "via "To House" to base:indoor"; null for a walk on one map. */
export function describeDoors(leg: RoutineLeg): string | null {
  const doors = leg.parts.flatMap((part) =>
    part.leaves ? [`"${part.leaves.label || part.leaves.id}" to ${part.leaves.targetMapId}`] : [],
  );
  return doors.length ? `via ${doors.join(', then ')}` : null;
}

/** Length of the whole walk in tiles. */
export function legLength(leg: RoutineLeg): number {
  return leg.parts.reduce((sum, part) => sum + routeLength(part.points), 0);
}
