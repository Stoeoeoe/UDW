import type { Cutscene, CutsceneAction, CutsceneData } from '../types/cutscene';
import type { CutsceneGraphNode, CutscenePhase } from '../types/cutsceneGraph';
import { graphSignature } from './cutsceneGraph';
import { canonicalVariableType, variableCompatible } from './cutsceneVariables';

export interface GraphTemplate {
  id: string;
  label: string;
  category: string;
  node: Omit<CutsceneGraphNode, 'id' | 'position'>;
}
/** The value a new node starts with for each parameter. */
export function defaultArguments(action: CutsceneAction) {
  return Object.fromEntries(
    action.parameters.map((p) => [
      p.name,
      p.defaultValue ??
        (p.nullable
          ? null
          : p.type === 'boolean'
            ? false
            : canonicalVariableType(p.type) === 'number'
              ? 0
              : p.type === 'position'
                ? { x: 0, y: 0 }
                : p.type === 'path'
                  ? []
                  : ''),
    ]),
  ) as Record<string, CutsceneData>;
}

export function graphTemplates(
  scene: Cutscene,
  actions: CutsceneAction[],
  phase: CutscenePhase,
): GraphTemplate[] {
  const runtimePhase =
    phase === 'onStart' ? 'setup' : phase === 'completion' ? 'completion' : 'sequence';
  const templates: GraphTemplate[] = actions
    .filter((a) => a.id.startsWith('pure:') || (a.phases ?? ['sequence']).includes(runtimePhase))
    .map((action) => ({
      id: action.id,
      label: action.displayName,
      category: action.category,
      node: action.id.startsWith('pure:')
        ? { kind: 'function', method: action.id.slice(5), arguments: defaultArguments(action) }
        : {
            kind: 'action',
            step: { id: '', action: action.id, arguments: defaultArguments(action) },
          },
    }));
  templates.push(
    ...(scene.variables ?? []).map((variable) => ({
      id: `variable:${variable.name}`,
      label: `Get ${variable.name}`,
      category: 'Variables',
      node: { kind: 'variable' as const, variable: variable.name },
    })),
  );
  templates.push(
    {
      id: 'position',
      label: 'Make position',
      category: 'Values',
      node: { kind: 'position', arguments: { x: 0, y: 0 } },
    },
    {
      id: 'expression',
      label: 'Read-only Lua expression',
      category: 'Scripting',
      node: { kind: 'expression', expression: '0', outputs: [{ name: 'value', type: 'number' }] },
    },
  );
  templates.push({
    id: 'comment',
    label: 'Comment',
    category: 'Comments',
    node: { kind: 'comment', comment: '' },
  });
  if (phase === 'sequence')
    templates.push(
      {
        id: 'lua',
        label: 'Lua script with results',
        category: 'Scripting',
        node: {
          kind: 'lua',
          expression: 'return 0',
          outputs: [{ name: 'result', type: 'number' }],
        },
      },
      {
        id: 'branch',
        label: 'If / Else',
        category: 'Flow',
        node: { kind: 'branch', arguments: { condition: false } },
      },
      {
        id: 'parallel',
        label: 'Parallel / Join',
        category: 'Flow',
        node: { kind: 'parallel', tracks: 2 },
      },
    );
  return templates;
}

/** Flat catalog results; categories narrow the list without repeated headings. */
export function filterGraphTemplates<T extends GraphTemplate>(
  choices: T[],
  query: string,
  category = '',
): T[] {
  const search = query.trim().toLowerCase();
  return choices
    .filter(
      (choice) =>
        (!category || choice.category === category) &&
        `${choice.category} ${choice.label}`.toLowerCase().includes(search),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Stable declaration order: use the first compatible pin, including repeated output types. */
export function matchingGraphTemplates(
  templates: GraphTemplate[],
  scene: Cutscene,
  actions: CutsceneAction[],
  pin: { direction: 'input' | 'output'; type: string; nullable?: boolean },
) {
  return templates.flatMap((template) => {
    const candidate = { ...template.node, id: 'candidate', position: { x: 0, y: 0 } };
    if (candidate.step) candidate.step = { ...candidate.step, id: candidate.id };
    const signature = graphSignature(candidate, scene, actions);
    const candidates = pin.direction === 'input' ? signature.outputs : signature.inputs;
    const match = candidates.find((p) =>
      pin.direction === 'input' ? variableCompatible(p, pin) : variableCompatible(pin, p),
    );
    return match ? [{ ...template, pin: match.name }] : [];
  });
}
