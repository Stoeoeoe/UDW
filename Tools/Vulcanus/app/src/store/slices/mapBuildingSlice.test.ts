import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useEditorStore } from '../useEditorStore';
import { farmhouse } from '../../lib/buildings/farmhouse.fixture';
import { buildingLayer, testMap } from '../../lib/buildings/mapPlacement.fixture';

enableMapSet();

vi.mock('../../lib/recentProjects', () => ({
  recentProjects: { add: vi.fn(), get: vi.fn(() => []), remove: vi.fn() },
}));

const placed = () => useEditorStore.getState().currentMap!.layers[0].buildings;

describe('buildings on the current map', () => {
  beforeEach(() => {
    const map = testMap('test:farm', [buildingLayer()]);
    useEditorStore.setState({
      maps: [map],
      currentMap: map,
      activeVariationId: null,
      buildings: [farmhouse()],
      selectedBuildingInstanceId: null,
    });
  });

  it('places, moves and removes a building, selecting the placed one', () => {
    const { placeBuilding, moveBuilding, removeBuilding } = useEditorStore.getState();
    expect(placeBuilding('buildings', 'test:farmhouse', 4, 6)).toBeNull();
    const [instance] = placed()!;
    expect(instance).toMatchObject({ buildingId: 'test:farmhouse', x: 4, y: 6 });
    expect(useEditorStore.getState().selectedBuildingInstanceId).toBe(instance.id);

    moveBuilding('buildings', instance.id, 10, 12);
    expect(placed()![0]).toMatchObject({ x: 10, y: 12 });

    removeBuilding('buildings', instance.id);
    expect(placed()).toEqual([]);
    expect(useEditorStore.getState().selectedBuildingInstanceId).toBeNull();
  });

  it('refuses a second placement of a building with an interior, and placing in a variation', () => {
    useEditorStore.setState({
      buildings: [{ ...farmhouse(), interiorMapId: 'test:farmhouse_inside' }],
    });
    const { placeBuilding } = useEditorStore.getState();
    expect(placeBuilding('buildings', 'test:farmhouse', 4, 6)).toBeNull();
    expect(placeBuilding('buildings', 'test:farmhouse', 20, 6)).toBe(
      'Farmhouse is already placed on farm. A building with an interior can be placed once.',
    );

    useEditorStore.setState({ activeVariationId: 'winter' });
    expect(useEditorStore.getState().placeBuilding('buildings', 'test:farmhouse', 20, 6)).toBe(
      'Buildings are placed on the base map, not in a variation.',
    );
    expect(placed()).toHaveLength(1);
  });
});
