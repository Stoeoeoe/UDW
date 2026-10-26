import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileSystemManager } from './fileSystem';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('namespaced file persistence', () => {
  function setup(entries: { filename: string; data: unknown }[] = []) {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'app:open-project')
        return {
          projectPath: '/game',
          projectFilename: 'game.vproj',
          project: { id: 'game', idPrefix: 'base' },
        };
      if (channel === 'app:fs-read-dir') return entries;
      return null;
    });
    vi.stubGlobal('window', { ipcRenderer: { invoke } });
    return { fs: new FileSystemManager(), invoke };
  }

  it('updates, reads and deletes namespaced resource files without duplicates', async () => {
    const { fs, invoke } = setup([
      {
        filename: 'mycharacter.character.json',
        data: { id: 'base:mycharacter', name: 'My Character' },
      },
    ]);
    expect((await fs.openProject()).project).toMatchObject({ id: 'game', idPrefix: 'base' });
    const [character] = await fs.loadAllCharacters();
    expect(character.id).toBe('base:mycharacter');
    await fs.saveJson('characters', `${character.id}.character.json`, character);
    expect(invoke).toHaveBeenLastCalledWith(
      'app:fs-write-json',
      expect.objectContaining({
        filename: 'mycharacter.character.json',
        data: expect.objectContaining({ id: 'base:mycharacter' }),
      }),
    );
    await fs.readJson('characters', `${character.id}.character.json`);
    expect(invoke).toHaveBeenLastCalledWith(
      'app:fs-read-json',
      expect.objectContaining({ filename: 'mycharacter.character.json' }),
    );
    await fs.deleteJson('characters', `${character.id}.character.json`);
    expect(invoke).toHaveBeenLastCalledWith(
      'app:fs-delete-json',
      expect.objectContaining({ filename: 'mycharacter.character.json' }),
    );
    expect(fs.resolveFilename('', 'game.vproj')).toBe('game.vproj');
  });

  it('filters companion exports and preserves their original filename casing', async () => {
    const { fs, invoke } = setup([
      {
        filename: 'Intro.dialogue.json',
        data: {
          $schema: '../../schemas/dialogue.schema.json',
          id: 'base:intro',
          name: 'Intro',
          nodes: [],
        },
      },
      {
        filename: 'Intro.runtime.dialogue.json',
        data: { id: 'base:intro', name: 'Intro', nodes: [] },
      },
      { filename: 'Intro.i18n.json', data: { dialogueId: 'base:intro', messages: [] } },
    ]);
    await fs.openProject();
    expect(await fs.loadAllDialogues()).toHaveLength(1);
    await fs.saveJson('dialogues', 'base:intro.runtime.dialogue.json', { id: 'base:intro' });
    expect(invoke).toHaveBeenLastCalledWith(
      'app:fs-write-json',
      expect.objectContaining({ filename: 'Intro.runtime.dialogue.json' }),
    );
    expect(fs.resolveFilename('dialogues', 'base:intro.i18n.json')).toBe('Intro.i18n.json');
  });

  it('rejects resource collisions rather than silently overwriting an entry', async () => {
    const { fs } = setup([
      { filename: 'first.character.json', data: { id: 'base:mycharacter' } },
      { filename: 'second.character.json', data: { id: 'base:mycharacter' } },
    ]);
    await fs.openProject();
    await expect(fs.loadAllCharacters()).rejects.toThrow('Duplicate ID');
  });

  it('writes new mod resources and cross-mod references with qualified lowercase IDs', async () => {
    const { fs, invoke } = setup();
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:open-project')
        return {
          projectPath: '/game',
          projectFilename: 'game.vproj',
          project: { id: 'game', idPrefix: 'MyMod' },
        };
      return null;
    });
    await fs.openProject();
    await fs.saveJson('dialogues', 'Intro.dialogue.json', {
      id: 'Intro',
      startNodeId: 'Step1',
      nodes: [{ id: 'Step1', type: 'line', speaker: 'BASE:MyCharacter' }],
    });
    expect(invoke).toHaveBeenLastCalledWith(
      'app:fs-write-json',
      expect.objectContaining({
        filename: 'intro.dialogue.json',
        data: expect.objectContaining({
          id: 'mymod:intro',
          startNodeId: 'step1',
          nodes: [{ id: 'step1', type: 'line', speaker: 'base:mycharacter' }],
        }),
      }),
    );
  });
});
