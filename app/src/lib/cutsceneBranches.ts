import { CUTSCENE_CONDITION_ACTION, isConditionalStep, type Cutscene, type CutsceneStep } from '../types/cutscene';

export type BranchPath = 'then' | 'else';
export function createCutsceneCondition(): CutsceneStep {
  return { id: `branch-${crypto.randomUUID()}`, action: CUTSCENE_CONDITION_ACTION,
    arguments: { condition: '' }, then: [], else: [] };
}

export function allSequenceSteps(sequence: readonly CutsceneStep[]): CutsceneStep[] {
  return sequence.flatMap((step) => isConditionalStep(step)
    ? [step, ...(step.then ?? []), ...(step.else ?? [])] : [step]);
}

export function allCutsceneSteps(scene: Cutscene): CutsceneStep[] {
  return [...(scene.onStart ?? []), ...allSequenceSteps(scene.sequence), ...scene.onComplete.steps];
}

/** Locate the owning list so all existing argument editors/history work for path steps too. */
export function cutsceneStepList(scene: Cutscene, id: string): CutsceneStep[] | undefined {
  for (const list of [scene.onStart ?? [], scene.sequence, scene.onComplete.steps]) {
    if (list.some((step) => step.id === id)) return list;
  }
  for (const branch of scene.sequence.filter(isConditionalStep))
    for (const list of [branch.then ?? [], branch.else ?? []])
      if (list.some((step) => step.id === id)) return list;
}

export function previewSequence(sequence: readonly CutsceneStep[], choices: Record<string, BranchPath> = {}, selectedId?: string) {
  return sequence.flatMap((step) => {
    if (!isConditionalStep(step)) return [step];
    const path = step.then?.some((child) => child.id === selectedId) ? 'then'
      : step.else?.some((child) => child.id === selectedId) ? 'else' : choices[step.id] ?? 'then';
    return [step, ...(step[path] ?? [])];
  });
}

export function duplicateCutsceneStep(step: CutsceneStep): CutsceneStep {
  const copy = structuredClone(step);
  copy.id = `step-${crypto.randomUUID()}`;
  for (const child of [...(copy.then ?? []), ...(copy.else ?? [])]) child.id = `step-${crypto.randomUUID()}`;
  return copy;
}
