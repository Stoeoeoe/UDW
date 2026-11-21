import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { useSaveStore } from '../../lib/saveManager';
import { fileSystem } from '../../lib/fileSystem';
import { normalizeResourceDocument } from '../../lib/resourceRegistry';
import type { ObjectDefinition } from '../../types/object';

vi.mock('../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/fileSystem')>();
  return {
    ...original,
    fileSystem: { ...original.fileSystem, saveJson: vi.fn(async () => {}), deleteJson: vi.fn() },
  };
});

const object: ObjectDefinition = {
  formatVersion: 1,
  id: 'test:crate',
  name: 'Crate',
  tilesetId: 'test:props',
  tiles: [{ x: 0, y: 0, tileIndex: 3 }],
};
const unit = `object:${object.id}`;
const isDirty = () => useSaveStore.getState().saveUnits[unit]?.dirty ?? false;

describe('object store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fileSystem.saveJson).mockClear();
    vi.mocked(fileSystem.deleteJson).mockClear();
    useSaveStore.getState().reset();
    useEditorStore.setState({
      objects: [object],
      savedObjects: { [object.id]: object },
      objectPast: {},
      objectFuture: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps edits unsaved until saved, then writes the object file', async () => {
    useEditorStore.getState().updateObject(object.id, { tags: ['wood'], description: 'A box.' });
    expect(isDirty()).toBe(true);

    await useEditorStore.getState().saveObject(object.id);

    const [folder, file, data] = vi.mocked(fileSystem.saveJson).mock.calls[0];
    expect(folder).toBe('objects');
    expect(file).toBe('test:crate.object.json');
    expect(data).toMatchObject({
      id: object.id,
      tags: ['wood'],
      description: 'A box.',
      $schema: expect.stringContaining('object.schema.json'),
    });
    expect(isDirty()).toBe(false);
  });

  it('undoes, redoes and discards edits', () => {
    const store = useEditorStore.getState();
    store.updateObject(object.id, { name: 'Barrel' });
    store.undoObject(object.id);
    expect(useEditorStore.getState().objects[0].name).toBe('Crate');
    expect(isDirty()).toBe(false);

    store.redoObject(object.id);
    expect(useEditorStore.getState().objects[0].name).toBe('Barrel');
    store.discardObject(object.id);
    expect(useEditorStore.getState().objects[0].name).toBe('Crate');
  });

  it('refuses to write an object without a name', async () => {
    const store = useEditorStore.getState();
    store.updateObject(object.id, { name: ' ' });
    await store.saveObject(object.id);

    expect(fileSystem.saveJson).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[unit]?.error).toBe('The object needs a name.');
  });

  it('deletes the file of a removed object', async () => {
    await useEditorStore.getState().deleteObject(object.id);
    expect(fileSystem.deleteJson).toHaveBeenCalledWith('objects', 'test:crate.object.json');
    expect(useEditorStore.getState().objects).toEqual([]);
  });

  it('qualifies its ID and its tileset reference on normalization', () => {
    expect(
      normalizeResourceDocument({ ...object, id: 'crate', tilesetId: 'props' }, 'object', 'mymod'),
    ).toMatchObject({ id: 'mymod:crate', tilesetId: 'mymod:props' });
  });
});
