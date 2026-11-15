import { z } from 'zod';
import type { Quest, QuestI18n } from '../types/quest';
import type { Map as GameMap } from '../types/schema';
import { LOCAL_ID_PATTERN, RESOURCE_ID_PATTERN } from './resourceIds';
import { validateLuaChunk } from './luaRunner';
import { bindingDiagnostics, CONDITION_SCOPE, SCRIPT_SCOPE } from './luaBindings';
import type { ScriptingManifest } from './scriptingManifest';

const text = z.string().regex(/\S/);
const local = z.string().regex(LOCAL_ID_PATTERN);
const resource = z.string().regex(RESOURCE_ID_PATTERN);
const base = { id: local, text };
const objective = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('talk'),
    character: resource,
    dialogue: resource.optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('deliver'),
    character: resource,
    item: resource,
    count: z.number().int().min(1),
    dialogue: resource.optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('have'),
    item: resource,
    count: z.number().int().min(1),
  }),
  z.strictObject({ ...base, kind: z.literal('reach'), map: resource, trigger: text.optional() }),
  z.strictObject({ ...base, kind: z.literal('condition'), condition: text }),
]);
export const questSchema = z.strictObject({
  $schema: z.string().optional(),
  formatVersion: z.literal(1),
  id: resource,
  title: text,
  description: text,
  giver: resource.optional(),
  folderPath: z.string().optional(),
  onStart: text.optional(),
  onComplete: text.optional(),
  onFail: text.optional(),
  steps: z
    .array(
      z.strictObject({
        id: local,
        journal: text,
        objectives: z.array(objective).min(1),
        deadline: z
          .strictObject({
            days: z.number().int().min(0),
            at: z
              .string()
              .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
              .optional(),
          })
          .optional(),
        failWhen: text.optional(),
        onComplete: text.optional(),
      }),
    )
    .min(1),
});
export interface QuestReferences {
  characterIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
  dialogueIds: ReadonlySet<string>;
  maps: readonly GameMap[];
}

/** Import shape, Lua parsing and the catalog references Unity checks. Never executes authored Lua. */
export function validateQuest(
  quest: Quest,
  references?: QuestReferences,
  manifest: ScriptingManifest | null = null,
): string[] {
  const parsed = questSchema.safeParse(quest);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  const unique = (ids: string[], where: string) => {
    const seen = new Set<string>();
    ids.forEach((id) => {
      if (seen.has(id)) errors.push(`${where}: duplicate ID ${id}.`);
      seen.add(id);
    });
  };
  const lua = (code: string | undefined, where: string, condition = false) => {
    if (code === undefined) return;
    const result = validateLuaChunk(condition ? `return (\n${code}\n)` : code);
    if (!result.ok) errors.push(`${where}: ${result.error}`);
    errors.push(
      ...bindingDiagnostics(code, manifest, condition ? CONDITION_SCOPE : SCRIPT_SCOPE).map(
        (issue) => `${where}: ${issue.message}`,
      ),
    );
  };
  const known = (
    id: string | undefined,
    ids: ReadonlySet<string> | undefined,
    kind: string,
    where: string,
  ) => {
    if (id && ids && !ids.has(id)) errors.push(`${where}: unknown ${kind} ${id}.`);
  };
  known(quest.giver, references?.characterIds, 'character', 'Giver');
  for (const field of ['onStart', 'onComplete', 'onFail'] as const) lua(quest[field], field);
  unique(
    quest.steps.map((step) => step.id),
    'Steps',
  );
  quest.steps.forEach((step) => {
    unique(
      step.objectives.map((o) => o.id),
      step.id,
    );
    lua(step.failWhen, `${step.id} fail condition`, true);
    lua(step.onComplete, `${step.id} onComplete`);
    step.objectives.forEach((o) => {
      const where = `${step.id}.${o.id}`;
      if ('character' in o) known(o.character, references?.characterIds, 'character', where);
      if ('item' in o) known(o.item, references?.itemIds, 'item', where);
      if ('dialogue' in o) known(o.dialogue, references?.dialogueIds, 'dialogue', where);
      if (o.kind === 'condition') lua(o.condition, where, true);
      if (o.kind === 'reach' && references) {
        const map = references.maps.find((map) => map.id.toLowerCase() === o.map.toLowerCase());
        if (!map) errors.push(`${where}: unknown map ${o.map}.`);
        else if (o.trigger && !map.spatialPrimitives?.triggers?.some((t) => t.id === o.trigger))
          errors.push(`${where}: unknown trigger ${o.trigger} on ${o.map}.`);
      }
    });
  });
  return errors;
}

export function questI18n(quest: Quest): QuestI18n {
  const prefix = `quest.${quest.id}`;
  return {
    questId: quest.id,
    messages: [
      { msgKey: `${prefix}.title`, text: quest.title },
      { msgKey: `${prefix}.description`, text: quest.description },
      ...quest.steps.flatMap((step) => [
        { msgKey: `${prefix}.${step.id}.journal`, text: step.journal },
        ...step.objectives.map((o) => ({
          msgKey: `${prefix}.${step.id}.${o.id}.text`,
          text: o.text,
        })),
      ]),
    ],
  };
}

export function unusedQuestLocalId(entries: readonly { id: string }[], base: string): string {
  let index = 1;
  while (entries.some((entry) => entry.id === `${base}-${index}`)) index++;
  return `${base}-${index}`;
}
