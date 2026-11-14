import { describe, expect, it } from 'vitest';
import { formatWalk, timeLegs, walkMinutes } from './routineTiming';

describe('routine timing', () => {
  it('turns tiles into in-game minutes through walk speed and the clock rate', () => {
    // 40 tiles at 4 tiles/s is 10 real seconds; at 5 real seconds per in-game minute that is 2 minutes.
    expect(walkMinutes(40, 4, 5)).toBe(2);
  });

  it('flags a walk that runs past the next departure or the end of the day', () => {
    const legs = [
      { goalIndex: 0, goalId: 'visit', departAt: '06:10', minutes: 55 },
      { goalIndex: 1, goalId: 'back_home', departAt: '07:00', minutes: 3 },
      { goalIndex: 2, goalId: 'late', departAt: '22:58', minutes: 5 },
      { goalIndex: 3, goalId: 'unknown', departAt: '23:30', minutes: null },
    ];
    expect(timeLegs(legs, 23)).toEqual([
      {
        goalIndex: 0,
        arriveMinute: 6 * 60 + 65,
        problem: 'Still walking until about 07:05, but back_home leaves at 07:00.',
      },
      // Still walking at 07:00, she sets off home on arrival at 07:05.
      { goalIndex: 1, arriveMinute: 7 * 60 + 8, problem: undefined },
      {
        goalIndex: 2,
        arriveMinute: 23 * 60 + 3,
        problem: 'Arrives about 23:03, after the day ends at 23:00.',
      },
      { goalIndex: 3, arriveMinute: null },
    ]);
  });

  it('formats walking time for people', () => {
    expect(formatWalk(0.3)).toBe('<1 min');
    expect(formatWalk(4.2)).toBe('5 min');
    expect(formatWalk(65)).toBe('1 h 05 min');
  });
});
