import React, { useEffect, useState } from 'react';
import { NumberInput, NumberInputField } from '@chakra-ui/react';

/** Preserve partially entered decimals while storing JSON numbers, never NaN or infinity. */
export const NumericCutsceneArgument: React.FC<{
  value: string | number;
  onChange: (value: number | '') => void;
}> = ({ value, onChange }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <NumberInput
      value={draft}
      onChange={(text, numericValue) => {
        setDraft(text);
        onChange(text.trim() && Number.isFinite(numericValue) ? numericValue : '');
      }}
    >
      <NumberInputField />
    </NumberInput>
  );
};
