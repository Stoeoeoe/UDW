import { useState } from 'react';
import { Button, Text, VStack } from '@chakra-ui/react';
import { FcSearch } from 'react-icons/fc';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { createEditorResourceDocument } from '../../lib/editorResourceTypes';
import { objectSize, objectTilesFromSheet } from '../../lib/objects';
import { CreateItemDialog } from '../common/CreateItemDialog';
import { SectionLabel } from '../common/Typography.tsx';
import { InspectorEmptyState } from '../screens';
import type { Tileset } from '../../types/schema';

/**
 * The tileset editor's objects mode: open an object made from this tileset, or make one from the selected tiles.
 * Objects are their own resources; they are edited in the object editor.
 */
export function TilesetObjectsPanel({ tileset }: { tileset: Tileset }) {
  const objects = useEditorStore((state) => state.objects);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const addObject = useEditorStore((state) => state.addObject);
  const setSelectedObject = useEditorStore((state) => state.setSelectedObject);
  const idPrefix = useEditorStore((state) => state.project?.idPrefix ?? 'base');
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const [creating, setCreating] = useState(false);

  const selected = objects.find(
    (object) => object.id === selectedObjectId && object.tilesetId === tileset.id,
  );
  const open = (id: string, name: string) =>
    openDocument(createEditorResourceDocument({ type: 'object', id, name }), { pin: true });

  return (
    <VStack align="stretch" spacing={6} p={6}>
      <SectionLabel textStyle="panelLabel">Objects</SectionLabel>
      {selected ? (
        <VStack align="stretch" spacing={3}>
          <VStack align="start" spacing={1}>
            <Text fontSize="2xl" fontWeight="black" color="white">
              {selected.name}
            </Text>
            <SectionLabel fontWeight="normal">{selected.id}</SectionLabel>
          </VStack>
          <Text fontSize="sm" color="editorMutedText">
            {objectSize(selected.tiles).width} × {objectSize(selected.tiles).height} tiles
          </Text>
          <Button size="sm" colorScheme="blue" onClick={() => open(selected.id, selected.name)}>
            Open object
          </Button>
        </VStack>
      ) : selectedTileIndices.length > 0 ? (
        <Button size="sm" colorScheme="blue" onClick={() => setCreating(true)}>
          Create object from selection
        </Button>
      ) : (
        <InspectorEmptyState
          icon={FcSearch}
          message="No object selected"
          hint="Drag over tiles to make an object from them, or click an object to open it"
        />
      )}
      {creating && (
        <CreateItemDialog
          isOpen
          title="New Object"
          itemType="Object"
          idPrefix={idPrefix}
          existingIds={objects.map((object) => object.id)}
          onClose={() => setCreating(false)}
          onSubmit={async ({ id, name }) => {
            await addObject({
              formatVersion: 1,
              id,
              name,
              tilesetId: tileset.id,
              tiles: objectTilesFromSheet(selectedTileIndices, tileset.columns),
              folderPath: '',
            });
            setCreating(false);
            setSelectedObject(id);
            open(id, name);
          }}
        />
      )}
    </VStack>
  );
}
