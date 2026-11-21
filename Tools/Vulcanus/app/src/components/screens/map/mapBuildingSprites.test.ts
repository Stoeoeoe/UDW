import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';
import { farmhouse } from '../../../lib/buildings/farmhouse.fixture';
import { buildingLayer } from '../../../lib/buildings/mapPlacement.fixture';
import { buildingLayerView } from './mapBuildingSprites';

describe('building layer view', () => {
  beforeEach(() => {
    useEditorStore.setState({ buildings: [farmhouse(), { ...farmhouse(), id: 'test:shed' }] });
    useResolvedKitsStore.setState({ kits: {}, sources: {} });
  });

  it('draws each building from its image top, 4 rows above the footprint, back to front', () => {
    const view = buildingLayerView(
      buildingLayer([
        { id: 'front', buildingId: 'test:farmhouse', x: 4, y: 10 },
        { id: 'back', buildingId: 'test:shed', x: 2, y: 6 },
      ]),
      [],
      null,
      16,
    );
    expect(view.children.map((child) => [child.x, child.y])).toEqual([
      [2 * 16, 2 * 16],
      [4 * 16, 6 * 16],
    ]);
  });
});
