import { FiHome } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { EmptyScreen } from '../common/EmptyScreen';

/** Placeholder until the building editor (phase 3 of docs/building-editor-plan.md) edits the plan. */
export function BuildingEditor({ buildingId }: { buildingId: string }) {
  const building = useEditorStore((state) =>
    state.buildings.find((entry) => entry.id === buildingId),
  );
  return (
    <EmptyScreen
      icon={<FiHome />}
      title={building ? building.name : 'Building not found'}
      description={
        building
          ? `${building.width} × ${building.depth} tiles, ${building.rooms.length} room(s)`
          : buildingId
      }
    />
  );
}
