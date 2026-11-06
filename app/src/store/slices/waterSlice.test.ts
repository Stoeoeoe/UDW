import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useEditorStore } from '../useEditorStore';
import { createWaterBody } from '../../lib/waterBodies';
import { decodeWaterMask, encodeWaterMask } from '../../lib/waterMask';
import type { FlowStroke, Layer, Map as GameMap } from '../../types/schema';

enableMapSet();

vi.mock('../../lib/recentProjects', () => ({
  recentProjects: { add: vi.fn(), get: vi.fn(() => []), remove: vi.fn() },
}));
vi.mock('../../lib/fileSystem', () => ({
  fileSystem: {
    resolveFilename: (_subDir: string, filename: string) => filename,
    saveJson: vi.fn(),
    loadAllCutscenes: vi.fn(async () => []),
    readJson: vi.fn(async () => null),
    loadAllTilesets: vi.fn(async () => []),
    loadAllMaps: vi.fn(async () => []),
  },
}));

const LAYER_ID = 'water-layer';

function stroke(id: string): FlowStroke {
  return {
    id,
    points: [
      [0, 0],
      [10, 0],
    ],
    width: 8,
    speed: 1,
  };
}

function setUpWaterLayer(bitmap = new Uint8Array(16)): void {
  const layer: Layer = {
    id: LAYER_ID,
    name: 'Water',
    kind: 'water',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    waterBodies: [createWaterBody('a', 'Lake', 'Lake_1'), createWaterBody('b', 'River', 'Lake_1')],
    waterMask: encodeWaterMask(bitmap, 4, 4),
  };
  useEditorStore.setState({
    currentMap: { id: 'm', name: 'M', width: 1, height: 1, layers: [layer] } as unknown as GameMap,
    selectedWaterBodyId: null,
  });
}

const layer = (): Layer => useEditorStore.getState().currentMap!.layers[0];
const body = (id: string) => layer().waterBodies!.find((candidate) => candidate.id === id)!;

describe('waterSlice', () => {
  beforeEach(() => setUpWaterLayer());

  it('adding a body appends it and selects it', () => {
    useEditorStore.getState().addWaterBody(LAYER_ID, createWaterBody('c', 'Pond', 'Lake_1'));
    expect(layer().waterBodies!.map((candidate) => candidate.id)).toEqual(['a', 'b', 'c']);
    expect(useEditorStore.getState().selectedWaterBodyId).toBe('c');
  });

  it('refuses a 256th body, since a mask value is one byte', () => {
    for (let i = 0; i < 260; i++) {
      useEditorStore.getState().addWaterBody(LAYER_ID, createWaterBody(`x${i}`, `X${i}`, 'Lake_1'));
    }
    expect(layer().waterBodies).toHaveLength(255);
  });

  it('updates a body without touching the others', () => {
    useEditorStore
      .getState()
      .updateWaterBody(LAYER_ID, 'b', { name: 'Stream', isFreshwater: true, bankProfile: 'Mud' });
    expect(body('b')).toMatchObject({ name: 'Stream', isFreshwater: true, bankProfile: 'Mud' });
    expect(body('a').name).toBe('Lake');
  });

  it('removing a body erases its pixels and renumbers the ones after it', () => {
    // Body a covers pixels 0-1, b pixels 2-3, and a third body c pixels 4-5.
    setUpWaterLayer(new Uint8Array([1, 1, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    useEditorStore.getState().addWaterBody(LAYER_ID, createWaterBody('c', 'Pond', 'Lake_1'));
    useEditorStore.getState().selectWaterBody('b');

    useEditorStore.getState().removeWaterBody(LAYER_ID, 'b');

    expect(layer().waterBodies!.map((candidate) => candidate.id)).toEqual(['a', 'c']);
    expect(Array.from(decodeWaterMask(layer().waterMask!).slice(0, 6))).toEqual([1, 1, 0, 0, 2, 2]);
    // The selection falls to the body that took its place.
    expect(useEditorStore.getState().selectedWaterBodyId).toBe('c');
  });

  it('removing the last body clears the selection', () => {
    useEditorStore.getState().removeWaterBody(LAYER_ID, 'a');
    useEditorStore.getState().selectWaterBody('b');
    useEditorStore.getState().removeWaterBody(LAYER_ID, 'b');
    expect(layer().waterBodies).toEqual([]);
    expect(useEditorStore.getState().selectedWaterBodyId).toBeNull();
  });

  it('adds, removes and clears currents per body', () => {
    const store = useEditorStore.getState();
    store.addFlowStroke(LAYER_ID, 'a', stroke('s1'));
    store.addFlowStroke(LAYER_ID, 'a', stroke('s2'));
    store.addFlowStroke(LAYER_ID, 'b', stroke('s3'));
    expect(body('a').flow.map((s) => s.id)).toEqual(['s1', 's2']);

    store.removeFlowStroke(LAYER_ID, 'a', 's1');
    expect(body('a').flow.map((s) => s.id)).toEqual(['s2']);

    store.clearFlow(LAYER_ID, 'a');
    expect(body('a').flow).toEqual([]);
    expect(body('b').flow.map((s) => s.id)).toEqual(['s3']);
  });

  it('ignores edits aimed at a layer that is not a water layer', () => {
    useEditorStore.setState((state) => ({
      currentMap: {
        ...state.currentMap!,
        layers: [{ ...state.currentMap!.layers[0], kind: 'visual' as const }],
      },
    }));
    useEditorStore.getState().addFlowStroke(LAYER_ID, 'a', stroke('s1'));
    expect(body('a').flow).toEqual([]);
  });

  it('keeps the tool settings in range', () => {
    const store = useEditorStore.getState();
    store.setWaterFlowStrokeWidth(500);
    store.setWaterFlowSpeed(99);
    expect(useEditorStore.getState().waterFlowStrokeWidth).toBe(128);
    expect(useEditorStore.getState().waterFlowSpeed).toBe(4);
    store.setWaterFlowStrokeWidth(-3);
    store.setWaterFlowSpeed(0);
    expect(useEditorStore.getState().waterFlowStrokeWidth).toBe(2);
    expect(useEditorStore.getState().waterFlowSpeed).toBe(0.1);
  });
});
