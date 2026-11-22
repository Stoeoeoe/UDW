import { useMemo } from 'react';
import { HStack, Text, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { objectSize, objectTilesFromSheet, projectTags } from '../../../lib/objects';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { InspectorShell } from '../../common/InspectorShell';
import { CompactInput, CompactSelect, CompactTextarea, Field } from '../../common/Fields';
import { CaptionText, SectionLabel } from '../../common/Typography';
import { TagsField } from '../../common/TagsField';
import { ObjectPreview, ObjectSheetPicker } from './ObjectCanvases';
import { isSeasonTwin } from '../../../lib/seasons';
import type { ObjectDefinition } from '../../../types/object';

export function ObjectEditor({ objectId }: { objectId: string }) {
  const object = useEditorStore((state) => state.objects.find((entry) => entry.id === objectId));
  return object ? (
    <ObjectWorkspace key={objectId} object={object} />
  ) : (
    <Text p={6}>Object not found.</Text>
  );
}

function ObjectWorkspace({ object }: { object: ObjectDefinition }) {
  const update = useEditorStore((state) => state.updateObject);
  const tilesets = useEditorStore((state) => state.tilesets);
  const objects = useEditorStore((state) => state.objects);
  const sprites = useEditorStore((state) => state.loadedSprites);
  const tileSize = useEditorStore((state) => state.project?.tileSize ?? 16);
  const tileset = tilesets.get(object.tilesetId);
  const sprite = tileset ? sprites.get(tileset.spriteSheet) : undefined;
  const size = objectSize(object.tiles);
  const suggestions = useMemo(() => projectTags(objects, tilesets.values()), [objects, tilesets]);
  const selected = useMemo(
    () => new Set(object.tiles.map((tile) => tile.tileIndex)),
    [object.tiles],
  );

  const content = (
    <VStack align="stretch" spacing={5} p={6} h="full" overflowY="auto" bg="editorCanvasBg">
      <VStack align="stretch" spacing={2}>
        <SectionLabel>Object</SectionLabel>
        {tileset && sprite && object.tiles.length ? (
          <ObjectPreview
            tiles={object.tiles}
            tileset={tileset}
            sprite={sprite}
            tileSize={tileSize}
          />
        ) : (
          <CaptionText>Pick the object's tiles on the sheet below.</CaptionText>
        )}
      </VStack>
      <VStack align="stretch" spacing={2}>
        <SectionLabel>{tileset ? tileset.name : 'Tileset'}</SectionLabel>
        <CaptionText>
          Drag over the sheet to choose the object's tiles. Hold Shift to add to them, or
          Shift-click a chosen tile to remove it.
        </CaptionText>
        {!tileset ? (
          <Text role="alert" color="editorDangerText">
            Tileset {object.tilesetId} is not in the project.
          </Text>
        ) : !sprite ? (
          <Text color="editorMutedText">Loading the sheet…</Text>
        ) : (
          <ObjectSheetPicker
            tileset={tileset}
            sprite={sprite}
            tileSize={tileSize}
            selected={selected}
            onChange={(indices) =>
              update(object.id, { tiles: objectTilesFromSheet(indices, tileset.columns) })
            }
          />
        )}
      </VStack>
    </VStack>
  );

  const inspector = (
    <InspectorShell title="Object" subtitle={object.id}>
      <Field label="Name">
        <CompactInput
          value={object.name}
          onChange={(e) => update(object.id, { name: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <CompactTextarea
          rows={3}
          value={object.description ?? ''}
          onChange={(e) => update(object.id, { description: e.target.value || undefined })}
        />
      </Field>
      <Field label="Tags">
        <TagsField
          value={object.tags ?? []}
          suggestions={suggestions}
          onChange={(tags) => update(object.id, { tags: tags.length ? tags : undefined })}
        />
      </Field>
      <Field label="Tileset" helperText="Choosing another tileset clears the object's tiles.">
        <CompactSelect
          value={object.tilesetId}
          onChange={(e) => update(object.id, { tilesetId: e.target.value, tiles: [] })}
        >
          {!tileset && <option value={object.tilesetId}>{object.tilesetId}</option>}
          {[...tilesets.values()]
            .filter((entry) => !isSeasonTwin(entry))
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
        </CompactSelect>
      </Field>
      <HStack justify="space-between">
        <Text fontSize="xs" color="editorMutedText">
          Size
        </Text>
        <Text fontSize="xs" fontFamily="mono">
          {size.width} × {size.height} tiles
        </Text>
      </HStack>
      <CaptionText>
        Collision comes from the tileset's tiles (red) and is edited in the tileset. On a map the
        object sorts by its bottom edge (the dashed line).
      </CaptionText>
    </InspectorShell>
  );

  return (
    <ResizableEditorLayout
      viewportBackground={false}
      rightPanel={inspector}
      rightPanelDefaultSize={30}
      rightPanelMinSize={22}
      content={content}
    />
  );
}
