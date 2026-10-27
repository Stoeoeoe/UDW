import { z } from 'zod';
import type { ScriptingResources } from './scriptingManifest';
import { resolveMapPosition, positionPickerMetadata, pathPickerMetadata } from './mapPosition';
import type { Cutscene, CutsceneAction } from '../types/cutscene';
import { isConditionalStep } from '../types/cutscene';
import { previewSequence, type BranchPath } from './cutsceneBranches';
import type { EntityType, Map as GameMap } from '../types/schema';
import { mapCharacterInstances, actionsForCutscenePhase, completionPosition } from './cutscenes';

type Point = [number, number];
const cardinalDirections: Record<string, Point> = {
  North: [0, -1],
  East: [1, 0],
  South: [0, 1],
  West: [-1, 0],
};
const parameter = z.string().min(1);
const previewSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    spatialState: z.enum(['described', 'unknown']),
    effects: z.array(
      z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('moveCharacterToAnchor'),
            characterParameter: parameter,
            anchorParameter: parameter,
            facing: z.literal('unknown'),
          })
          .strict(),
        z
          .object({
            kind: z.literal('faceCharacterTowardCharacter'),
            characterParameter: parameter,
            targetCharacterParameter: parameter,
          })
          .strict(),
        z
          .object({
            kind: z.literal('spawnCharacter'),
            characterParameter: parameter,
            definitionParameter: parameter,
            positionParameter: parameter,
            facing: z.literal('unknown'),
          })
          .strict(),
        z
          .object({
            kind: z.literal('faceCharacterDirection'),
            characterParameter: parameter,
            directionParameter: parameter,
          })
          .strict(),
        z
          .object({
            kind: z.literal('moveCharacterAlongPath'),
            characterParameter: parameter,
            pathParameter: parameter,
            facing: z.literal('unknown'),
          })
          .strict(),
        z.object({ kind: z.literal('showDialogue'), dialogueParameter: parameter }).strict(),
        z
          .object({
            kind: z.literal('setCharacterPosition'),
            characterParameter: parameter,
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
export interface PreviewCharacter {
  id: string;
  label: string;
  definitionId?: string;
  position: Point | null;
  facing: Point | null;
}
export interface PreviewSegment {
  stepId: string;
  number: number;
  characterId: string;
  kind: 'move' | 'face';
  waypoint?: number;
  from: Point;
  to: Point;
}
export interface CutscenePreview {
  characters: PreviewCharacter[];
  segments: PreviewSegment[];
  cues: { stepId: string; dialogueId: string }[];
  placements: { stepId: string; characterId: string; position: Point; waypoint?: number }[];
  facings: { stepId: string; characterId: string; targetId: string }[];
  notices: { stepId?: string; message: string }[];
}

/** Preview metadata is optional tooling data. Unsupported declarations must not disable authoring. */
export function readActionPreview(action: CutsceneAction | undefined) {
  const parsed = previewSchema.safeParse(action?.preview);
  if (!parsed.success || !action) return null;
  if (
    parsed.data.version === 1 &&
    parsed.data.effects.some(
      (effect) =>
        effect.kind === 'setCharacterPosition' ||
        effect.kind === 'spawnCharacter' ||
        effect.kind === 'moveCharacterAlongPath',
    )
  )
    return null;
  const pairs: Record<string, string> = {
    characterParameter: 'characterRef/mapCharacter',
    targetCharacterParameter: 'characterRef/mapCharacter',
    anchorParameter: 'anchorRef/mapAnchor',
    dialogueParameter: 'dialogueRef/dialogue',
  };
  for (const effect of parsed.data.effects) {
    if (
      effect.kind === 'moveCharacterAlongPath' &&
      !pathPickerMetadata(action.parameters.find((p) => p.name === effect.pathParameter))
    )
      return null;
    if (
      (effect.kind === 'setCharacterPosition' || effect.kind === 'spawnCharacter') &&
      !positionPickerMetadata(action.parameters.find((p) => p.name === effect.positionParameter))
    )
      return null;
    if (effect.kind === 'spawnCharacter') {
      const declaration = action.parameters.find((p) => p.name === effect.characterParameter);
      const definition = action.parameters.find((p) => p.name === effect.definitionParameter);
      if (
        declaration?.type !== 'string' ||
        declaration.semanticType !== 'characterDeclaration' ||
        definition?.type !== 'string' ||
        definition.resourceType !== 'character'
      )
        return null;
    }
    if (
      effect.kind === 'faceCharacterDirection' &&
      action.parameters.find((p) => p.name === effect.directionParameter)?.resourceType !==
        'direction'
    )
      return null;
    for (const [role, expected] of Object.entries(pairs)) {
      const name = (effect as Record<string, unknown>)[role];
      if (!name || (role === 'characterParameter' && effect.kind === 'spawnCharacter')) continue;
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
  branchChoices: Record<string, BranchPath> = {},
): CutscenePreview {
  const sequence = previewSequence(
    scene.sequence,
    branchChoices,
    selection.kind === 'step' ? selection.id : undefined,
  );
  const characters = new Map<string, PreviewCharacter>(
    mapCharacterInstances(map, entityTypes).map((character) => [
      character.id,
      {
        id: character.id,
        definitionId: character.typeId,
        label:
          character.label ||
          entityTypes.find((t) => t.id === character.typeId)?.displayName ||
          character.id,
        position: [...character.position] as Point,
        facing: null,
      },
    ]),
  );
  characters.set('player', { id: 'player', label: 'Player', position: null, facing: null });
  const anchors = new Map((map.spatialPrimitives?.anchors ?? []).map((a) => [a.id, a]));
  const result: CutscenePreview = {
    characters: [],
    segments: [],
    cues: [],
    facings: [],
    placements: [],
    notices: [],
  };
  const notice = (message: string, stepId?: string) => result.notices.push({ stepId, message });
  const invalidate = () => {
    for (const character of characters.values()) {
      character.position = null;
      character.facing = null;
    }
  };
  const finish = () => {
    result.characters = [...characters.values()];
    return result;
  };
  if (selection.kind === 'scene') return finish();
  const completionIndex =
    selection.kind === 'step' ? scene.onComplete.steps.findIndex((s) => s.id === selection.id) : -1;
  const completing = selection.kind === 'completion' || completionIndex >= 0;
  const spawn = (
    step: Cutscene['sequence'][number],
    effect: { characterParameter: string; definitionParameter: string; positionParameter: string },
  ) => {
    const id = step.arguments[effect.characterParameter],
      definition = step.arguments[effect.definitionParameter];
    if (typeof id !== 'string' || !id.trim() || characters.has(id)) {
      notice('Spawn preview unavailable: empty or duplicate character name.', step.id);
      return;
    }
    const knownDefinition = resources.character?.some((entry) => entry.id === definition);
    if (typeof definition !== 'string' || !knownDefinition) {
      notice(
        `Spawn preview unavailable: missing character definition ${typeof definition === 'string' ? definition : '(not set)'}.`,
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
    characters.set(id, {
      id,
      label: id,
      definitionId: definition,
      position: position ? [...position] : null,
      facing: null,
    });
    if (position)
      result.placements.push({ stepId: step.id, characterId: id, position: [...position] });
    else notice('Spawn preview unavailable: unresolved map position.', step.id);
  };
  if (completing) {
    // Spawn captures its initial placement at creation. Existing characters restore pre-run staging.
    for (const step of scene.onStart ?? []) {
      const action = actions.find((a) => a.id === step.action);
      if (!action || !actionsForCutscenePhase([action], 'setup').length) continue;
      for (const effect of readActionPreview(action)?.effects ?? [])
        if (effect.kind === 'spawnCharacter') spawn(step, effect);
    }
    for (const placement of scene.onComplete.characterPlacements) {
      const character = characters.get(placement.character);
      const position = completionPosition(placement);
      const point = resolveMapPosition(
        position,
        [...anchors.values()],
        map.width,
        map.height,
        tileSize,
      );
      const anchor = placement.anchor !== undefined ? anchors.get(placement.anchor) : undefined;
      if (!character || !point) {
        if (character) {
          character.position = null;
          character.facing = null;
        }
        notice(
          `Final position unavailable: ${!character ? `missing character ${placement.character}` : placement.anchor !== undefined ? `missing anchor ${placement.anchor}` : 'invalid map position'}.`,
        );
        continue;
      }
      character.position = [...point];
      if (placement.facing && placement.facing !== 'preserve')
        character.facing = [...cardinalDirections[placement.facing]];
      else if (placement.facing !== 'preserve' && anchor?.facing?.some((n) => n !== 0))
        character.facing = [...anchor.facing];
    }
  }
  const setup = scene.onStart ?? [];
  const setupIndex = selection.kind === 'step' ? setup.findIndex((s) => s.id === selection.id) : -1;
  const sequenceIndex =
    selection.kind === 'step' ? sequence.findIndex((s) => s.id === selection.id) : -1;
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
          : sequence
              .slice(0, sequenceIndex + 1)
              .map((step, index) => ({ step, index, phase: 'sequence' as const }))),
      ];
  for (const { step, index, phase } of steps) {
    if (isConditionalStep(step)) {
      notice(
        'Conditional preview uses the selected If/Else path; live game conditions are not evaluated.',
        step.id,
      );
      continue;
    }
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
      if (effect.kind === 'spawnCharacter') {
        spawn(step, effect);
        continue;
      }
      const characterId = reference(effect.characterParameter),
        character = characters.get(characterId);
      if (!character) {
        invalidate();
        notice(`Preview unavailable: missing character ${characterId || '(not set)'}.`, step.id);
        continue;
      }
      if (effect.kind === 'moveCharacterAlongPath') {
        const path = step.arguments[effect.pathParameter];
        if (!Array.isArray(path) || !path.length) {
          character.position = null;
          character.facing = null;
          notice('Path preview unavailable: add valid waypoints.', step.id);
          continue;
        }
        let from = character.position;
        for (const [waypoint, point] of path.entries()) {
          const to = resolveMapPosition(
            point,
            [...anchors.values()],
            map.width,
            map.height,
            tileSize,
          );
          if (!to) {
            from = null;
            notice(`Waypoint ${waypoint + 1}: position is invalid or unresolved.`, step.id);
            continue;
          }
          if (from && phase === 'sequence')
            result.segments.push({
              stepId: step.id,
              number: index + 1,
              characterId,
              kind: 'move',
              from: [...from],
              to: [...to],
              waypoint: waypoint + 1,
            });
          else if (!from && phase === 'sequence')
            notice(
              `Waypoint ${waypoint + 1}: previous position unknown; showing the waypoint only.`,
              step.id,
            );
          result.placements.push({
            stepId: step.id,
            characterId,
            position: [...to],
            waypoint: waypoint + 1,
          });
          from = [...to];
        }
        character.position = from;
        character.facing = null;
        continue;
      }
      if (effect.kind === 'setCharacterPosition') {
        const position = resolveMapPosition(
          step.arguments[effect.positionParameter],
          [...anchors.values()],
          map.width,
          map.height,
          tileSize,
        );
        if (!position) {
          character.position = null;
          notice('Placement preview unavailable: invalid or unresolved map position.', step.id);
          continue;
        }
        character.position = [...position];
        result.placements.push({ stepId: step.id, characterId, position: [...character.position] });
        continue;
      }
      if (effect.kind === 'faceCharacterDirection') {
        character.facing = cardinalDirections[reference(effect.directionParameter)] ?? null;
        if (!character.facing) notice('Facing preview unavailable: unresolved direction.', step.id);
        continue;
      }
      if (effect.kind === 'moveCharacterToAnchor') {
        const anchorId = reference(effect.anchorParameter),
          anchor = anchors.get(anchorId);
        if (!anchor) {
          character.position = null;
          character.facing = null;
          notice(`Preview unavailable: missing anchor ${anchorId || '(not set)'}.`, step.id);
          continue;
        }
        if (character.position && phase === 'sequence')
          result.segments.push({
            stepId: step.id,
            number: index + 1,
            characterId,
            kind: 'move',
            from: [...character.position],
            to: [...anchor.position],
          });
        else if (!character.position && phase === 'sequence')
          notice(
            `${character.label}: starting position unknown; showing the destination only.`,
            step.id,
          );
        character.position = [...anchor.position];
        character.facing = null;
      } else {
        const targetId = reference(effect.targetCharacterParameter),
          target = characters.get(targetId);
        result.facings.push({ stepId: step.id, characterId, targetId });
        character.facing = null;
        if (!character.position || !target?.position) {
          notice(
            targetId === 'player' && !target?.position
              ? 'Player position is determined at runtime. The player marker and facing direction cannot be shown yet.'
              : `${character.label}: facing unknown because ${!character.position ? 'its' : target?.label || targetId || 'the target’s'} position is unknown.`,
            step.id,
          );
          continue;
        }
        const dx = target.position[0] - character.position[0],
          dy = target.position[1] - character.position[1],
          length = Math.hypot(dx, dy);
        if (!length) {
          notice(
            `${character.label}: facing unknown because both characters share a position.`,
            step.id,
          );
          continue;
        }
        character.facing = [dx / length, dy / length];
        result.segments.push({
          stepId: step.id,
          number: index + 1,
          characterId,
          kind: 'face',
          from: [...character.position],
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
