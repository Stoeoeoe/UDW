/**
 * When an NPC arrives: walking minutes from route length, walk speed and the game clock, checked against the
 * next departure and the end of the day. Mirrors how Unity walks a routine (RoutineNpcService).
 */
import { minutesOf, timeOf, TIME_PATTERN } from './routines';

/** In-game minutes to walk a route: tiles / (tiles per second) gives real seconds, then the clock rate. */
export function walkMinutes(
  lengthTiles: number,
  tilesPerSecond: number,
  secondsPerInGameMinute: number,
): number {
  return lengthTiles / tilesPerSecond / secondsPerInGameMinute;
}

export interface TimedLeg {
  goalIndex: number;
  goalId: string;
  departAt: string;
  /** Walking time in in-game minutes, or null when it cannot be known (no route, another map, no clock). */
  minutes: number | null;
}

export interface LegTiming {
  goalIndex: number;
  /** Minute of the day the NPC arrives, or null when the walking time is unknown. */
  arriveMinute: number | null;
  /** Why the schedule does not work, if it does not. */
  problem?: string;
}

/**
 * Arrival times for legs in departure order, and the legs that cannot finish before the next one starts or
 * before the day ends (the NPC goes home overnight).
 */
export function timeLegs(legs: readonly TimedLeg[], endOfDayHour: number): LegTiming[] {
  return legs.map((leg, i) => {
    if (leg.minutes === null || !TIME_PATTERN.test(leg.departAt))
      return { goalIndex: leg.goalIndex, arriveMinute: null };
    const arriveMinute = minutesOf(leg.departAt) + leg.minutes;
    const next = legs[i + 1];
    const arrival = timeOf(Math.ceil(arriveMinute) % (24 * 60));
    let problem: string | undefined;
    if (next && TIME_PATTERN.test(next.departAt) && arriveMinute > minutesOf(next.departAt))
      problem = `Still walking until about ${arrival}, but ${next.goalId} leaves at ${next.departAt}.`;
    else if (arriveMinute > endOfDayHour * 60)
      problem = `Arrives about ${arrival}, after the day ends at ${timeOf(endOfDayHour * 60)}.`;
    return { goalIndex: leg.goalIndex, arriveMinute, problem };
  });
}

/** "4 min", "1 h 05 min", or "<1 min" for short walks. */
export function formatWalk(minutes: number): string {
  if (minutes < 1) return '<1 min';
  const rounded = Math.ceil(minutes);
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, '0')} min`;
}
