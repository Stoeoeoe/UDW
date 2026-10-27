import { z } from 'zod';

const nonblank = z.string().regex(/\S/, 'Must not be blank');
const parameterSchema = z
  .object({
    name: nonblank,
    type: nonblank,
    semanticType: z.string().optional(),
    picker: z.string().optional(),
    resourceType: nonblank.optional(),
    nullable: z.boolean().optional(),
    optional: z.boolean().optional(),
    defaultValue: z.union([z.boolean(), z.number().finite(), z.string()]).optional(),
    coordinateSpace: z.string().optional(),
    origin: z.string().optional(),
    placementModes: z.array(z.string()).optional(),
    tileAnchor: z.string().optional(),
    characterPivot: z.string().optional(),
  })
  .passthrough()
  .superRefine((parameter, context) => {
    if (parameter.defaultValue === undefined) {
      if (parameter.optional === true)
        context.addIssue({
          code: 'custom',
          path: ['defaultValue'],
          message: 'Optional parameters require a default value',
        });
      return;
    }
    if (typeof parameter.defaultValue !== parameter.type)
      context.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'Default value must match the parameter type',
      });
  });
const actionSchema = z
  .object({
    id: nonblank,
    displayName: nonblank,
    category: nonblank,
    description: z.string(),
    contexts: z.array(nonblank),
    execution: z.enum(['immediate', 'awaitable']),
    phases: z
      .array(z.enum(['setup', 'sequence', 'completion']))
      .nonempty()
      .refine((phases) => new Set(phases).size === phases.length, 'Duplicate action phase')
      .optional(),
  })
  .passthrough();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    resources: z
      .record(
        z.string(),
        z.array(z.object({ id: nonblank, description: z.string() }).passthrough()),
      )
      .optional(),
    modules: z.array(
      z
        .object({
          path: nonblank,
          methods: z.array(
            z
              .object({
                name: nonblank,
                parameters: z.array(parameterSchema),
                returnType: z.string().optional(),
                returnNullable: z.boolean().optional(),
                writesState: z.boolean().optional(),
                action: actionSchema.optional(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** All exported modules and signatures, including ordinary synchronous Lua calls. */
export type ScriptingManifest = z.infer<typeof manifestSchema>;
export type ScriptingResources = NonNullable<ScriptingManifest['resources']>;
export type ScriptingAction = z.infer<typeof actionSchema> & {
  parameters: z.infer<typeof parameterSchema>[];
};
export interface ManifestFileUpdate {
  path: string;
  revision: number;
  content: unknown;
  error: string | null;
}

export function parseScriptingManifest(raw: unknown): ScriptingManifest {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `Unsupported or invalid Lua manifest (expected schemaVersion 2): ${parsed.error.message}`,
    );
  const actionIds = new Set<string>();
  for (const [type, entries] of Object.entries(parsed.data.resources ?? {})) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      throw new Error(`Duplicate resource ID in ${type}`);
  }
  for (const module of parsed.data.modules)
    for (const method of module.methods) {
      if (new Set(method.parameters.map((p) => p.name)).size !== method.parameters.length)
        throw new Error(`Duplicate parameter in ${module.path}.${method.name}`);
      if (method.action) {
        if (actionIds.has(method.action.id))
          throw new Error(`Duplicate action ID: ${method.action.id}`);
        actionIds.add(method.action.id);
      }
    }
  return parsed.data;
}

export function getManifestActions(
  manifest: ScriptingManifest,
  context?: string,
): ScriptingAction[] {
  return manifest.modules.flatMap((module) =>
    module.methods.flatMap((method) =>
      method.action && (!context || method.action.contexts.includes(context))
        ? [{ ...method.action, parameters: method.parameters }]
        : [],
    ),
  );
}

export const EMPTY_SCRIPTING_ACTIONS: ScriptingAction[] = [];
export const EMPTY_SCRIPTING_RESOURCES: ScriptingResources = {};

/** Project character definitions are editor resources; Unity prefab resolution is external. */
export function withProjectCharacters(
  resources: ScriptingResources | undefined,
  characters: readonly { id: string; name: string }[],
): ScriptingResources {
  return {
    ...resources,
    character: characters.map((character) => ({
      id: character.id,
      description: character.name || character.id,
    })),
  };
}
