import { describe, expect, it } from 'vitest';
import {
  actionsForCutscenePhase,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import unityBindings from './__fixtures__/unity-bindings-v2.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const method = unityBindings.modules
  .find((module) => module.path === 'Cutscene')!
  .methods.find((method) => method.name === 'RunLua')!;
const actions = readCutsceneActions(unityBindings);
const map = {
  id: prototype.mapId,
  width: 32,
  height: 24,
  entities: [],
  layers: [],
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [], dialogueIds: [] };
const source = (code: string) =>
  parseCutscene({
    ...prototype,
    onComplete: { steps: [], characterPlacements: [] },
    sequence: [{ id: 'script', action: method.action.id, arguments: { code } }],
  });

describe('cutscene Lua blocks', () => {
  it('preserves multiline Lua including quotes and backslashes without executing it during validation', () => {
    const code = 'local path = "C:\\\\game"\nerror("must not execute while editing")';
    const scene = source(code);
    expect(validateCutscene(scene, actions, refs)).toEqual([]);
    expect(exportCutscene(scene, actions, refs).sequence[0].arguments.code).toBe(code);
    expect(parseCutscene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  });
  it.each(['local =', 'if true then', 'end'])('rejects syntax errors before saving: %s', (code) => {
    const scene = source(code);
    expect(
      validateCutscene(scene, actions, refs).some((issue) =>
        issue.message.includes('Lua syntax error'),
      ),
    ).toBe(true);
    expect(() => exportCutscene(scene, actions, refs)).toThrow();
  });
  it('offers script blocks only in the phase declared by metadata and treats spatial effects as unknown', () => {
    const action = actions.find((action) => action.id === method.action.id)!;
    expect(actionsForCutscenePhase(actions, 'sequence')).toContain(action);
    expect(actionsForCutscenePhase(actions, 'setup')).not.toContain(action);
    expect(actionsForCutscenePhase(actions, 'completion')).not.toContain(action);
    const preview = previewCutscene(
      source('local x = 1'),
      map,
      [],
      actions,
      { kind: 'step', id: 'script' },
      [],
      16,
    );
    expect(preview.characters.every((character) => character.position === null)).toBe(true);
    expect(
      preview.notices.some((notice) => notice.message.includes('Spatial state is unknown')),
    ).toBe(true);
  });
});
