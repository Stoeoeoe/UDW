import { useMemo, useState } from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import {
  FiDroplet,
  FiLogIn,
  FiMinusSquare,
  FiMousePointer,
  FiSquare,
  FiWind,
  FiZoomIn,
  FiZoomOut,
} from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';
import { buildingIssues } from '../../../store/slices/buildingSlice';
import { SplitEditorCanvas } from '../../common/SplitEditorCanvas';
import { ToolbarToggleButton } from '../../common/Toolbar';
import { EditorHeaderActions, EditorValidationStatus } from '../../common/EditorDocumentFrame';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { PlanCanvas, type PlanSelection, type PlanTool } from './PlanCanvas';
import { BuildingPreview } from './BuildingPreview';
import { BuildingInspector } from './BuildingInspector';
import type { Building } from '../../../types/building';

const TOOLS: { tool: PlanTool; label: string; key: string; icon: React.ReactElement }[] = [
  { tool: 'select', label: 'Select (V)', key: 'v', icon: <FiMousePointer /> },
  { tool: 'wall', label: 'Draw wall (W)', key: 'w', icon: <FiSquare /> },
  { tool: 'erase', label: 'Erase wall (E)', key: 'e', icon: <FiMinusSquare /> },
  { tool: 'door', label: 'Door (D)', key: 'd', icon: <FiLogIn /> },
  { tool: 'window', label: 'Window (N)', key: 'n', icon: <FiWind /> },
  { tool: 'chimney', label: 'Chimney (C)', key: 'c', icon: <FiDroplet /> },
];

export function BuildingEditor({ buildingId }: { buildingId: string }) {
  const building = useEditorStore((state) =>
    state.buildings.find((entry) => entry.id === buildingId),
  );
  return building ? (
    <BuildingWorkspace key={buildingId} building={building} />
  ) : (
    <Text p={6}>Building not found.</Text>
  );
}

function BuildingWorkspace({ building }: { building: Building }) {
  const update = useEditorStore((state) => state.updateBuilding);
  const kits = useEditorStore((state) => state.buildingKits);
  const resolved = useResolvedKitsStore((state) => state.kits[building.kit]);
  const kit = resolved?.status === 'ready' ? resolved.kit : null;
  const [tool, setTool] = useState<PlanTool>('select');
  const [scale, setScale] = useState(3);
  const [selection, setSelection] = useState<PlanSelection>(null);
  const issues = useMemo(
    () => buildingIssues(building, kits, resolved),
    [building, kits, resolved],
  );
  const defaultFloor = kit?.floors[0] ?? 'floor_boards';
  const change = (next: Building) => update(building.id, next);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return; // Typing in a field.
    const shortcut = TOOLS.find((entry) => entry.key === event.key.toLowerCase());
    if (shortcut && !event.ctrlKey && !event.metaKey) setTool(shortcut.tool);
    if (event.key === 'Delete' && selection?.kind === 'opening') {
      change({ ...building, openings: building.openings.filter((o) => o.id !== selection.id) });
      setSelection(null);
    }
    if (event.key === 'Delete' && selection?.kind === 'chimney') {
      change({ ...building, chimney: undefined });
      setSelection(null);
    }
  };

  const plan = (
    <Flex direction="column" h="full" tabIndex={0} onKeyDown={onKeyDown} outline="none">
      <HStack px={4} pt={3} spacing={1}>
        {TOOLS.map((entry) => (
          <ToolbarToggleButton
            key={entry.tool}
            label={entry.label}
            icon={entry.icon}
            isActive={tool === entry.tool}
            onClick={() => setTool(entry.tool)}
          />
        ))}
        <Box flex={1} />
        <ToolbarToggleButton
          label="Zoom out"
          icon={<FiZoomOut />}
          isDisabled={scale <= 2}
          onClick={() => setScale(scale - 1)}
        />
        <ToolbarToggleButton
          label="Zoom in"
          icon={<FiZoomIn />}
          isDisabled={scale >= 6}
          onClick={() => setScale(scale + 1)}
        />
      </HStack>
      <Box flex={1} overflow="auto">
        <PlanCanvas
          building={building}
          kit={kit}
          issues={issues}
          tool={tool}
          scale={scale}
          selection={selection}
          defaultFloor={defaultFloor}
          onChange={change}
          onSelect={setSelection}
        />
      </Box>
    </Flex>
  );

  return (
    <>
      <EditorHeaderActions>
        <EditorValidationStatus
          errors={issues.map((issue) => issue.message)}
          onClick={() => setSelection(null)}
        />
      </EditorHeaderActions>
      <ResizableEditorLayout
        viewportBackground={false}
        rightPanelDefaultSize={26}
        rightPanelMinSize={20}
        content={
          <SplitEditorCanvas
            primary={plan}
            preview={<BuildingPreview building={building} kit={kit} />}
            primaryLabel="Plan"
            previewLabel="Preview"
          />
        }
        rightPanel={
          <BuildingInspector
            building={building}
            kits={kits}
            kit={kit}
            issues={issues}
            selection={selection}
            defaultFloor={defaultFloor}
            onChange={change}
            onSelect={setSelection}
          />
        }
      />
    </>
  );
}
