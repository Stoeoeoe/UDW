import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../theme';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';
import { watchBuildingKits } from '../../../store/watchBuildingKits';
import { resolveKit } from '../../../lib/buildings/resolveKit';
import { KIT_SHEET_HEIGHT, KIT_SHEET_WIDTH } from '../../../lib/buildings/kitLayout';
import { chooseKitSheet, loadKit } from '../../../lib/buildings/kitSheets';
import { BuildingKitEditor } from './BuildingKitEditor';
import type { BuildingKit } from '../../../types/building';

vi.mock('../../../lib/buildings/kitSheets', () => ({
  chooseKitSheet: vi.fn(async () => 'assets/kits/kit_autumn.png'),
  loadKit: vi.fn(),
}));

const kit: BuildingKit = {
  formatVersion: 1,
  id: 'test:kit',
  name: 'Test kit',
  source: 'assets/kits/kit.png',
  variations: { winter: 'assets/kits/kit_winter.png' },
};
const blank = () => ({
  width: KIT_SHEET_WIDTH,
  height: KIT_SHEET_HEIGHT,
  data: new Uint8ClampedArray(KIT_SHEET_WIDTH * KIT_SHEET_HEIGHT * 4),
});

beforeEach(() => {
  useEditorStore.setState({
    projectPath: 'C:/project',
    buildingKits: [kit],
    savedBuildingKits: { [kit.id]: kit },
    buildingKitPast: {},
    buildingKitFuture: {},
  });
  useResolvedKitsStore.setState({
    kits: { [kit.id]: { status: 'ready', kit: resolveKit(blank(), { winter: blank() }) } },
    sources: {},
  });
});
afterEach(() => {
  cleanup();
  vi.mocked(loadKit).mockReset();
});

const show = () =>
  render(
    <ChakraProvider theme={theme}>
      <BuildingKitEditor kitId={kit.id} />
    </ChakraProvider>,
  );

describe('kit editor', () => {
  it('lists what is wrong with the sheet', () => {
    show();
    expect(screen.getByText('The kit needs at least one floor.')).toBeTruthy();
    expect(screen.getByText(/Nothing drawn for: roof_ridge_l, /)).toBeTruthy();
  });

  it('adds, renames and removes variations', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Add variation…' }));
    await waitFor(() =>
      expect(useEditorStore.getState().buildingKits[0].variations).toEqual({
        winter: 'assets/kits/kit_winter.png',
        'variation-1': 'assets/kits/kit_autumn.png',
      }),
    );
    expect(chooseKitSheet).toHaveBeenCalledWith('C:/project');

    const id = screen.getByLabelText('Variation variation-1 ID');
    fireEvent.change(id, { target: { value: 'autumn' } });
    fireEvent.blur(id);
    expect(Object.keys(useEditorStore.getState().buildingKits[0].variations!)).toEqual([
      'winter',
      'autumn',
    ]);

    fireEvent.click(screen.getByLabelText('Remove variation winter'));
    expect(useEditorStore.getState().buildingKits[0].variations).toEqual({
      autumn: 'assets/kits/kit_autumn.png',
    });
  });

  it('keeps a variation ID that is not a valid local ID or already taken', () => {
    show();
    act(() =>
      useEditorStore.getState().updateBuildingKit(kit.id, {
        variations: { winter: 'w.png', autumn: 'a.png' },
      }),
    );
    const id = screen.getByLabelText('Variation autumn ID');
    fireEvent.change(id, { target: { value: 'winter' } });
    fireEvent.blur(id);
    fireEvent.change(id, { target: { value: 'Autumn!' } });
    fireEvent.blur(id);
    expect(Object.keys(useEditorStore.getState().buildingKits[0].variations!)).toEqual([
      'winter',
      'autumn',
    ]);
  });
});

describe('resolved kits', () => {
  it('reads a kit again when its sheets change, not for other edits', async () => {
    useResolvedKitsStore.getState().reset();
    vi.mocked(loadKit).mockImplementation(async () => resolveKit(blank(), {}));
    const stop = watchBuildingKits();
    await waitFor(() => expect(useResolvedKitsStore.getState().kits[kit.id]?.status).toBe('ready'));
    expect(loadKit).toHaveBeenCalledTimes(1);

    act(() => useEditorStore.getState().updateBuildingKit(kit.id, { name: 'Renamed' }));
    expect(loadKit).toHaveBeenCalledTimes(1);

    act(() =>
      useEditorStore.getState().updateBuildingKit(kit.id, { source: 'assets/kits/other.png' }),
    );
    await waitFor(() => expect(loadKit).toHaveBeenCalledTimes(2));
    expect(vi.mocked(loadKit).mock.calls[1][0].source).toBe('assets/kits/other.png');
    stop();
  });

  it('shows why a kit could not be read', async () => {
    useResolvedKitsStore.getState().reset();
    vi.mocked(loadKit).mockRejectedValue(new Error('File not found'));
    const stop = watchBuildingKits();
    await waitFor(() =>
      expect(useResolvedKitsStore.getState().kits[kit.id]).toEqual({
        status: 'error',
        error: 'File not found',
      }),
    );
    stop();
  });
});
