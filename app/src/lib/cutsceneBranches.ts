import {
  CUTSCENE_CONDITION_ACTION,
  CUTSCENE_PARALLEL_ACTION,
  isConditionalStep,
  isParallelStep,
  type Cutscene,
  type CutsceneStep,
} from '../types/cutscene';

export type BranchPath = 'then' | 'else';
export function createCutsceneCondition(): CutsceneStep {
  return {
    id: `branch-${crypto.randomUUID()}`,
    action: CUTSCENE_CONDITION_ACTION,
    arguments: { condition: '' },
    then: [],
    else: [],
  };
}

export function createCutsceneParallel(): CutsceneStep {
  return {
    id: `parallel-${crypto.randomUUID()}`,
    action: CUTSCENE_PARALLEL_ACTION,
    arguments: {},
    tracks: [[], []],
  };
}

export function cutsceneChildLists(step: CutsceneStep): CutsceneStep[][] {
  if (isParallelStep(step)) return step.tracks ?? [];
  return isConditionalStep(step) ? [step.then ?? [], step.else ?? []] : [];
}

export function allSequenceSteps(sequence: readonly CutsceneStep[]): CutsceneStep[] {
  return sequence.flatMap((step) => [step, ...cutsceneChildLists(step).flatMap(allSequenceSteps)]);
}

export function allCutsceneSteps(scene: Cutscene): CutsceneStep[] {
  return [...(scene.onStart ?? []), ...allSequenceSteps(scene.sequence), ...scene.onComplete.steps];
}

/** Locate the owning list so all existing argument editors/history work for path steps too. */
export function cutsceneStepList(scene: Cutscene, id: string): CutsceneStep[] | undefined {
  for (const list of [scene.onStart ?? [], scene.sequence, scene.onComplete.steps]) {
    if (list.some((step) => step.id === id)) return list;
  }
  for (const branch of allSequenceSteps(scene.sequence))
    for (const list of cutsceneChildLists(branch))
      if (list.some((step) => step.id === id)) return list;
}

export function previewSequence(
  sequence: readonly CutsceneStep[],
  choices: Record<string, BranchPath> = {},
  selectedId?: string,
) {
  return sequence.flatMap((step) => {
    // The preview handles parallel blocks explicitly; flattening would invent timing.
    if (isParallelStep(step)) return [step];
    if (!isConditionalStep(step)) return [step];
    const path = step.then?.some((child) => child.id === selectedId)
      ? 'then'
      : step.else?.some((child) => child.id === selectedId)
        ? 'else'
        : (choices[step.id] ?? 'then');
    return [step, ...(step[path] ?? [])];
  });
}

export function duplicateCutsceneStep(step: CutsceneStep): CutsceneStep {
  const copy = structuredClone(step);
  copy.id = `step-${crypto.randomUUID()}`;
  for (const child of allSequenceSteps(cutsceneChildLists(copy).flat()))
    child.id = `step-${crypto.randomUUID()}`;
  return copy;
}
