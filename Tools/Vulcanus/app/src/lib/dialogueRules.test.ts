import { describe, expect, it } from 'vitest';
import {
  compileRules,
  knownOccupations,
  ruleCondition,
  rulesOf,
  standingOptions,
} from './dialogueRules';
import type { Routine } from '../types/routine';

const fabia = 'base:fabia';

describe('dialogue rules', () => {
  it('turn a standing band into bounds on the standing', () => {
    expect(ruleCondition(fabia, { dialogue: 'd', standing: 'wary' })).toBe(
      "SocialStanding.HasMoreThan('base:fabia', 19) and SocialStanding.HasLessThan('base:fabia', 40)",
    );
    expect(ruleCondition(fabia, { dialogue: 'd', standing: 'friendly+' })).toBe(
      "SocialStanding.HasMoreThan('base:fabia', 59)",
    );
    expect(ruleCondition(fabia, { dialogue: 'd', standing: 'wary-' })).toBe(
      "SocialStanding.HasLessThan('base:fabia', 40)",
    );
    expect(ruleCondition(fabia, { dialogue: 'd', standing: 'hostile' })).toBe(
      "SocialStanding.HasLessThan('base:fabia', 20)",
    );
    expect(ruleCondition(fabia, { dialogue: 'd', standing: 'devoted' })).toBe(
      "SocialStanding.HasMoreThan('base:fabia', 79)",
    );
  });

  it('offers each band, or better and or worse, without impossible ones', () => {
    const values = standingOptions().map((option) => option.value);
    expect(values).toContain('neutral');
    expect(values).toContain('hostile+');
    expect(values).not.toContain('devoted+');
    expect(values).toContain('devoted-');
    expect(values).not.toContain('hostile-');
  });

  it('combine every column and the extra Lua with and', () => {
    expect(
      ruleCondition(fabia, {
        dialogue: 'd',
        standing: 'friendly+',
        occupation: 'fishing',
        weather: 'Sunny',
        condition: 'Time.IsNight() or Time.IsDawn()',
      }),
    ).toBe(
      "SocialStanding.HasMoreThan('base:fabia', 59) and Routines.HasOccupation('base:fabia', 'fishing') and Weather.Is('Sunny') and (Time.IsNight() or Time.IsDawn())",
    );
  });

  it('ask nothing when every column is any', () => {
    expect(ruleCondition(fabia, { dialogue: 'd' })).toBeUndefined();
    expect(ruleCondition(fabia, { dialogue: 'd', condition: '  ' })).toBeUndefined();
  });

  it('compile in row order, leaving the condition out of an unconditional row', () => {
    expect(compileRules(fabia, [{ dialogue: 'a', weather: 'Sunny' }, { dialogue: 'b' }])).toEqual([
      { dialogue: 'a', condition: "Weather.Is('Sunny')" },
      { dialogue: 'b' },
    ]);
  });

  it('edit plain dialogues as Lua-only rules when no rules were authored', () => {
    expect(
      rulesOf({ id: fabia, name: 'Fabia', dialogues: [{ dialogue: 'a', condition: 'true' }] }),
    ).toEqual([{ dialogue: 'a', condition: 'true' }]);
    expect(rulesOf({ id: fabia, name: 'Fabia', dialogueRules: [{ dialogue: 'b' }] })).toEqual([
      { dialogue: 'b' },
    ]);
  });

  it('lists the occupations routines set, once each', () => {
    const goal = (id: string, occupation?: string) => ({
      id,
      departAt: '08:00',
      destination: 'home' as const,
      occupation,
    });
    const routine = {
      variants: [
        { id: 'a', goals: [goal('x', 'fishing'), goal('y')] },
        { id: 'b', pickOne: [{ id: 'c', goals: [goal('z', 'fishing'), goal('w', 'baking')] }] },
      ],
    } as unknown as Routine;
    expect(knownOccupations([routine])).toEqual(['baking', 'fishing']);
  });
});
