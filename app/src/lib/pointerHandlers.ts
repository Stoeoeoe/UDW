import { resolveEntities, resolveTileAt } from './mapUtils';
import { DEFAULT_TILE_SIZE } from '../config/constants';

export function createPointerHandlers(params: {
  viewport: any;
  refs: {
    isDrawingRef: any;
    drawStartRef: any;
    lineAnchorRef: any;
    isSamplingRef: any;
    sampleStartRef: any;
    lastTerrainPaintRef: any;
    terrainGridRef: any;
  };
  getState: () => any;
  actions: any;
  helpers: any;
}) {
  const { viewport, refs, getState, actions, helpers } = params;

  const handlePointerDown = (e: PointerEvent) => {
    // delegate to provided helper which encapsulates logic
    helpers.onPointerDown({ e, viewport, refs, getState, actions });
  };

  const handlePointerMove = (e: PointerEvent) => {
    helpers.onPointerMove({ e, viewport, refs, getState, actions });
  };

  const handlePointerUp = (e: PointerEvent) => {
    helpers.onPointerUp({ e, viewport, refs, getState, actions });
  };

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
