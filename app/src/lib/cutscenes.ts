import { z } from 'zod';
import { mapPositionSchema, positionPickerMetadata, isAnchorPosition } from './mapPosition';
import {
  getManifestActions,
  parseScriptingManifest,
  type ScriptingResources,
} from './scriptingManifest';
import type { Cutscene, CutsceneAction, CutsceneDiagnostic, CutsceneStep } from '../types/cutscene';
import type { EntityInstance, EntityType, Map as GameMap } from '../types/schema';

const nonblank = z.string().regex(/\S/, 'Must not be blank');
const stepSchema = z
  .object({
    id: nonblank,
    action: nonblank,
    arguments: z.record(z.string(), z.union([nonblank, z.number().finite(), mapPositionSchema])),
  })
  .strict();
export function actionsForCutscenePhase(
  actions: CutsceneAction[],
  phase: 'setup' | 'sequence' | 'completion',
) {
  return actions.filter(
    (action) =>
      action.contexts.includes('cutscene') &&
      action.phases?.includes(phase) &&
      (phase === 'sequence' || action.execution === 'immediate'),
  );
}
const editorMetadataSchema = z
  .object({
    labels: z.record(z.string(), z.string()),
    folders: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export function readCutsceneMetadata(raw: unknown) {
  if (raw === null) return { labels: {}, folders: {} };
  const metadata = editorMetadataSchema.parse(raw);
  return { labels: metadata.labels, folders: metadata.folders ?? {} };
}
export function readCutsceneLabels(raw: unknown): Record<string, string> {
  return readCutsceneMetadata(raw).labels;
}
export const cutsceneSchema = z
  .object({
    $schema: nonblank,
    formatVersion: z.literal(2),
    id: z.string().regex(/^[^\s:]+:[^\s]+$/, 'Use namespace:name'),
    mapId: nonblank,
    allowSkip: z.boolean(),
    onStart: z.array(stepSchema).optional(),
    onComplete: z
      .object({
        steps: z.array(stepSchema),
        actorPlacements: z.array(z.object({ actor: nonblank, anchor: nonblank }).strict()),
      })
      .strict(),
    sequence: z.array(stepSchema).min(1),
  })
  .strict();

export function readCutsceneActions(raw: unknown): CutsceneAction[] {
  return getManifestActions(parseScriptingManifest(raw), 'cutscene');
}

export function parseCutscene(raw: unknown): Cutscene {
  if (raw && typeof raw === 'object' && 'formatVersion' in raw && raw.formatVersion === 1) {
    const legacy = cutsceneSchema
      .extend({
        formatVersion: z.literal(1),
        onComplete: z
          .object({
            actions: z.string(),
            actorPlacements: z.array(z.object({ actor: nonblank, anchor: nonblank }).strict()),
          })
          .strict(),
      })
      .parse(raw);
    if (legacy.onComplete.actions.trim())
      throw new Error(
        `Cutscene ${legacy.id}: version 1 completion Lua requires manual conversion to typed completion steps. The source file has not been changed.`,
      );
    raw = {
      ...legacy,
      formatVersion: 2,
      onComplete: { steps: [], actorPlacements: legacy.onComplete.actorPlacements },
    };
  }

  const result = cutsceneSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid cutscene source: ${result.error.message}`);
  const ids = [
    ...(result.data.onStart ?? []),
    ...result.data.sequence,
    ...result.data.onComplete.steps,
  ].map((step) => step.id);
  if (new Set(ids).size !== ids.length)
    throw new Error(
      `Cutscene ${result.data.id}: duplicate step ID across setup, sequence and completion`,
    );
  const actors = result.data.onComplete.actorPlacements.map((p) => p.actor);
  if (new Set(actors).size !== actors.length)
    throw new Error(`Cutscene ${result.data.id}: duplicate endpoint actor`);
  return result.data;
}

export function mapActorInstances(map: GameMap, entityTypes: EntityType[]): EntityInstance[] {
  // The shipped importer creates characters for NPC entities. Ordinary props and
  // character definitions are not live actor bindings.
  const npcTypes = new Set(entityTypes.filter((t) => t.category === 'npc').map((t) => t.id));
  const byId = new Map<string, EntityInstance>();
  for (const entity of [...map.entities, ...map.layers.flatMap((l) => l.entities ?? [])]) {
    if (npcTypes.has(entity.typeId)) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

export interface CutsceneReferences {
  resources?: ScriptingResources;
  tileSize?: number;
  maps: GameMap[];
  entityTypes: EntityType[];
  dialogueIds: string[];
}

export function validateCutsceneTriggers(map: GameMap, scenes: readonly Cutscene[]): string[] {
  const errors: string[] = [];
  for (const trigger of map.spatialPrimitives?.triggers ?? []) {
    if (trigger.type !== 'cutscene') {
      if (trigger.cutsceneId !== undefined)
        errors.push(`Trigger ${trigger.id}: only cutscene triggers may reference a cutscene`);
      continue;
    }
    const scene = scenes.find((s) => s.id === trigger.cutsceneId);
    if (!scene)
      errors.push(`Trigger ${trigger.id}: missing cutscene ${trigger.cutsceneId ?? '(none)'}`);
    else if (scene.mapId !== map.id)
      errors.push(`Trigger ${trigger.id}: cutscene ${scene.id} belongs to another map`);
    if (map.locationLinks?.some((l) => l.triggerId === trigger.id))
      errors.push(`Trigger ${trigger.id}: cannot also be a location link`);
  }
  return errors;
}

export function validateCutscene(
  raw: unknown,
  actions: CutsceneAction[],
  refs: CutsceneReferences,
): CutsceneDiagnostic[] {
  const shape = cutsceneSchema.safeParse(raw);
  if (!shape.success)
    return shape.error.issues.map((issue) => {
      const completion = issue.path[0] === 'onComplete' && issue.path[1] === 'steps';
      const index = completion ? issue.path[2] : issue.path[1];
      const phase = completion
        ? ('completion' as const)
        : issue.path[0] === 'onStart'
          ? ('setup' as const)
          : ('sequence' as const);
      const candidate = raw as Partial<Cutscene>;
      const list = completion
        ? candidate?.onComplete?.steps
        : phase === 'setup'
          ? candidate?.onStart
          : candidate?.sequence;
      const step = typeof index === 'number' ? list?.[index] : undefined;
      return {
        path: issue.path.join('.'),
        message: issue.message,
        stepId: step?.id,
        ...(step ? { phase } : {}),
      };
    });
  const scene = shape.data;
  const diagnostics: CutsceneDiagnostic[] = [];
  const report = (path: string, message: string, stepId?: string) =>
    diagnostics.push({
      path,
      message,
      stepId,
      ...(stepId
        ? {
            phase: path.startsWith('onComplete.steps')
              ? ('completion' as const)
              : path.startsWith('onStart')
                ? ('setup' as const)
                : ('sequence' as const),
          }
        : {}),
    });
  const map = refs.maps.find((m) => m.id === scene.mapId);
  if (!map) report('mapId', `Map ${scene.mapId} does not exist`);
  const actors = new Set([
    'player',
    ...(map ? mapActorInstances(map, refs.entityTypes).map((a) => a.id) : []),
  ]);
  const anchors = new Set(map?.spatialPrimitives?.anchors?.map((a) => a.id) ?? []);
  const dialogues = new Set(refs.dialogueIds);
  const seen = new Set<string>();
  const phaseSteps = [
    ...(scene.onStart ?? []).map((step, index) => ({ step, index, section: 'onStart' as const })),
    ...scene.sequence.map((step, index) => ({ step, index, section: 'sequence' as const })),
    ...scene.onComplete.steps.map((step, index) => ({
      step,
      index,
      section: 'onComplete.steps' as const,
    })),
  ];
  phaseSteps.forEach(({ step, index, section }) => {
    const path = `${section}.${index}`;
    if (seen.has(step.id)) report(`${path}.id`, 'Duplicate step ID', step.id);
    seen.add(step.id);
    const action = actions.find((a) => a.id === step.action && a.contexts.includes('cutscene'));
    if (!action) {
      report(path, `Unsupported cutscene action ${step.action}`, step.id);
      return;
    }
    const phase =
      section === 'onStart' ? 'setup' : section === 'onComplete.steps' ? 'completion' : 'sequence';
    if (!actionsForCutscenePhase([action], phase).length)
      report(path, `Action ${step.action} is not allowed in ${phase}`, step.id);
    for (const name of Object.keys(step.arguments)) {
      if (!action.parameters.some((p) => p.name === name))
        report(`${path}.arguments.${name}`, 'Unknown argument', step.id);
    }
    for (const parameter of action.parameters) {
      const value = step.arguments[parameter.name];
      const argumentPath = `${path}.arguments.${parameter.name}`;
      if (parameter.semanticType === 'actorDeclaration') {
        if (phase !== 'setup')
          report(argumentPath, 'Actor declarations are only allowed in setup', step.id);
        if (typeof value !== 'string' || !value.trim())
          report(argumentPath, 'Enter a new actor name', step.id);
        else if (actors.has(value)) report(argumentPath, `Duplicate actor name: ${value}`, step.id);
        continue;
      }
      if (parameter.type === 'position') {
        if (!positionPickerMetadata(parameter))
          report(argumentPath, 'Unsupported map position picker metadata', step.id);
        const position = mapPositionSchema.safeParse(value);
        if (!position.success)
          report(argumentPath, 'Choose integer map-pixel coordinates or a map anchor', step.id);
        else if (isAnchorPosition(position.data)) {
          if (!anchors.has(position.data.anchor))
            report(argumentPath, `Missing anchor: ${position.data.anchor}`, step.id);
        } else if (
          map &&
          (position.data.x >= map.width * (refs.tileSize ?? 16) ||
            position.data.y >= map.height * (refs.tileSize ?? 16))
        )
          report(argumentPath, 'Position is outside the selected map', step.id);
        continue;
      }
      if (parameter.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value))
          report(argumentPath, 'Enter a finite number', step.id);
        if (parameter.semanticType || parameter.picker || parameter.resourceType)
          report(argumentPath, 'Numeric parameters cannot use reference pickers', step.id);
        continue;
      }
      if (parameter.type !== 'string') {
        report(argumentPath, `Unsupported parameter type ${parameter.type}`, step.id);
        continue;
      }
      if (parameter.resourceType) {
        const list = refs.resources?.[parameter.resourceType];
        if (!list)
          report(
            argumentPath,
            `Missing resource list "${parameter.resourceType}" in Lua manifest`,
            step.id,
          );
        if (typeof value !== 'string' || !value.trim())
          report(argumentPath, 'Required resource ID', step.id);
        else if (list && !list.some((entry) => entry.id === value))
          report(argumentPath, `Missing ${parameter.resourceType} resource: ${value}`, step.id);
        continue;
      }
      const pair = `${parameter.semanticType ?? ''}/${parameter.picker ?? ''}`;
      const values =
        pair === 'actorRef/mapActor'
          ? actors
          : pair === 'anchorRef/mapAnchor'
            ? anchors
            : pair === 'dialogueRef/dialogue'
              ? dialogues
              : null;
      if ((parameter.semanticType || parameter.picker) && !values)
        report(argumentPath, `Unsupported picker ${pair}`, step.id);
      if (typeof value !== 'string') {
        report(argumentPath, 'Expected a string argument', step.id);
        continue;
      }
      if (!value.trim()) {
        report(argumentPath, 'Required argument', step.id);
        continue;
      }
      if (values && !values.has(value))
        report(argumentPath, `Missing ${parameter.semanticType}: ${value}`, step.id);
    }
    // Declarations become visible only after the entire setup step, independently of parameter order.
    if (phase === 'setup' && actionsForCutscenePhase([action], phase).length)
      for (const p of action.parameters.filter(
        (p) => p.type === 'string' && p.semanticType === 'actorDeclaration',
      )) {
        const name = step.arguments[p.name];
        if (typeof name === 'string' && name.trim() && !actors.has(name)) actors.add(name);
      }
  });
  const endpoints = new Set<string>();
  scene.onComplete.actorPlacements.forEach((p, index) => {
    const path = `onComplete.actorPlacements.${index}`;
    if (endpoints.has(p.actor)) report(path, `Duplicate endpoint for ${p.actor}`);
    endpoints.add(p.actor);
    if (!actors.has(p.actor)) report(path, `Missing actor instance ${p.actor}`);
    if (!anchors.has(p.anchor)) report(path, `Missing anchor ${p.anchor}`);
  });
  for (const candidate of refs.maps)
    for (const trigger of candidate.spatialPrimitives?.triggers ?? []) {
      if (trigger.type !== 'cutscene' || trigger.cutsceneId !== scene.id) continue;
      if (candidate.id !== scene.mapId)
        report(`trigger.${trigger.id}`, 'Trigger and cutscene must belong to the same map');
      if (candidate.locationLinks?.some((link) => link.triggerId === trigger.id))
        report(`trigger.${trigger.id}`, 'Cutscene trigger cannot also be a location link');
    }
  return diagnostics;
}

/** Deterministic typed source; Lua compilation and escaping belong to Unity. */
export function exportCutscene(
  scene: Cutscene,
  actions: CutsceneAction[],
  refs: CutsceneReferences,
): Cutscene {
  const diagnostics = validateCutscene(scene, actions, refs);
  if (diagnostics.length)
    throw new Error(
      `Cutscene ${scene.id}: ${diagnostics.map((d) => `${d.phase ? `${d.phase} ` : ''}${d.stepId ?? d.path}: ${d.message}`).join('; ')}`,
    );
  const serializeStep = (step: CutsceneStep): CutsceneStep => ({
    id: step.id,
    action: step.action,
    arguments: Object.fromEntries(
      actions
        .find((a) => a.id === step.action)!
        .parameters.map((p) => [p.name, step.arguments[p.name]]),
    ),
  });
  return {
    $schema: '../schemas/cutscene.schema.json',
    formatVersion: 2,
    id: scene.id,
    mapId: scene.mapId,
    allowSkip: scene.allowSkip,
    ...(scene.onStart !== undefined ? { onStart: scene.onStart.map(serializeStep) } : {}),
    onComplete: {
      steps: scene.onComplete.steps.map(serializeStep),
      actorPlacements: scene.onComplete.actorPlacements.map((p) => ({
        actor: p.actor,
        anchor: p.anchor,
      })),
    },
    sequence: scene.sequence.map(serializeStep),
  };
}

export function createCutsceneStep(action: CutsceneAction): CutsceneStep {
  return {
    id: `beat-${crypto.randomUUID()}`,
    action: action.id,
    arguments: Object.fromEntries(action.parameters.map((p) => [p.name, ''])),
  };
}

/** Scope is authored setup order; no declaration can shadow a live map role. */
export function declaredActorsBefore(
  scene: Cutscene,
  actions: CutsceneAction[],
  existing: readonly string[],
  stepId?: string,
): string[] {
  const known = new Set(existing);
  const names: string[] = [];
  for (const step of scene.onStart ?? []) {
    if (step.id === stepId) break;
    const action = actions.find((a) => a.id === step.action);
    if (!action || !actionsForCutscenePhase([action], 'setup').length) continue;
    for (const p of action.parameters) {
      const value = step.arguments[p.name];
      if (
        p.type === 'string' &&
        p.semanticType === 'actorDeclaration' &&
        typeof value === 'string' &&
        value.trim() &&
        !known.has(value)
      ) {
        known.add(value);
        names.push(value);
      }
    }
  }
  return names;
}
