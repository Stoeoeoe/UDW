import { describe, expect, it } from 'vitest';
import { getManifestActions, parseScriptingManifest } from './scriptingManifest';
import { exportCutscene, parseCutscene, validateCutscene } from './cutscenes';
import { previewCutscene } from './cutscenePreview';
import bindings from './__fixtures__/cutscene-bindings.json';
import prototype from './__fixtures__/prototype.v2.runtime.cutscene.json';
import type { Map as GameMap } from '../types/schema';

const manifest = parseScriptingManifest(bindings);
const actions = getManifestActions(manifest, 'cutscene');
const map = { id: prototype.mapId, layers: [], entities: [] } as unknown as GameMap;
const refs = { maps: [map], entityTypes: [], dialogueIds: [], resources: manifest.resources };
const source = () =>
  parseCutscene({
    ...prototype,
    onComplete: { steps: [], actorPlacements: [] },
    sequence: [
      {
        id: 'gesture',
        action: 'actors.playAnimation',
        arguments: { actor: 'player', animation: 'base:pass-out' },
      },
    ],
  });

describe('manifest resource catalogs', () => {
  it('loads typed resources and exports the selected resource ID as a string', () => {
    expect(manifest.resources?.animation).toContainEqual(
      expect.objectContaining({ id: 'base:pass-out', description: 'PassOut' }),
    );
    expect(validateCutscene(source(), actions, refs)).toEqual([]);
    expect(exportCutscene(source(), actions, refs).sequence[0].arguments.animation).toBe(
      'base:pass-out',
    );
  });
  it('supports arbitrary resource types and unrelated action/parameter names', () => {
    const custom = {
      ...actions.find((a) => a.id === 'actors.playAnimation')!,
      id: 'custom.select',
      parameters: [{ name: 'asset', type: 'string', resourceType: 'anyCatalog' }],
    };
    const scene = source();
    scene.sequence = [{ id: 'custom', action: custom.id, arguments: { asset: 'base:chosen' } }];
    expect(
      exportCutscene(scene, [custom], {
        ...refs,
        resources: {
          anyCatalog: [{ id: 'base:chosen', description: 'A user-facing description' }],
        },
      }).sequence[0].arguments,
    ).toEqual({ asset: 'base:chosen' });
  });
  it('reports missing catalogs and unresolved IDs without changing authored arguments', () => {
    const scene = source();
    expect(
      validateCutscene(scene, actions, { ...refs, resources: {} }).some((d) =>
        d.message.includes('Missing resource list "animation"'),
      ),
    ).toBe(true);
    expect(
      validateCutscene(scene, actions, { ...refs, resources: { animation: [] } }).some((d) =>
        d.message.includes('Missing animation resource: base:pass-out'),
      ),
    ).toBe(true);
    expect(() => exportCutscene(scene, actions, { ...refs, resources: {} })).toThrow(
      'Missing resource list',
    );
    expect(scene.sequence[0].arguments.animation).toBe('base:pass-out');
  });
  it('rejects duplicate catalog IDs rather than providing ambiguous choices', () => {
    const changed = structuredClone(bindings);
    changed.resources.animation.push(changed.resources.animation[0]);
    expect(() => parseScriptingManifest(changed)).toThrow('Duplicate resource ID');
  });
  it('honors unknown spatial state for a resource-backed action', () => {
    const scene = source();
    const result = previewCutscene(scene, map, [], actions, { kind: 'step', id: 'gesture' }, []);
    expect(result.notices.some((n) => n.message.includes('Spatial state is unknown'))).toBe(true);
    expect(result.actors.every((a) => a.position === null && a.facing === null)).toBe(true);
  });
});
