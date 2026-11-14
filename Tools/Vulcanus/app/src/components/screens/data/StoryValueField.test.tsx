import React, { useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoryValueField } from './StoryValueField';
import type { StoryData } from '../../../lib/storyValues';
import { theme } from '../../../theme';

const Harness = () => {
  const [value, setValue] = useState<StoryData>('Ada');
  return (
    <ChakraProvider theme={theme}>
      <StoryValueField value={value} onChange={setValue} />
      <output data-testid="committed">{JSON.stringify(value)}</output>
    </ChakraProvider>
  );
};

describe('story action values', () => {
  it('follows external value type changes such as undo for undeclared keys', () => {
    const changed = vi.fn();
    const view = render(
      <ChakraProvider theme={theme}>
        <StoryValueField value={1} onChange={changed} />
      </ChakraProvider>,
    );
    view.rerender(
      <ChakraProvider theme={theme}>
        <StoryValueField value="Ada" onChange={changed} />
      </ChakraProvider>,
    );
    expect(screen.getByLabelText('Story value type')).toHaveValue('string');
    expect(screen.getByLabelText('Story value')).toHaveValue('Ada');
  });
  it('locks the declared type and reports mismatches without silently changing the value', () => {
    const changed = vi.fn();
    render(
      <ChakraProvider theme={theme}>
        <StoryValueField value="wrong" declaredType="boolean" onChange={changed} />
      </ChakraProvider>,
    );
    expect(screen.queryByLabelText('Story value type')).not.toBeInTheDocument();
    expect(screen.getByText('Type: boolean')).toBeInTheDocument();
    expect(screen.getByText(/does not match its declared boolean type/)).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use boolean value' }));
    expect(changed).toHaveBeenCalledWith(false);
  });

  it('accepts only whole integers for a declared long', () => {
    const changed = vi.fn();
    render(
      <ChakraProvider theme={theme}>
        <StoryValueField value={0} declaredType="long" onChange={changed} />
      </ChakraProvider>,
    );
    fireEvent.change(screen.getByLabelText('Story value'), { target: { value: '1.5' } });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a whole integer/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Story value'), { target: { value: '12' } });
    expect(changed).toHaveBeenCalledWith(12);
  });
  it('edits empty strings, booleans and signed fractional numbers without coercing invalid drafts', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Story value'), { target: { value: '' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('""');
    fireEvent.change(screen.getByLabelText('Story value type'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByLabelText('Story boolean value'));
    expect(screen.getByTestId('committed')).toHaveTextContent('true');
    fireEvent.change(screen.getByLabelText('Story value type'), { target: { value: 'number' } });
    fireEvent.change(screen.getByLabelText('Story value'), { target: { value: '-' } });
    expect(screen.getByLabelText('Story value')).toHaveValue('-');
    expect(screen.getByTestId('committed')).toHaveTextContent('0');
    fireEvent.change(screen.getByLabelText('Story value'), { target: { value: '-1.5' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('-1.5');
  });

  it('accepts nested objects and rejects arrays or null entries', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Story value type'), { target: { value: 'object' } });
    fireEvent.change(screen.getByLabelText('Story object value'), {
      target: { value: '{"quest":{"stage":2}}' },
    });
    expect(screen.getByTestId('committed')).toHaveTextContent('{"quest":{"stage":2}}');
    for (const value of ['[1,2]', '{"bad":null}']) {
      fireEvent.change(screen.getByLabelText('Story object value'), { target: { value } });
      expect(screen.getByText(/last valid value is retained/)).toBeInTheDocument();
      expect(screen.getByTestId('committed')).toHaveTextContent('{"quest":{"stage":2}}');
    }
  });
});
