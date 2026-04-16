import React, { useId } from 'react';
import { Input, InputProps } from '@chakra-ui/react';

interface ComboboxInputProps extends Omit<InputProps, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

/**
 * A text input with a datalist-powered dropdown of suggestions.
 * Allows free-form entry while surfacing known values.
 */
export const ComboboxInput: React.FC<ComboboxInputProps> = ({
  value,
  onChange,
  options,
  ...inputProps
}) => {
  const listId = useId();

  return (
    <>
      <Input
        {...inputProps}
        value={value}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  );
};
