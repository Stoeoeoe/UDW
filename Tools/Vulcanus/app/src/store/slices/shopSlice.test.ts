import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { useSaveStore } from '../../lib/saveManager';
import { fileSystem } from '../../lib/fileSystem';
import { validateShop } from './shopSlice';
import type { Shop } from '../../types/schema';

vi.mock('../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/fileSystem')>();
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

describe('shop store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fileSystem.saveJson).mockClear();
    useSaveStore.getState().reset();
    useEditorStore.setState({
      shops: [shop],
      savedShops: { [shop.id]: shop },
      shopPast: {},
      shopFuture: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a shop unsaved until it is saved, then writes the file once', async () => {
    await useEditorStore.getState().updateShop(shop.id, { buysGoods: false });

    expect(isDirty()).toBe(true);
    expect(fileSystem.saveJson).not.toHaveBeenCalled();

    await useEditorStore.getState().saveShop(shop.id);

    expect(fileSystem.saveJson).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fileSystem.saveJson).mock.calls[0][2]).toMatchObject({
      id: shop.id,
      buysGoods: false,
    });
    expect(isDirty()).toBe(false);
  });

  it('undoes and redoes edits, clearing the unsaved mark when back at the saved shop', async () => {
    const store = useEditorStore.getState();
    await store.updateShop(shop.id, { buysGoods: false });
    store.undoShop(shop.id);

    expect(useEditorStore.getState().shops[0].buysGoods).toBe(true);
    expect(isDirty()).toBe(false);

    store.redoShop(shop.id);

    expect(useEditorStore.getState().shops[0].buysGoods).toBe(false);
    expect(isDirty()).toBe(true);
  });

  it('makes quick consecutive edits a single undo step', async () => {
    const store = useEditorStore.getState();
    await store.updateShop(shop.id, { name: 'S' });
    await store.updateShop(shop.id, { name: 'Se' });
    await store.updateShop(shop.id, { name: 'Seed' });
    store.undoShop(shop.id);

    expect(useEditorStore.getState().shops[0].name).toBe('Market Stall');
  });

  it('discards unsaved edits back to the saved shop', async () => {
    await useEditorStore.getState().updateShop(shop.id, { name: 'Changed' });
    useEditorStore.getState().discardShop(shop.id);

    expect(useEditorStore.getState().shops[0].name).toBe('Market Stall');
    expect(isDirty()).toBe(false);
  });

  it('refuses to write a shop Unity would reject', async () => {
    await useEditorStore.getState().updateShop(shop.id, {
      offerings: [
        { itemId: 'base:a', price: 1 },
        { itemId: 'base:a', price: 2 },
        { itemId: ' ', price: 3 },
      ],
    });
    await useEditorStore.getState().saveShop(shop.id);

    expect(fileSystem.saveJson).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[unit]?.status).toBe('error');
    expect(validateShop(useEditorStore.getState().shops[0])).toEqual([
      'base:a is offered more than once.',
      'Every item needs an item ID.',
    ]);
  });
});
