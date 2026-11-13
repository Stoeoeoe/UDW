import React from 'react';
import { HStack, Tooltip } from '@chakra-ui/react';
import { FiCrosshair } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { CompactSelect } from '../../common/Fields';
import { GhostIconButton } from '../../common/IconButtons';
import type { RoutinePlace } from '../../../types/routine';

/** A map and one of its anchors, picked from lists or by clicking the map. */
export const PlaceField: React.FC<{
  value: RoutinePlace;
  onChange: (place: RoutinePlace) => void;
  picking: boolean;
  onPick: () => void;
}> = ({ value, onChange, picking, onPick }) => {
  const maps = useEditorStore((state) => state.maps);
  const map = maps.find((entry) => entry.id === value.map);
  const anchors = map?.spatialPrimitives?.anchors ?? [];
  const knownAnchor = anchors.some((anchor) => anchor.id === value.anchor);
  return (
    <HStack spacing={1}>
      <CompactSelect
        aria-label="Map"
        value={value.map}
        isInvalid={!map}
        onChange={(event) => onChange({ map: event.target.value, anchor: '' })}
      >
        {!map && <option value={value.map}>{value.map || 'Choose a map'}</option>}
        {maps.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </CompactSelect>
      <CompactSelect
        aria-label="Anchor"
        value={value.anchor}
        isInvalid={!knownAnchor}
        onChange={(event) => onChange({ ...value, anchor: event.target.value })}
      >
        {!knownAnchor && <option value={value.anchor}>{value.anchor || 'Choose an anchor'}</option>}
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
    </HStack>
  );
};
