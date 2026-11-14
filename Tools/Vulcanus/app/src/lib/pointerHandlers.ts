interface PointerHelperArgs {
  e: PointerEvent;
  viewport: unknown;
  refs: Record<string, unknown>;
  getState: () => unknown;
  actions: unknown;
}

interface PointerHelpers {
  onPointerDown: (args: PointerHelperArgs) => void;
  onPointerMove: (args: PointerHelperArgs) => void;
  onPointerUp: (args: PointerHelperArgs) => void;
}

export function createPointerHandlers(params: {
  viewport: unknown;
  refs: Record<string, unknown>;
  getState: () => unknown;
  actions: unknown;
  helpers: PointerHelpers;
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
