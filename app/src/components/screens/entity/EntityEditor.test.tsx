import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { useEditorStore } from '../../../store/useEditorStore';

type MockProps = { children?: React.ReactNode } & Record<string, unknown>;

// Mock Chakra primitives to avoid jsdom CSS parsing issues in tests
vi.mock('@chakra-ui/react', async () => {
  const React = await vi.importActual('react');
  return {
    // layout primitives
    Flex: (props: MockProps) => React.createElement('div', props, props.children),
    VStack: (props: MockProps) => React.createElement('div', props, props.children),
    HStack: (props: MockProps) => React.createElement('div', props, props.children),
    Box: (props: MockProps) => React.createElement('div', props, props.children),
    Text: (props: MockProps) => React.createElement('div', props, props.children),
    Heading: (props: MockProps) => React.createElement('div', props, props.children),
    Input: (props: MockProps) => React.createElement('input', props),
    Select: (props: MockProps) => React.createElement('select', props, props.children),
    FormControl: (props: MockProps) => React.createElement('div', props, props.children),
    FormLabel: (props: MockProps) => React.createElement('label', props, props.children),
    Circle: (props: MockProps) => React.createElement('div', props, props.children),
    Button: (props: MockProps) => React.createElement('button', props, props.children),
    IconButton: (props: MockProps) => React.createElement('button', props, props.children),
    Divider: (props: MockProps) => React.createElement('hr', props),
    Badge: (props: MockProps) => React.createElement('span', props, props.children),
    useDisclosure: () => ({
      isOpen: false,
      onOpen: () => {},
      onClose: () => {},
    }),
  };
});

// Mock EditorModal and PropertyDefinitionEditor (heavy components)
vi.mock('../../common/EditorModal', async () => {
  const React = await vi.importActual('react');
  return {
    EditorModal: (props: MockProps) => React.createElement('div', props, props.children),
    default: (props: MockProps) => React.createElement('div', props, props.children),
  };
});

vi.mock('./PropertyDefinitionEditor', async () => {
  const React = await vi.importActual('react');
  return {
    PropertyDefinitionEditor: (props: MockProps) => React.createElement('div', props, null),
  };
});

import EntityEditor from './EntityEditor';

const sampleType = {
  id: 'chest',
  displayName: 'Chest',
  category: 'object' as const,
  icon: '📦',
  placeholderColor: '#3182ce',
  properties: [],
  defaultSize: [1, 1] as [number, number],
};

describe('EntityEditor', () => {
  const mockedStore = useEditorStore as unknown as {
    setState: (state: Record<string, unknown>) => void;
  };

  beforeEach(() => {
    mockedStore.setState({
      entityTypes: [sampleType],
      selectedEntityTypeId: null,
    });
  });

  it('selects an entity from the grid', async () => {
    const setSelectedEntityType = vi.fn();
    mockedStore.setState({ setSelectedEntityType });

    render(<EntityEditor />);

    const items = await screen.findAllByText('Chest');
    // The grid and the list both render the display name; pick the grid item occurrence
    fireEvent.click(items[1]);

    await waitFor(() => expect(setSelectedEntityType).toHaveBeenCalledWith('chest'));
  });

  it('edits display name and calls updateEntityType', async () => {
    const updateEntityType = vi.fn().mockResolvedValue(undefined);
    mockedStore.setState({
      updateEntityType,
      selectedEntityTypeId: 'chest',
    });

    render(<EntityEditor />);

    const input = await screen.findByDisplayValue('Chest');
    fireEvent.change(input, { target: { value: 'Treasure Chest' } });

    await waitFor(() =>
      expect(updateEntityType).toHaveBeenCalledWith('chest', {
        displayName: 'Treasure Chest',
      }),
    );
  });
});
