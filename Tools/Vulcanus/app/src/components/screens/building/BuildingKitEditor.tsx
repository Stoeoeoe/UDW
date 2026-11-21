import { FiLayers } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { EmptyScreen } from '../common/EmptyScreen';

/** Placeholder until the kit editor (phase 1 of docs/building-editor-plan.md) shows the kit's pieces. */
export function BuildingKitEditor({ kitId }: { kitId: string }) {
  const kit = useEditorStore((state) => state.buildingKits.find((entry) => entry.id === kitId));
  return (
    <EmptyScreen
      icon={<FiLayers />}
      title={kit ? kit.name : 'Kit not found'}
      description={kit ? `Base sheet: ${kit.source || 'none yet'}` : kitId}
    />
  );
}
