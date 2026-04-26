import React from 'react';
import { Badge, Button, HStack, Text } from '@chakra-ui/react';
import { FiShield } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { InspectorPanel, InspectorEmptyState } from '../common';
import { MapCollision, MapCollisionShape } from '../../../types/schema';
import {
  CompactInput,
  CompactSelect,
  Field,
  FieldStack,
  InlineNumberPair,
  InspectorSection,
  ReadOnlyIdField,
} from '../../common/Fields';

const CollisionInspectorContent: React.FC<{ collision: MapCollision }> = ({ collision }) => {
  const updateCollision = useEditorStore((s) => s.updateCollision);
  const removeCollision = useEditorStore((s) => s.removeCollision);
  const selectCollision = useEditorStore((s) => s.selectCollision);
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);

  const update = (updates: Partial<MapCollision>) => updateCollision(collision.id, updates);

  const handleShapeChange = (shape: MapCollisionShape) => {
    if (shape === collision.shape) return;
    const [x, y] = collision.position;

    if (shape === 'rectangle') {
      if (collision.shape === 'circle' && collision.radius !== undefined) {
        const r = collision.radius;
        update({
          shape,
          position: [x - r, y - r],
          size: [r * 2, r * 2],
          radius: undefined,
          points: undefined,
        });
      } else if (
        collision.shape === 'polygon' &&
        collision.points &&
        collision.points.length >= 2
      ) {
        const xs = collision.points.map(([px]) => px);
        const ys = collision.points.map(([, py]) => py);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const w = Math.max(1, Math.max(...xs) - minX);
        const h = Math.max(1, Math.max(...ys) - minY);
        update({
          shape,
          position: [minX, minY],
          size: [w, h],
          points: undefined,
          radius: undefined,
        });
      } else {
        update({
          shape,
          size: [projectTileSize, projectTileSize],
          points: undefined,
          radius: undefined,
        });
      }
    } else if (shape === 'circle') {
      if (collision.shape === 'rectangle' && collision.size) {
        const [w, h] = collision.size;
        const cx = x + w / 2;
        const cy = y + h / 2;
        update({
          shape,
          position: [Math.round(cx), Math.round(cy)],
          radius: Math.round(Math.min(w, h) / 2),
          size: undefined,
          points: undefined,
        });
      } else if (
        collision.shape === 'polygon' &&
        collision.points &&
        collision.points.length >= 2
      ) {
        const xs = collision.points.map(([px]) => px);
        const ys = collision.points.map(([, py]) => py);
        const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
        const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
        const r = Math.round(
          Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2,
        );
        update({
          shape,
          position: [cx, cy],
          radius: Math.max(1, r),
          size: undefined,
          points: undefined,
        });
      } else {
        update({
          shape,
          position: collision.position,
          radius: projectTileSize,
          size: undefined,
          points: undefined,
        });
      }
    } else if (shape === 'polygon') {
      if (collision.shape === 'rectangle' && collision.size) {
        const [w, h] = collision.size;
        update({
          shape,
          points: [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
          size: undefined,
          radius: undefined,
        });
      } else if (collision.shape === 'circle' && collision.radius !== undefined) {
        const r = collision.radius;
        const count = 8;
        const pts: [number, number][] = Array.from({ length: count }, (_, i) => {
          const angle = (i / count) * Math.PI * 2;
          return [Math.round(x + Math.cos(angle) * r), Math.round(y + Math.sin(angle) * r)];
        });
        update({ shape, points: pts, size: undefined, radius: undefined });
      } else {
        update({
          shape,
          points: [
            [x, y],
            [x + projectTileSize, y],
            [x + projectTileSize, y + projectTileSize],
            [x, y + projectTileSize],
          ],
          size: undefined,
          radius: undefined,
        });
      }
    }
  };

  return (
    <FieldStack spacing={5}>
      <InspectorSection>
        <FieldStack>
          <Field label="ID">
            <ReadOnlyIdField value={collision.id} />
          </Field>
          <Field label="Label">
            <CompactInput
              placeholder="e.g. Wall Boundary"
              value={collision.label ?? ''}
              onChange={(e) => update({ label: e.target.value || undefined })}
            />
          </Field>
        </FieldStack>
      </InspectorSection>

      <InspectorSection title="Shape">
        <Field label="Shape Type">
          <CompactSelect
            value={collision.shape}
            onChange={(e) => handleShapeChange(e.target.value as MapCollisionShape)}
          >
            <option value="rectangle">Rectangle</option>
            <option value="polygon">Polygon</option>
            <option value="circle">Circle</option>
          </CompactSelect>
        </Field>

        <Field label="Position (px)">
          <InlineNumberPair
            labels={collision.shape === 'circle' ? ['CX', 'CY'] : ['X', 'Y']}
            values={[collision.position[0], collision.position[1]]}
            onChange={(position) => update({ position })}
          />
        </Field>

        {collision.shape === 'rectangle' && (
          <Field label="Size (px)">
            <InlineNumberPair
              labels={['W', 'H']}
              values={[
                collision.size?.[0] ?? projectTileSize,
                collision.size?.[1] ?? projectTileSize,
              ]}
              min={1}
              onChange={([w, h]) => update({ size: [Math.max(1, w), Math.max(1, h)] })}
            />
          </Field>
        )}

        {collision.shape === 'circle' && (
          <Field label="Radius (px)">
            <InlineNumberPair
              labels={['R', '']}
              values={[collision.radius ?? projectTileSize, 0]}
              min={1}
              onChange={([r]) => update({ radius: Math.max(1, r) })}
            />
          </Field>
        )}

        {collision.shape === 'polygon' && collision.points && (
          <Field
            label={`Vertices (${collision.points.length})`}
            helperText="Drag vertices on the canvas to reposition them."
          >
            <FieldStack spacing={2}>
              {collision.points.map(([x, y], index) => (
                <HStack key={`${x}-${y}-${index}`} spacing={2}>
                  <Badge colorScheme="orange" fontSize="9px">
                    {index}
                  </Badge>
                  <Text textStyle="monoMeta">
                    ({x}, {y})
                  </Text>
                </HStack>
              ))}
            </FieldStack>
          </Field>
        )}
      </InspectorSection>

      <InspectorSection>
        <Button
          size="xs"
          variant="ghost"
          colorScheme="red"
          alignSelf="flex-start"
          onClick={() => {
            removeCollision(collision.id);
            selectCollision(null);
          }}
        >
          Delete Shape
        </Button>
      </InspectorSection>
    </FieldStack>
  );
};

export const CollisionInspector: React.FC = () => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const selectedCollisionId = useEditorStore((s) => s.selectedCollisionId);

  const collision = currentMap?.spatialPrimitives?.collisions?.find(
    (c) => c.id === selectedCollisionId,
  );

  if (!collision) {
    return (
      <InspectorPanel title="Collision Shape">
        <InspectorEmptyState
          icon={FiShield}
          message="No Collision Shape Selected"
          hint="Click a shape on the map or draw a new one with the toolbar tools"
        />
      </InspectorPanel>
    );
  }

  return (
    <InspectorPanel title="Collision Shape">
      <CollisionInspectorContent collision={collision} />
    </InspectorPanel>
  );
};

export default CollisionInspector;
