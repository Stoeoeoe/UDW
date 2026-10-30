import { z } from 'zod';
import type {
  Cutscene,
  CutsceneAction,
  CutsceneStep,
  CutsceneVariable,
  CutsceneData,
} from '../types/cutscene';
import { mapPositionSchema, mapPathSchema } from './mapPosition';
import { storyDataSchema, STORY_VALUE_TYPE } from './storyValues';

export const variableTypes = [
  'boolean',
  'number',
  'string',
  'position',
  'path',
  'table',
  'storyValue',
] as const;
export const cutsceneDataSchema: z.ZodType<CutsceneData> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(cutsceneDataSchema),
    z.record(z.string(), cutsceneDataSchema),
  ]),
);
export const canonicalVariableType = (type: string) =>
  type === STORY_VALUE_TYPE ? 'storyValue' : type === 'integer' ? 'number' : type;
export function variableCompatible(
  source: { type: string; nullable?: boolean },
  target: { type: string; nullable?: boolean },
) {
  const from = canonicalVariableType(source.type),
    to = canonicalVariableType(target.type);
  return (
    (!source.nullable || target.nullable === true) &&
    (from === to ||
      (to === 'storyValue' && ['boolean', 'number', 'string', 'table'].includes(from)))
  );
}
export function validVariableValue(
  variable: Pick<CutsceneVariable, 'type' | 'nullable'>,
  value: unknown,
) {
  if (value === null) return variable.nullable === true;
  if (variable.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (variable.type === 'boolean' || variable.type === 'string')
    return typeof value === variable.type;
  if (variable.type === 'position') return mapPositionSchema.safeParse(value).success;
  if (variable.type === 'path') return mapPathSchema.safeParse(value).success;
  if (variable.type === 'storyValue') return storyDataSchema.safeParse(value).success;
  return value !== null && typeof value === 'object' && jsonData(value);
}
function jsonData(value: unknown): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value)
    ? value.every(jsonData)
    : typeof value === 'object' && value !== null && Object.values(value).every(jsonData);
}
export const cutsceneVariableSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use a variable name such as walkingSpeed'),
    type: z.enum(variableTypes),
    initialValue: z.unknown(),
    nullable: z.boolean().optional(),
  })
  .strict()
  .superRefine((variable, context) => {
    if (!validVariableValue(variable, variable.initialValue))
      context.addIssue({
        code: 'custom',
        path: ['initialValue'],
        message: `Initial value must match ${variable.type}`,
      });
  });
export function initialVariableValue(type: CutsceneVariable['type']): unknown {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'string') return '';
  if (type === 'position') return { x: 0, y: 0 };
  if (type === 'path') return [{ x: 0, y: 0 }];
  return {};
}
export function setVariableAction(
  scene: Pick<Cutscene, 'variables'>,
  step?: CutsceneStep,
): CutsceneAction {
  const variable = scene.variables?.find((entry) => entry.name === step?.arguments.name);
  const type = variable?.type ?? 'string';
  return {
    id: 'cutscene.setVariable',
    displayName: 'Set Variable',
    category: 'Variables',
    description: 'Set a variable owned by this cutscene run.',
    contexts: ['cutscene'],
    phases: ['setup', 'sequence', 'completion'],
    execution: 'immediate',
    outputs: [],
    parameters: [
      { name: 'name', type: 'string' },
      {
        name: 'value',
        type: type === 'table' || type === 'storyValue' ? STORY_VALUE_TYPE : type,
        nullable: variable?.nullable,
        ...(type === 'position' || type === 'path'
          ? {
              picker: type === 'path' ? 'mapPath' : 'mapPosition',
              coordinateSpace: 'mapPixels',
              origin: 'topLeft',
              placementModes: ['tile', 'pixel', 'anchor'],
              tileAnchor: 'center',
              characterPivot: 'feet',
            }
          : {}),
      },
    ],
  };
}
export const actionForCutsceneStep = (
  scene: Pick<Cutscene, 'variables'>,
  step: CutsceneStep,
  actions: CutsceneAction[],
) =>
  step.action === 'cutscene.setVariable'
    ? setVariableAction(scene, step)
    : actions.find((action) => action.id === step.action);

export function parallelVariableConflicts(tracks: CutsceneStep[][]): string[] {
  const accesses = tracks.map((track) => ({
    reads: new Set(track.flatMap((step) => Object.values(step.argumentVariables ?? {}))),
    writes: new Set(
      track.flatMap((step) => [
        ...(step.resultVariables ?? []).filter((name): name is string => name !== null),
        ...(step.action === 'cutscene.setVariable' ? [String(step.arguments.name)] : []),
      ]),
    ),
  }));
  const conflicts: string[] = [];
  for (let first = 0; first < accesses.length; first++)
    for (let second = first + 1; second < accesses.length; second++)
      if (
        [...accesses[first].writes].some(
          (name) => accesses[second].reads.has(name) || accesses[second].writes.has(name),
        ) ||
        [...accesses[second].writes].some((name) => accesses[first].reads.has(name))
      )
        conflicts.push(
          `Tracks ${first + 1} and ${second + 1} share a written variable; join before reading it in another track`,
        );
  return conflicts;
}
