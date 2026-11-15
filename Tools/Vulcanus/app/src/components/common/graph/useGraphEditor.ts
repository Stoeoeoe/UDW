import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  useReactFlow,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnConnectStartParams,
  type OnConnectEnd,
} from '@xyflow/react';
import type { GraphCommand } from './GraphEditorToolbar';

/** Shared canvas gestures and commands. Editors supply authored mutations and compatible node types. */
export function useGraphEditor<N extends Node>({
  nodes,
  edges,
  disabled = false,
  run,
  move,
  finishDrag,
  insertable,
}: {
  nodes: readonly { id: string; kind: string }[];
  edges: readonly { id: string; source: string; target: string; kind: string }[];
  disabled?: boolean;
  run: (command: GraphCommand) => void;
  move: (nodes: { id: string; position: { x: number; y: number } }[]) => void;
  finishDrag: (nodes: N[], edge?: string) => void;
  insertable: (node: N) => boolean;
}) {
  const flow = useReactFlow<N>();
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<{
    x: number;
    y: number;
    position: { x: number; y: number };
    from?: OnConnectStartParams;
  }>();
  const connecting = useRef<OnConnectStartParams>();
  const droppingPin = useRef(false);
  const dragging = useRef(false);
  const wires = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const insertionTarget = useRef<string>();
  const [insertionEdge, setInsertionEdge] = useState<string>();
  const showPicker = (clientX: number, clientY: number, from?: OnConnectStartParams) => {
    if (disabled) return;
    const rect = root.current!.getBoundingClientRect();
    setPicker({
      x: Math.max(0, Math.min(rect.width - 320, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height - 410, clientY - rect.top)),
      position: flow.screenToFlowPosition({ x: clientX, y: clientY }),
      from,
    });
  };
  const clear = () => {
    setPicker(undefined);
    setSelected(new Set());
    setSelectedEdges(new Set());
  };
  const command = (cmd: GraphCommand) => {
    if (disabled && cmd !== 'fit') return;
    if (cmd === 'add') {
      const rect = root.current!.getBoundingClientRect();
      showPicker(rect.left + rect.width / 2, rect.top + 70);
    } else if (cmd === 'fit') void flow.fitView({ padding: 0.15, duration: 200 });
    else run(cmd);
  };
  const onConnectEnd: OnConnectEnd = (event, state) => {
    const from = connecting.current;
    connecting.current = undefined;
    if (disabled || state.isValid || state.toNode || !from) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    showPicker(point.clientX, point.clientY, from);
    droppingPin.current = true;
    setTimeout(() => {
      droppingPin.current = false;
    }, 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      clear();
      root.current?.focus();
      return;
    }
    if (
      (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') ||
      e.altKey
    )
      return;
    const key = e.key.toLowerCase(),
      mod = e.ctrlKey || e.metaKey;
    if (mod && key === 'a') {
      setSelected(new Set(nodes.map((n) => n.id)));
      setSelectedEdges(new Set(edges.map((e) => e.id)));
    } else {
      const cmd: GraphCommand | undefined = mod
        ? (
            {
              c: 'copy',
              v: 'paste',
              d: 'duplicate',
              z: e.shiftKey ? 'redo' : 'undo',
              y: 'redo',
            } as const
          )[key]
        : key === 'delete' || key === 'backspace'
          ? 'delete'
          : key === 'f'
            ? 'fit'
            : e.shiftKey && key === 'l'
              ? 'layout'
              : undefined;
      if (!cmd) return;
      command(cmd);
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const onPointerDownCapture = (e: PointerEvent) => {
    if (
      !(e.target as HTMLElement).closest(
        'input, textarea, select, button, [contenteditable="true"]',
      )
    )
      root.current?.focus({ preventScroll: true });
  };
  const canvasProps = {
    onConnectStart: (_: unknown, params: OnConnectStartParams) => {
      setPicker(undefined);
      connecting.current = params;
    },
    onConnectEnd,
    onPaneClick: () => {
      if (!droppingPin.current) setPicker(undefined);
    },
    onPaneContextMenu: (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault();
      showPicker(e.clientX, e.clientY);
    },
    onNodesChange: (changes: NodeChange<N>[]) => {
      const finished = changes.flatMap((c) =>
        c.type === 'position' && c.position && c.dragging === false
          ? [{ id: c.id, position: c.position }]
          : [],
      );
      if (finished.length && !dragging.current) move(finished);
      if (changes.some((c) => c.type === 'select'))
        setSelected((previous) => {
          const next = new Set(previous);
          for (const c of changes)
            if (c.type === 'select') {
              if (c.selected) next.add(c.id);
              else next.delete(c.id);
            }
          return next;
        });
    },
    onEdgesChange: (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'select'))
        setSelectedEdges((previous) => {
          const next = new Set(previous);
          for (const c of changes)
            if (c.type === 'select') {
              if (c.selected) next.add(c.id);
              else next.delete(c.id);
            }
          return next;
        });
    },
    onNodeDragStart: (_: unknown, node: N, moved: N[]) => {
      dragging.current = true;
      wires.current =
        moved.length === 1 && insertable(node)
          ? edges.flatMap((edge) => {
              if (edge.kind !== 'execution' || edge.source === node.id || edge.target === node.id)
                return [];
              const element = [
                ...root.current!.querySelectorAll<SVGGElement>('.react-flow__edge'),
              ].find((el) => el.dataset.id === edge.id);
              const path = element?.querySelector<SVGPathElement>('.react-flow__edge-path');
              if (!path) return [];
              const points = [];
              const total = path.getTotalLength();
              for (let length = 0; length <= total; length += 10) {
                const point = path.getPointAtLength(length);
                points.push({ x: point.x, y: point.y });
              }
              return [{ id: edge.id, points }];
            })
          : [];
    },
    onNodeDrag: (event: { clientX: number; clientY: number }, node: N, moved: N[]) => {
      let nearest: string | undefined;
      if (moved.length === 1 && insertable(node)) {
        const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        let distance = 28 / flow.getZoom();
        for (const edge of wires.current)
          for (const sample of edge.points) {
            const next = Math.hypot(sample.x - point.x, sample.y - point.y);
            if (next < distance) {
              distance = next;
              nearest = edge.id;
            }
          }
      }
      insertionTarget.current = nearest;
      setInsertionEdge(nearest);
    },
    onNodeDragStop: (_: unknown, __: N, moved: N[]) => {
      dragging.current = false;
      finishDrag(moved, insertionTarget.current);
      wires.current = [];
      insertionTarget.current = undefined;
      setInsertionEdge(undefined);
    },
    deleteKeyCode: null,
    nodesDraggable: !disabled,
    nodesConnectable: !disabled,
    edgesReconnectable: false,
    minZoom: 0.2,
    maxZoom: 1.8,
  };
  return {
    root,
    selected,
    setSelected,
    selectedEdges,
    setSelectedEdges,
    picker,
    setPicker,
    showPicker,
    clear,
    insertionEdge,
    canvasProps,
    rootProps: { tabIndex: 0, onKeyDown, onPointerDownCapture },
    command,
    disabled,
    hasEditableSelection:
      selectedEdges.size > 0 ||
      nodes.some((n) => selected.has(n.id) && !['entry', 'exit'].includes(n.kind)),
  };
}
