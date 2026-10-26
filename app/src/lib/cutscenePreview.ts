import { z } from 'zod';
import type { ScriptingResources } from './scriptingManifest';
import { resolveMapPosition, positionPickerMetadata } from './mapPosition';
import type { Cutscene, CutsceneAction } from '../types/cutscene';
import type { EntityType, Map as GameMap } from '../types/schema';
import { mapActorInstances, actionsForCutscenePhase } from './cutscenes';

type Point = [number, number];
const parameter = z.string().min(1);
const previewSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    spatialState: z.enum(['described', 'unknown']),
    effects: z.array(
      z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('moveActorToAnchor'),
            actorParameter: parameter,
            anchorParameter: parameter,
            facing: z.literal('unknown'),
          })
          .strict(),
        z
          .object({
            kind: z.literal('faceActorTowardActor'),
            actorParameter: parameter,
            targetActorParameter: parameter,
          })
          .strict(),
        z
          .object({
            kind: z.literal('spawnActor'),
            actorParameter: parameter,
            definitionParameter: parameter,
            positionParameter: parameter,
            facing: z.literal('unknown'),
          })
          .strict(),
        z
          .object({
            kind: z.literal('faceActorDirection'),
            actorParameter: parameter,
            directionParameter: parameter,
          })
          .strict(),
        z.object({ kind: z.literal('showDialogue'), dialogueParameter: parameter }).strict(),
        z
          .object({
            kind: z.literal('setActorPosition'),
            actorParameter: parameter,
            positionParameter: parameter,
            facing: z.literal('preserve'),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

export type PreviewSelection =
  | { kind: 'scene' }
  | { kind: 'setup' }
  | { kind: 'step'; id: string }
  | { kind: 'completion' };
export interface PreviewActor {
  id: string;
  label: string;
  definitionId?: string;
  position: Point | null;
  facing: Point | null;
}
export interface PreviewSegment {
  stepId: string;
  number: number;
  actorId: string;
  kind: 'move' | 'face';
  from: Point;
  to: Point;
}
export interface CutscenePreview {
  actors: PreviewActor[];
  segments: PreviewSegment[];
  cues: { stepId: string; dialogueId: string }[];
  placements: { stepId: string; actorId: string; position: Point }[];
  facings: { stepId: string; actorId: string; targetId: string }[];
  notices: { stepId?: string; message: string }[];
}

/** Preview metadata is optional tooling data. Unsupported declarations must not disable authoring. */
export function readActionPreview(action: CutsceneAction | undefined) {
  const parsed = previewSchema.safeParse(action?.preview);
  if (!parsed.success || !action) return null;
  if (
    parsed.data.version === 1 &&
    parsed.data.effects.some(
      (effect) => effect.kind === 'setActorPosition' || effect.kind === 'spawnActor',
    )
  )
    return null;
  const pairs: Record<string, string> = {
    actorParameter: 'actorRef/mapActor',
    targetActorParameter: 'actorRef/mapActor',
    anchorParameter: 'anchorRef/mapAnchor',
    dialogueParameter: 'dialogueRef/dialogue',
  };
  for (const effect of parsed.data.effects) {
    if (
      (effect.kind === 'setActorPosition' || effect.kind === 'spawnActor') &&
      !positionPickerMetadata(action.parameters.find((p) => p.name === effect.positionParameter))
    )
      return null;
    if (effect.kind === 'spawnActor') {
      const declaration = action.parameters.find((p) => p.name === effect.actorParameter);
      const definition = action.parameters.find((p) => p.name === effect.definitionParameter);
      if (
        declaration?.type !== 'string' ||
        declaration.semanticType !== 'actorDeclaration' ||
        definition?.type !== 'string' ||
        definition.resourceType !== 'actor'
      )
        return null;
    }
    if (
      effect.kind === 'faceActorDirection' &&
      action.parameters.find((p) => p.name === effect.directionParameter)?.resourceType !==
        'direction'
    )
      return null;
    for (const [role, expected] of Object.entries(pairs)) {
      const name = (effect as Record<string, unknown>)[role];
      if (!name || (role === 'actorParameter' && effect.kind === 'spawnActor')) continue;
      const p = action.parameters.find((p) => p.name === name);
      if (!p || p.type !== 'string' || `${p.semanticType}/${p.picker}` !== expected) return null;
    }
  }
  return parsed.data;
}

/** Rebuild a schematic snapshot from authored state. No API names, Lua execution or path simulation. */
export function previewCutscene(
  scene: Cutscene,
  map: GameMap,
  entityTypes: EntityType[],
  actions: CutsceneAction[],
  selection: PreviewSelection,
  dialogueIds: string[],
  tileSize = 16,
  resources: ScriptingResources = {},
): CutscenePreview {
  const actors = new Map<string, PreviewActor>(
    mapActorInstances(map, entityTypes).map((actor) => [
      actor.id,
      {
        id: actor.id,
        definitionId: actor.typeId,
        label:
          actor.label || entityTypes.find((t) => t.id === actor.typeId)?.displayName || actor.id,
        position: [...actor.position] as Point,
        facing: null,
      },
    ]),
  );
  actors.set('player', { id: 'player', label: 'Player', position: null, facing: null });
  const anchors = new Map((map.spatialPrimitives?.anchors ?? []).map((a) => [a.id, a]));
  const result: CutscenePreview = {
    actors: [],
    segments: [],
    cues: [],
    facings: [],
    placements: [],
    notices: [],
  };
  const notice = (message: string, stepId?: string) => result.notices.push({ stepId, message });
  const invalidate = () => {
    for (const actor of actors.values()) {
      actor.position = null;
      actor.facing = null;
    }
  };
  const finish = () => {
    result.actors = [...actors.values()];
    return result;
  };
  if (selection.kind === 'scene') return finish();
  const completionIndex =
    selection.kind === 'step' ? scene.onComplete.steps.findIndex((s) => s.id === selection.id) : -1;
  const completing = selection.kind === 'completion' || completionIndex >= 0;
  const spawn = (
    step: Cutscene['sequence'][number],
    effect: { actorParameter: string; definitionParameter: string; positionParameter: string },
  ) => {
    const id = step.arguments[effect.actorParameter],
      definition = step.arguments[effect.definitionParameter];
    if (typeof id !== 'string' || !id.trim() || actors.has(id)) {
      notice('Spawn preview unavailable: empty or duplicate actor name.', step.id);
      return;
    }
    const registered = resources.actor?.some((entry) => entry.id === definition);
    if (typeof definition !== 'string' || !registered) {
      notice(
        `Spawn preview unavailable: unregistered actor definition ${typeof definition === 'string' ? definition : '(not set)'}.`,
        step.id,
      );
      return;
    }
    const position = resolveMapPosition(
      step.arguments[effect.positionParameter],
      [...anchors.values()],
      map.width,
      map.height,
      tileSize,
    );
    actors.set(id, {
      id,
      label: id,
      definitionId: definition,
      position: position ? [...position] : null,
      facing: null,
    });
    if (position) result.placements.push({ stepId: step.id, actorId: id, position: [...position] });
    else notice('Spawn preview unavailable: unresolved map position.', step.id);
  };
  if (completing) {
    // Spawn captures its initial placement at creation. Existing actors restore pre-run staging.
    for (const step of scene.onStart ?? []) {
      const action = actions.find((a) => a.id === step.action);
      if (!action || !actionsForCutscenePhase([action], 'setup').length) continue;
      for (const effect of readActionPreview(action)?.effects ?? [])
        if (effect.kind === 'spawnActor') spawn(step, effect);
    }
    for (const placement of scene.onComplete.actorPlacements) {
      const actor = actors.get(placement.actor),
        anchor = anchors.get(placement.anchor);
      if (!actor || !anchor) {
        if (actor) {
          actor.position = null;
          actor.facing = null;
        }
        notice(
          `Final position unavailable: missing ${!actor ? `actor ${placement.actor}` : `anchor ${placement.anchor}`}.`,
        );
        continue;
      }
      actor.position = [...anchor.position];
      actor.facing = anchor.facing?.some((n) => n !== 0) ? [...anchor.facing] : null;
    }
  }
  const setup = scene.onStart ?? [];
  const setupIndex = selection.kind === 'step' ? setup.findIndex((s) => s.id === selection.id) : -1;
  const sequenceIndex =
    selection.kind === 'step' ? scene.sequence.findIndex((s) => s.id === selection.id) : -1;
  if (selection.kind === 'step' && setupIndex < 0 && sequenceIndex < 0 && completionIndex < 0) {
    notice('Selected step is unavailable.');
    return finish();
  }
  const steps = completing
    ? scene.onComplete.steps
        .slice(0, completionIndex >= 0 ? completionIndex + 1 : undefined)
        .map((step, index) => ({ step, index, phase: 'completion' as const }))
    : [
        ...setup
          .slice(0, setupIndex >= 0 ? setupIndex + 1 : undefined)
          .map((step, index) => ({ step, index, phase: 'setup' as const })),
        ...(selection.kind === 'setup' || setupIndex >= 0
          ? []
          : scene.sequence
              .slice(0, sequenceIndex + 1)
              .map((step, index) => ({ step, index, phase: 'sequence' as const }))),
      ];
  for (const { step, index, phase } of steps) {
    const reference = (name: string): string =>
      typeof step.arguments[name] === 'string' ? (step.arguments[name] as string) : '';
    const action = actions.find((a) => a.id === step.action && a.contexts.includes('cutscene'));
    const preview = actionsForCutscenePhase(action ? [action] : [], phase).length
      ? readActionPreview(action)
      : null;
    if (!preview) {
      invalidate();
      notice('Preview unavailable: this action has no supported preview declaration.', step.id);
      continue;
    }
    for (const effect of preview.effects) {
      if (effect.kind === 'showDialogue') {
        const id = reference(effect.dialogueParameter);
        if (dialogueIds.includes(id)) result.cues.push({ stepId: step.id, dialogueId: id });
        else notice(`Dialogue preview unavailable: ${id || 'no dialogue selected'}.`, step.id);
        continue;
      }
      if (effect.kind === 'spawnActor') {
        spawn(step, effect);
        continue;
      }
      const actorId = reference(effect.actorParameter),
        actor = actors.get(actorId);
      if (!actor) {
        invalidate();
        notice(`Preview unavailable: missing actor ${actorId || '(not set)'}.`, step.id);
        continue;
      }
      if (effect.kind === 'setActorPosition') {
        const position = resolveMapPosition(
          step.arguments[effect.positionParameter],
          [...anchors.values()],
          map.width,
          map.height,
          tileSize,
        );
        if (!position) {
          actor.position = null;
          notice('Placement preview unavailable: invalid or unresolved map position.', step.id);
          continue;
        }
        actor.position = [...position];
        result.placements.push({ stepId: step.id, actorId, position: [...actor.position] });
        continue;
      }
      if (effect.kind === 'faceActorDirection') {
        const directions: Record<string, Point> = {
          North: [0, -1],
          East: [1, 0],
          South: [0, 1],
          West: [-1, 0],
        };
        actor.facing = directions[reference(effect.directionParameter)] ?? null;
        if (!actor.facing) notice('Facing preview unavailable: unresolved direction.', step.id);
        continue;
      }
      if (effect.kind === 'moveActorToAnchor') {
        const anchorId = reference(effect.anchorParameter),
          anchor = anchors.get(anchorId);
        if (!anchor) {
          actor.position = null;
          actor.facing = null;
          notice(`Preview unavailable: missing anchor ${anchorId || '(not set)'}.`, step.id);
          continue;
        }
        if (actor.position && phase === 'sequence')
          result.segments.push({
            stepId: step.id,
            number: index + 1,
            actorId,
            kind: 'move',
            from: [...actor.position],
            to: [...anchor.position],
          });
        else if (!actor.position && phase === 'sequence')
          notice(
            `${actor.label}: starting position unknown; showing the destination only.`,
            step.id,
          );
        actor.position = [...anchor.position];
        actor.facing = null;
      } else {
        const targetId = reference(effect.targetActorParameter),
          target = actors.get(targetId);
        result.facings.push({ stepId: step.id, actorId, targetId });
        actor.facing = null;
        if (!actor.position || !target?.position) {
          notice(
            targetId === 'player' && !target?.position
              ? 'Player position is determined at runtime. The player marker and facing direction cannot be shown yet.'
              : `${actor.label}: facing unknown because ${!actor.position ? 'its' : target?.label || targetId || 'the target’s'} position is unknown.`,
            step.id,
          );
          continue;
        }
        const dx = target.position[0] - actor.position[0],
          dy = target.position[1] - actor.position[1],
          length = Math.hypot(dx, dy);
        if (!length) {
          notice(`${actor.label}: facing unknown because both actors share a position.`, step.id);
          continue;
        }
        actor.facing = [dx / length, dy / length];
        result.segments.push({
          stepId: step.id,
          number: index + 1,
          actorId,
          kind: 'face',
          from: [...actor.position],
          to: [...target.position],
        });
      }
    }
    if (preview.spatialState === 'unknown') {
      invalidate();
      notice(
        'Spatial state is unknown after this step; earlier arrows show history only.',
        step.id,
      );
    }
  }
  return finish();
}
