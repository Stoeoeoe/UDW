import React from 'react';
import { HStack, Tooltip } from '@chakra-ui/react';
import { FiCrosshair } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { CompactSelect } from '../../common/Fields';
import { GhostIconButton } from '../../common/IconButtons';
import { mapEntities } from '../../../lib/routines';
import type { RoutinePlace } from '../../../types/routine';

/**
 * A map and one of its anchors, picked from lists or by clicking the map. A place that sets `entity` (even an empty
 * one, while it is being chosen) is picked from the map's placed objects instead, for goals that use a slot.
 */
export const PlaceField: React.FC<{
  value: RoutinePlace;
  onChange: (place: RoutinePlace) => void;
  picking: boolean;
  onPick: () => void;
}> = ({ value, onChange, picking, onPick }) => {
  const maps = useEditorStore((state) => state.maps);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const map = maps.find((entry) => entry.id === value.map);
  const usesEntity = value.entity !== undefined;
  const anchors = map?.spatialPrimitives?.anchors ?? [];
  const knownAnchor = anchors.some((anchor) => anchor.id === value.anchor);
  const typeName = (typeId: string) =>
    entityTypes.find((type) => type.id === typeId)?.displayName ?? typeId;
  const objectsHere = map
    ? mapEntities(map).filter(
        (entity) => entityTypes.find((type) => type.id === entity.typeId)?.category === 'object',
      )
    : [];
  const knownEntity = objectsHere.some((entity) => entity.id === value.entity);
  return (
    <HStack spacing={1}>
      <CompactSelect
        aria-label="Map"
        value={value.map}
        isInvalid={!map}
        onChange={(event) =>
          onChange(
            usesEntity
              ? { map: event.target.value, entity: '' }
              : { map: event.target.value, anchor: '' },
          )
        }
      >
        {!map && <option value={value.map}>{value.map || 'Choose a map'}</option>}
        {maps.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </CompactSelect>
      {usesEntity ? (
        <CompactSelect
          aria-label="Entity"
          value={value.entity}
          isInvalid={!knownEntity}
          onChange={(event) => onChange({ map: value.map, entity: event.target.value })}
        >
          {!knownEntity && (
            <option value={value.entity}>{value.entity || 'Choose an object'}</option>
          )}
          {objectsHere.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {`${entity.label || typeName(entity.typeId)} – ${entity.id}`}
            </option>
          ))}
        </CompactSelect>
      ) : (
        <>
          <CompactSelect
            aria-label="Anchor"
            value={value.anchor}
            isInvalid={!knownAnchor}
            onChange={(event) => onChange({ ...value, anchor: event.target.value })}
          >
            {!knownAnchor && (
              <option value={value.anchor}>{value.anchor || 'Choose an anchor'}</option>
            )}
            {anchors.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.id}
              </option>
            ))}
          </CompactSelect>
          <Tooltip
            hasArrow
            label={picking ? 'Cancel picking' : 'Pick on the map, or create an anchor there'}
          >
            <GhostIconButton
              aria-label="Pick on the map"
              icon={<FiCrosshair />}
              size="xs"
              isActive={picking}
              color={picking ? 'cyan.300' : undefined}
              onClick={onPick}
            />
          </Tooltip>
        </>
      )}
    </HStack>
  );
};
