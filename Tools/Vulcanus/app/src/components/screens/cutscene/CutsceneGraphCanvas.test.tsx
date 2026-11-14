import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CutsceneGraphCanvas } from './CutsceneGraphCanvas';
import type { GraphViewNode } from './CutsceneGraphNode';

const capture = vi.hoisted(() => ({ props: {} as any }));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  ReactFlow: (props: unknown) => {
    capture.props = props;
    return null;
  },
}));
afterEach(cleanup);

it('retains measured dimensions and active drag positions across authored updates', () => {
  const node: GraphViewNode = {
    id: 'wait',
    type: 'cutscene',
    position: { x: 0, y: 0 },
    data: {
      authored: {
        id: 'wait',
        kind: 'action',
        position: { x: 0, y: 0 },
        step: { id: 'wait', action: 'cutscene.wait', arguments: { seconds: 1 } },
      },
      incoming: [],
      tracks: 2,
      options: {},
    },
  };
  const onChange = vi.fn();
  const view = render(<CutsceneGraphCanvas nodes={[node]} onNodesChange={onChange} />);
  act(() =>
    capture.props.onNodesChange([
      { id: node.id, type: 'dimensions', dimensions: { width: 300, height: 180 } },
      { id: node.id, type: 'position', position: { x: 50, y: 20 }, dragging: true },
    ]),
  );
  view.rerender(
    <CutsceneGraphCanvas nodes={[{ ...node, selected: true }]} onNodesChange={onChange} />,
  );
  expect(capture.props.nodes[0]).toMatchObject({
    measured: { width: 300, height: 180 },
    position: { x: 50, y: 20 },
    selected: true,
  });
  act(() =>
    capture.props.onNodesChange([
      { id: node.id, type: 'position', position: { x: 80, y: 40 }, dragging: false },
    ]),
  );
  view.rerender(
    <CutsceneGraphCanvas
      nodes={[{ ...node, position: { x: 80, y: 40 } }]}
      onNodesChange={onChange}
    />,
  );
  expect(capture.props.nodes[0]).toMatchObject({
    measured: { width: 300, height: 180 },
    position: { x: 80, y: 40 },
    dragging: false,
  });
  expect(onChange).toHaveBeenCalledTimes(2);
});
