import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../theme';
import { MetadataDialog } from './MetadataDialog';

const editor = vi.hoisted(() => ({
  currentMap: {
    id: 'test:room',
    name: 'Room',
    baseTilesetId: '',
    metadata: { locationType: 'Indoor', muteWeatherAudio: false, description: 'Keep this' },
  },
  activeVariationId: null,
  tilesets: new Map(),
  locationMetadataDefinitions: [
    {
      key: 'locationType',
      label: 'Location Type',
      type: 'enum',
      constraints: { options: ['Indoor', 'Outdoor'] },
    },
    { key: 'musicCue', label: 'Music Cue', type: 'string' },
  ],
  updateCurrentMap: vi.fn(),
  updateVariation: vi.fn(),
  setActiveTileset: vi.fn(),
}));

vi.mock('../../../store/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof editor) => unknown) => selector(editor),
}));

describe('location weather metadata', () => {
  beforeEach(() => editor.updateCurrentMap.mockReset());
  afterEach(cleanup);

  it('offers weather audio opt-out with custom project fields and preserves other metadata', () => {
    render(
      <ChakraProvider theme={theme}>
        <MetadataDialog isOpen onClose={() => {}} />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute weather audio' }));
    expect(editor.updateCurrentMap).toHaveBeenLastCalledWith({
      metadata: { locationType: 'Indoor', muteWeatherAudio: true, description: 'Keep this' },
    });
    expect(screen.getByRole('combobox', { name: 'Location Type' })).toHaveValue('Indoor');
    expect(screen.getByText('Music Cue')).toBeInTheDocument();
  });
});
