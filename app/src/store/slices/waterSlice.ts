import { StateCreator } from 'zustand';
import type { FlowStroke, Layer, WaterBodyDef } from '../../types/schema';
import { decodeWaterMask, encodeWaterMask, removeBodyFromBitmap } from '../../lib/waterMask';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export type WaterBodyPatch = Partial<
  Pick<WaterBodyDef, 'name' | 'waterType' | 'isFreshwater' | 'bankProfile'>
>;

export interface WaterSlice {
  /** The body the brush paints and flow strokes attach to. Editor state, not saved or undoable. */
  selectedWaterBodyId: string | null;
  /** Influence radius, in map pixels, of newly drawn flow strokes. */
  waterFlowStrokeWidth: number;
  /** Relative speed of newly drawn flow strokes. */
  waterFlowSpeed: number;
  /** The flow stroke being dragged out, for the live preview. */
  waterStrokePreview: [number, number][] | null;

  selectWaterBody: (bodyId: string | null) => void;
  setWaterFlowStrokeWidth: (width: number) => void;
  setWaterFlowSpeed: (speed: number) => void;
  setWaterStrokePreview: (points: [number, number][] | null) => void;

  addWaterBody: (layerId: string, body: WaterBodyDef) => void;
  updateWaterBody: (layerId: string, bodyId: string, patch: WaterBodyPatch) => void;
  removeWaterBody: (layerId: string, bodyId: string) => void;
  addFlowStroke: (layerId: string, bodyId: string, stroke: FlowStroke) => void;
  removeFlowStroke: (layerId: string, bodyId: string, strokeId: string) => void;
  clearFlow: (layerId: string, bodyId: string) => void;
}

type MapState = Pick<EditorStore, 'currentMap'>;

function findWaterLayer(state: MapState, layerId: string): Layer | undefined {
  const layer = state.currentMap?.layers.find((candidate) => candidate.id === layerId);
  return layer?.kind === 'water' ? layer : undefined;
}

function findBody(state: MapState, layerId: string, bodyId: string): WaterBodyDef | undefined {
  return findWaterLayer(state, layerId)?.waterBodies?.find((body) => body.id === bodyId);
}

export const createWaterSlice: ImmerStateCreator<WaterSlice> = (set) => ({
  selectedWaterBodyId: null,
  waterFlowStrokeWidth: 24,
  waterFlowSpeed: 1,
  waterStrokePreview: null,

  selectWaterBody: (bodyId) =>
    set((state) => {
      state.selectedWaterBodyId = bodyId;
    }),
  setWaterFlowStrokeWidth: (width) =>
    set((state) => {
      state.waterFlowStrokeWidth = Math.max(2, Math.min(128, Math.round(width)));
    }),
  setWaterFlowSpeed: (speed) =>
    set((state) => {
      state.waterFlowSpeed = Math.max(0.1, Math.min(4, speed));
    }),
  setWaterStrokePreview: (points) =>
    set((state) => {
      state.waterStrokePreview = points;
    }),

  addWaterBody: (layerId, body) =>
    set((state) => {
      const layer = findWaterLayer(state, layerId);
      if (!layer) return;
      // The mask stores a body as one byte, so a layer holds at most 255 of them.
      if ((layer.waterBodies?.length ?? 0) >= 255) return;
      (layer.waterBodies ??= []).push(body);
      state.selectedWaterBodyId = body.id;
    }),

  updateWaterBody: (layerId, bodyId, patch) =>
    set((state) => {
      const body = findBody(state, layerId, bodyId);
      if (body) Object.assign(body, patch);
    }),

  removeWaterBody: (layerId, bodyId) =>
    set((state) => {
      const layer = findWaterLayer(state, layerId);
      const index = layer?.waterBodies?.findIndex((body) => body.id === bodyId) ?? -1;
      if (!layer?.waterBodies || !layer.waterMask || index < 0) return;
      // Its pixels become empty and the bodies after it shift down one value.
      const bitmap = decodeWaterMask(layer.waterMask);
      removeBodyFromBitmap(bitmap, index + 1);
      layer.waterMask = encodeWaterMask(bitmap, layer.waterMask.width, layer.waterMask.height);
      layer.waterBodies.splice(index, 1);
      if (state.selectedWaterBodyId === bodyId) {
        state.selectedWaterBodyId =
          layer.waterBodies[Math.min(index, layer.waterBodies.length - 1)]?.id ?? null;
      }
    }),

  addFlowStroke: (layerId, bodyId, stroke) =>
    set((state) => {
      findBody(state, layerId, bodyId)?.flow.push(stroke);
    }),

  removeFlowStroke: (layerId, bodyId, strokeId) =>
    set((state) => {
      const body = findBody(state, layerId, bodyId);
      if (body) body.flow = body.flow.filter((stroke) => stroke.id !== strokeId);
    }),

  clearFlow: (layerId, bodyId) =>
    set((state) => {
      const body = findBody(state, layerId, bodyId);
      if (body) body.flow = [];
    }),
});
