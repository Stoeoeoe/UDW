import { useCallback, useLayoutEffect, useState } from 'react';
import {
  applyNodeChanges,
  ReactFlow,
  type Node,
  type NodeChange,
  type ReactFlowProps,
} from '@xyflow/react';

/** Keep measurements and live drag positions local; authored edits are committed by the workspace. */
export function GraphCanvas<N extends Node>({
  nodes = [],
  onNodesChange,
  ...props
}: ReactFlowProps<N>) {
  const [liveNodes, setLiveNodes] = useState(nodes);
  useLayoutEffect(() => {
    setLiveNodes((previous) => {
      const byId = new Map(previous.map((node) => [node.id, node]));
      return nodes.map((node) => {
        const current = byId.get(node.id);
        return current
          ? {
              ...node,
              measured: current.measured,
              dragging: current.dragging,
              position: current.dragging ? current.position : node.position,
            }
          : node;
      });
    });
  }, [nodes]);
  const changeNodes = useCallback(
    (changes: NodeChange<N>[]) => {
      // Dimensions are essential: dropping them resets React Flow's initialization on every drag.
      setLiveNodes((previous) => applyNodeChanges(changes, previous));
      onNodesChange?.(changes);
    },
    [onNodesChange],
  );
  return <ReactFlow {...props} nodes={liveNodes} onNodesChange={changeNodes} />;
}
