import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupIpcHandlers } from '../../electron/ipcHandlers';

const { handle, access, showItemInFolder } = vi.hoisted(() => ({
  handle: vi.fn(),
  access: vi.fn(),
  showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle },
  dialog: {},
  shell: { showItemInFolder },
}));
vi.mock('node:fs/promises', () => ({ default: { access } }));

describe('Reveal in File Explorer IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue(undefined);
    setupIpcHandlers(null);
  });

  function reveal(relativePath: string) {
    const handler = handle.mock.calls.find(
      ([channel]) => channel === 'app:reveal-in-explorer',
    )?.[1];
    expect(handler).toBeTypeOf('function');
    return handler(null, { projectPath: path.resolve('test-project'), relativePath });
  }

  it('registers the menu channel and reveals the absolute resource path', async () => {
    await reveal('characters/gagaa.character.json');
    const filePath = path.resolve('test-project', 'characters/gagaa.character.json');
    expect(access).toHaveBeenCalledWith(filePath);
    expect(showItemInFolder).toHaveBeenCalledWith(filePath);
  });

  it('rejects paths outside the project', async () => {
    await expect(reveal('../other-project/character.json')).rejects.toThrow('inside the project');
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('reports missing files without opening Explorer', async () => {
    access.mockRejectedValueOnce(new Error('File does not exist'));
    await expect(reveal('characters/missing.character.json')).rejects.toThrow(
      'File does not exist',
    );
    expect(showItemInFolder).not.toHaveBeenCalled();
  });
});
