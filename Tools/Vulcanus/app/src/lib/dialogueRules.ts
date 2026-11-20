import { SOCIAL_STANDING_BANDS } from './socialStandingBands';
import type { Character, CharacterDialogue, DialogueRule } from '../types/schema';
import type { Routine } from '../types/routine';

/** What a rule asks of social standing: a band, that band or better (`friendly+`) or that band or worse (`wary-`). */
export function standingOptions(): { value: string; label: string }[] {
  return [
    ...SOCIAL_STANDING_BANDS.map((band) => ({ value: band.id, label: band.name })),
    ...SOCIAL_STANDING_BANDS.slice(0, -1).map((band) => ({
      value: `${band.id}+`,
      label: `${band.name} or better`,
    })),
    ...SOCIAL_STANDING_BANDS.slice(1).map((band) => ({
      value: `${band.id}-`,
      label: `${band.name} or worse`,
    })),
  ];
}

function standingRange(standing: string): { from: number; to: number } {
  const id = standing.replace(/[+-]$/, '');
  const band = SOCIAL_STANDING_BANDS.find((b) => b.id === id);
  if (!band) throw new Error(`Unknown standing band '${standing}'.`);
  if (standing.endsWith('+')) return { from: band.from, to: 100 };
  if (standing.endsWith('-')) return { from: 0, to: band.to };
  return { from: band.from, to: band.to };
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The read-only Lua condition a rule stands for; undefined when it asks nothing. */
export function ruleCondition(characterId: string, rule: DialogueRule): string | undefined {
  const parts: string[] = [];
  if (rule.standing) {
    const { from, to } = standingRange(rule.standing);
    if (from > 0) parts.push(`SocialStanding.HasMoreThan(${quote(characterId)}, ${from - 1})`);
    if (to < 100) parts.push(`SocialStanding.HasLessThan(${quote(characterId)}, ${to + 1})`);
  }
  if (rule.occupation)
    parts.push(`Routines.HasOccupation(${quote(characterId)}, ${quote(rule.occupation)})`);
  if (rule.weather) parts.push(`Weather.Is(${quote(rule.weather)})`);
  const extra = rule.condition?.trim();
  if (extra) parts.push(parts.length ? `(${extra})` : extra);
  return parts.length ? parts.join(' and ') : undefined;
}

/** The `dialogues` Unity reads: the rules in order, each with its compiled condition. */
export function compileRules(
  characterId: string,
  rules: readonly DialogueRule[],
): CharacterDialogue[] {
  return rules.map((rule) => {
    const condition = ruleCondition(characterId, rule);
    return condition ? { dialogue: rule.dialogue, condition } : { dialogue: rule.dialogue };
  });
}

/** The rules to edit: those the character was authored with, otherwise its plain dialogues as Lua-only rules. */
export function rulesOf(character: Character): DialogueRule[] {
  return (
    character.dialogueRules ??
    (character.dialogues ?? []).map(({ dialogue, condition }) => ({ dialogue, condition }))
  );
}

/** Every occupation some routine goal sets, for choosing from. */
export function knownOccupations(routines: readonly Routine[]): string[] {
  const found = new Set<string>();
  for (const routine of routines)
    for (const entry of [...(routine.overrides ?? []), ...routine.variants])
      for (const day of [entry, ...(entry.pickOne ?? [])])
        for (const goal of day.goals ?? []) if (goal.occupation) found.add(goal.occupation);
  return [...found].sort();
}
