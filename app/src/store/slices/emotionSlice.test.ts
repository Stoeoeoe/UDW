import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import * as storeHelpers from '../storeHelpers';
import type { Project } from '../../types/schema';

vi.mock('../storeHelpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storeHelpers')>()),
  persistProject: vi.fn(async () => {}),
}));

describe('emotion store', () => {
  beforeEach(() => {
    vi.mocked(storeHelpers.persistProject).mockClear();
    useEditorStore.setState({
      emotions: [],
      project: { id: 'test', name: 'Test', idPrefix: 'base' } as Project,
    });
  });

  it('namespaces a new emotion and saves it on the project', async () => {
    await useEditorStore.getState().addEmotion({ id: 'angry', name: 'Angry', icon: 'GiAngryEyes' });

    expect(useEditorStore.getState().emotions).toEqual([
      { id: 'base:angry', name: 'Angry', icon: 'GiAngryEyes' },
    ]);
    expect(vi.mocked(storeHelpers.persistProject).mock.calls[0][0].emotions).toEqual(
      useEditorStore.getState().emotions,
    );
  });

  it('renames and deletes an emotion', async () => {
    const store = useEditorStore.getState();
    await store.addEmotion({ id: 'angry', name: 'Angry', icon: 'GiAngryEyes' });
    await useEditorStore.getState().updateEmotion('base:angry', { name: 'Furious' });
    expect(useEditorStore.getState().emotions[0].name).toBe('Furious');

    await useEditorStore.getState().deleteEmotion('base:angry');
    expect(useEditorStore.getState().emotions).toEqual([]);
  });

  it('refuses a duplicate id', async () => {
    const store = useEditorStore.getState();
    await store.addEmotion({ id: 'angry', name: 'Angry', icon: 'GiAngryEyes' });
    await expect(
      useEditorStore.getState().addEmotion({ id: 'angry', name: 'Again', icon: 'GiAngryEyes' }),
    ).rejects.toThrow('already exists');
  });
});
