import { describe, expect, it } from 'vitest';
import {
  createCutsceneStep,
  exportCutscene,
  parseCutscene,
  readCutsceneActions,
  validateCutscene,
} from './cutscenes';
import { parseScriptingManifest } from './scriptingManifest';
import { previewCutscene } from './cutscenePreview';
import bindings from './__fixtures__/unity-bindings-v2.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const actions = readCutsceneActions(bindings);
const map = {
  id: prototype.mapId,
  width: 32,
  height: 24,
  layers: [],
  entities: [],
} as unknown as GameMap;
const refs = { maps: [map], entityTypes: [], dialogueIds: [] };

describe('screen flash from the actual Unity bindings', () => {
  const flash = actions.find((action) => action.id === 'camera.flash')!;
  const source = (args: Record<string, unknown>) =>
    parseCutscene({
      ...prototype,
      onStart: [],
      onComplete: { steps: [], characterPlacements: [] },
      sequence: [{ id: 'flash', action: 'camera.flash', arguments: args }],
    });

  it('loads string and numeric defaults and uses them for new steps', () => {
    expect(flash.execution).toBe('immediate');
    expect(createCutsceneStep(flash).arguments).toEqual({
      color: '#FFFFFF',
      durationSeconds: 1.1,
      easeInSeconds: 0.05,
      holdSeconds: 1,
      easeOutSeconds: 0.05,
    });
  });

  it.each([{}, { color: '#FF0000', durationSeconds: 0.4 }, { holdSeconds: 0 }])(
    'preserves omitted defaults when validating and exporting %j',
    (args) => {
      const scene = source(args);
      expect(validateCutscene(scene, actions, refs)).toEqual([]);
      expect(exportCutscene(scene, actions, refs).sequence[0].arguments).toEqual(args);
      expect(
        previewCutscene(scene, map, [], actions, { kind: 'step', id: 'flash' }, [], 16).notices,
      ).toEqual([]);
    },
  );

  it.each([{ color: 12 }, { durationSeconds: '1.1' }, { durationSeconds: null }])(
    'rejects explicitly supplied values with incorrect types: %j',
    (args) => {
      const scene = source(args);
      expect(validateCutscene(scene, actions, refs).length).toBeGreaterThan(0);
      expect(() => exportCutscene(scene, actions, refs)).toThrow();
    },
  );

  it.each([true, '#FFFFFF', null, undefined])('rejects invalid numeric defaults: %j', (value) => {
    const manifest = structuredClone(bindings);
    const parameter = manifest.modules
      .find((module) => module.path === 'Camera')!
      .methods.find((method) => method.name === 'Flash')!
      .parameters.find((parameter) => parameter.name === 'durationSeconds')!;
    Object.assign(parameter, { defaultValue: value });
    expect(() => parseScriptingManifest(manifest)).toThrow(/default/i);
  });
});

describe('screen shake from the actual Unity bindings', () => {
  it('round-trips numeric parameters and keeps character preview state unchanged', () => {
    const scene = parseCutscene({
      ...prototype,
      onStart: [],
      onComplete: { steps: [], characterPlacements: [] },
      sequence: [
        { id: 'shake', action: 'camera.shake', arguments: { durationSeconds: 0.5, strength: 0.1 } },
      ],
    });
    expect(validateCutscene(scene, actions, refs)).toEqual([]);
    expect(exportCutscene(scene, actions, refs).sequence).toEqual(scene.sequence);
    expect(actions.find((action) => action.id === 'camera.shake')?.execution).toBe('immediate');
    const preview = previewCutscene(scene, map, [], actions, { kind: 'step', id: 'shake' }, [], 16);
    expect(preview.notices).toEqual([]);
  });
});
