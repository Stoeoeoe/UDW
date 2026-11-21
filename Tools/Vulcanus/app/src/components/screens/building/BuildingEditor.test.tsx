import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiHome } from 'react-icons/fi';
import { theme } from '../../../theme';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';
import { EditorDocumentFrame } from '../../common/EditorDocumentFrame';
import { farmhouse } from '../../../lib/buildings/farmhouse.fixture';
import { BuildingEditor } from './BuildingEditor';
import type { Building } from '../../../types/building';

// jsdom has no canvas: every drawing call is a no-op.
beforeAll(() => {
  const context = new Proxy(
    {},
    { get: (_target, key) => (key === 'canvas' ? {} : () => undefined) },
  );
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
});

const start = (): Building => {
  const [ground] = farmhouse().floors;
  return {
    ...farmhouse(),
    floors: [{ innerWalls: [], rooms: [ground.rooms[0]], openings: [ground.openings[0]] }],
  };
};
const building = () => useEditorStore.getState().buildings[0];
const ground = () => building().floors[0];
const cell = (x: number, y: number) => ({ clientX: x * 48 + 24, clientY: y * 48 + 24 });

beforeEach(() => {
  const shell = start();
  useEditorStore.setState({
    buildings: [shell],
    savedBuildings: { [shell.id]: shell },
    buildingPast: {},
    buildingFuture: {},
    buildingKits: [{ formatVersion: 1, id: 'test:kit', name: 'Kit', source: 'kit.png' }],
  });
  useResolvedKitsStore.setState({ kits: {}, sources: {} });
});
afterEach(cleanup);

const show = () =>
  render(
    <ChakraProvider theme={theme}>
      <EditorDocumentFrame
        title="Farmhouse"
        resourceId="test:farmhouse"
        icon={FiHome}
        layout="canvas"
      >
        <BuildingEditor buildingId="test:farmhouse" />
      </EditorDocumentFrame>
    </ChakraProvider>,
  );
const plan = () => screen.getByLabelText('Building plan');
const useTool = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('building editor', () => {
  it('draws a wall that splits the room in two, and undoes it', () => {
    show();
    useTool('Draw wall (W)');
    fireEvent.pointerDown(plan(), cell(4, 1));
    fireEvent.pointerMove(plan(), cell(4, 6));
    fireEvent.pointerUp(plan(), cell(4, 6));
    expect(ground().innerWalls).toEqual([{ x: 4, y: 1, direction: 'south', length: 6 }]);
    expect(ground().rooms.map((room) => room.id)).toEqual(['kitchen', 'room-1']);

    act(() => useEditorStore.getState().undoBuilding('test:farmhouse'));
    expect(ground().innerWalls).toEqual([]);
  });

  it('says why a door cannot go somewhere, and places windows in the south wall', () => {
    show();
    useTool('Door (D)');
    fireEvent.pointerMove(plan(), cell(0, 3));
    expect(screen.getByText('Only the south wall has a door to the outside.')).toBeTruthy();
    fireEvent.pointerDown(plan(), cell(0, 3));
    expect(ground().openings).toHaveLength(1);

    useTool('Window (N)');
    fireEvent.pointerDown(plan(), cell(2, 7));
    expect(ground().openings.at(-1)).toEqual({
      id: 'window-1',
      kind: 'window',
      size: 'medium',
      x: 2,
      y: 7,
    });
    expect(screen.getByRole('button', { name: 'Delete window' })).toBeTruthy();
  });

  it('asks before a resize removes something, and lists the plan problems', () => {
    show();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const width = screen.getByLabelText('Width');
    fireEvent.change(width, { target: { value: '5' } });
    fireEvent.blur(width);
    expect(confirm).toHaveBeenCalledWith('Resizing removes door entrance. Continue?');
    expect(building().width).toBe(9);

    useTool('Draw wall (W)');
    fireEvent.pointerDown(plan(), cell(1, 3));
    fireEvent.pointerUp(plan(), cell(7, 3));
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
      'Room kitchen is 2 rows deep; rooms need at least 6 (four for the back wall, two to walk on).',
    );
    confirm.mockRestore();
  });

  it('selects a room and renames it', () => {
    show();
    fireEvent.pointerDown(plan(), cell(3, 3));
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Hall' } });
    fireEvent.blur(name);
    expect(ground().rooms[0].name).toBe('Hall');
  });

  it('adds a floor above, with stairs up to it from the floor below', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Add floor' }));
    expect(building().floors).toHaveLength(2);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
      'Ground floor needs stairs up to floor 2.',
    );

    useTool('Stairs up (S)');
    fireEvent.pointerMove(plan(), cell(2, 4));
    expect(
      screen.getByText('The top floor has no stairs up; add a floor above first.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ground floor' }));
    fireEvent.pointerDown(plan(), cell(2, 4));
    expect(ground().stairsUp).toEqual({ x: 2, y: 4 });
    expect(screen.queryAllByRole('alert')).toEqual([]);
  });
});
