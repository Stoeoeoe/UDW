import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopEditor } from './ShopEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { useSaveStore } from '../../../lib/saveManager';
import { theme } from '../../../theme';
import type { Shop } from '../../../types/schema';

vi.mock('../../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/fileSystem')>();
  return {
    ...original,
    fileSystem: { ...original.fileSystem, saveJson: vi.fn(async () => {}), deleteJson: vi.fn() },
  };
});

const shop: Shop = {
  id: 'base:market_seeds',
  name: 'Market Stall',
  buysGoods: true,
  offerings: [{ itemId: 'base:broad_bean_seeds', price: 15 }],
};
const unit = `shop:${shop.id}`;
const isDirty = () => useSaveStore.getState().saveUnits[unit]?.dirty ?? false;

function renderEditor() {
  return render(
    <ChakraProvider theme={theme}>
      <ShopEditor />
    </ChakraProvider>,
  );
}

describe('ShopEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSaveStore.getState().reset();
    useEditorStore.setState({
      items: [],
      shops: [shop],
      savedShops: { [shop.id]: shop },
      shopPast: {},
      shopFuture: {},
      selectedShopId: shop.id,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the selected shop with its items and prices', () => {
    renderEditor();

    expect(screen.getByDisplayValue('Market Stall')).toBeTruthy();
    expect(screen.getByDisplayValue('base:broad_bean_seeds')).toBeTruthy();
    expect(screen.getByDisplayValue('15')).toBeTruthy();
  });

  it('applies an edit at once, marks the shop unsaved and undoes it back to clean', () => {
    renderEditor();

    fireEvent.change(screen.getByDisplayValue('Market Stall'), { target: { value: 'Seed Stall' } });

    expect(useEditorStore.getState().shops[0].name).toBe('Seed Stall');
    expect(isDirty()).toBe(true);

    fireEvent.click(screen.getByLabelText('Undo'));

    expect(useEditorStore.getState().shops[0].name).toBe('Market Stall');
    expect(isDirty()).toBe(false);
  });

  it('shows why a shop cannot be saved yet instead of writing an invalid file', async () => {
    renderEditor();

    fireEvent.click(screen.getByText('Add item'));
    await useEditorStore.getState().saveShop(shop.id);

    expect(screen.getByText(/Every item needs an item ID/)).toBeTruthy();
    expect(useSaveStore.getState().saveUnits[unit]?.status).toBe('error');
  });

  it('shows a hint when no shop is selected', () => {
    useEditorStore.setState({ selectedShopId: null });
    renderEditor();

    expect(screen.getByText('No Shop Selected')).toBeTruthy();
  });
});
