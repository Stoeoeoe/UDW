import React from 'react';
import { HStack, Radio, RadioGroup, VStack } from '@chakra-ui/react';
import { MapPositionField } from './MapPositionField';
import type { PositionArgument } from '../../lib/mapPosition';

/** A nullable position describes a global effect, or an effect at a map location. */
export const NullableMapPositionField: React.FC<
  Omit<React.ComponentProps<typeof MapPositionField>, 'onChange'> & {
    onChange: (value: PositionArgument | '' | null) => void;
  }
> = ({ value, onChange, onCancel, ...props }) => (
  <VStack align="stretch" spacing={2}>
    <RadioGroup
      aria-label="Position scope"
      value={value === null ? 'global' : 'position'}
      onChange={(scope) => {
        onCancel();
        onChange(scope === 'global' ? null : '');
      }}
    >
      <HStack>
        <Radio value="global" size="sm">
          Global
        </Radio>
        <Radio value="position" size="sm">
          At position
        </Radio>
      </HStack>
    </RadioGroup>
    {value !== null && (
      <MapPositionField {...props} value={value} onChange={onChange} onCancel={onCancel} />
    )}
  </VStack>
);
