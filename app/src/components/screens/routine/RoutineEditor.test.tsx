import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { RoutineEditor } from './RoutineEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { useSaveStore } from '../../../lib/saveManager';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { parseScriptingManifest } from '../../../lib/scriptingManifest';
import { theme } from '../../../theme';
import type { Routine } from '../../../types/routine';
import type { Character, Map as GameMap, Tileset } from '../../../types/schema';

// The app enables Map support at startup; dialogues live in a Map.
enableMapSet();

vi.mock('../../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/fileSystem')>();
  return {
    ...original,
    fileSystem: { ...original.fileSystem, saveJson: vi.fn(async () => {}), deleteJson: vi.fn() },
  };
});

const tileset = {
  version: 1,
  id: 'base:village',
  name: 'Village',
  spriteSheet: 'village.png',
  columns: 4,
  tileCount: 4,
  tiles: { 1: { collision: { type: 'full' } } },
} as unknown as Tileset;

// A 6x3 field with a wall between Fabia's house and the square, so the route has to go around it.
const map = {
  version: 1,
  id: 'base:map-1',
  name: 'Map 1',
  width: 6,
  height: 3,
  baseTilesetId: tileset.id,
  tilesetRefs: [tileset.id],
  layers: [
    {
      id: 'terrain',
      name: 'Terrain',
      kind: 'terrain',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 0,
      data: [
        [0, 0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ],
    },
  ],
  entities: [],
  spatialPrimitives: {
    anchors: [
      { id: 'right-sie', name: 'right-sie', position: [8, 8], tags: [] },
      { id: 'fabia-destination', name: 'fabia-destination', position: [72, 8], tags: [] },
    ],
  },
} as unknown as GameMap;

const fabia: Character = { id: 'base:fabia', name: 'Fabia' } as Character;

const routine: Routine = {
  formatVersion: 1,
  id: 'base:fabia_routine',
  character: 'base:fabia',
  home: { map: 'base:map-1', anchor: 'right-sie' },
  variants: [
    {
      id: 'default',
      goals: [
        {
          id: 'visit',
          departAt: '06:10',
          destination: { map: 'base:map-1', anchor: 'fabia-destination' },
        },
        { id: 'back_home', departAt: '07:00', destination: 'home' },
      ],
    },
  ],
};

const current = () => useEditorStore.getState().routines[0];

function renderEditor() {
  return render(
    <ChakraProvider theme={theme}>
      <RoutineEditor routineId={routine.id} />
    </ChakraProvider>,
  );
}

describe('RoutineEditor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    // jsdom has no element scrolling; Chakra menus scroll their list into view.
    Element.prototype.scrollTo = () => {};
    useSaveStore.getState().reset();
    useEditorStore.setState({
      characters: [fabia],
      maps: [map],
      currentMap: null,
      tilesets: new Map([[tileset.id, tileset]]),
      routines: [routine],
      savedRoutines: { [routine.id]: routine },
      routinePast: {},
      routineFuture: {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useScriptingManifestStore.setState({ manifest: null });
  });

  it('times each walk with the character’s speed and the game clock, and flags a schedule that cannot work', () => {
    // As exported by Unity: 5 real seconds per in-game minute.
    useScriptingManifestStore.setState({
      manifest: parseScriptingManifest({
        schemaVersion: 2,
        modules: [],
        clock: { secondsPerInGameMinute: 5, startOfDay: 6, endOfDay: 23 },
      }),
    });
    renderEditor();
    expect(screen.getAllByText(/^Arrives about 06:1\d after <1 min on foot\.$/)).toHaveLength(1);

    // A very slow Fabia needs hours to cross the field, so she is still walking when she should go home.
    act(() => useEditorStore.setState({ characters: [{ ...fabia, walkSpeed: 0.01 }] }));
    expect(
      screen.getByText(/^Still walking until about \d\d:\d\d, but back_home leaves at 07:00\.$/),
    ).toBeTruthy();
  });

  it('shows Fabia’s day, its goals and the walked route around the wall', () => {
    renderEditor();
    expect(screen.getByText('Fabia')).toBeTruthy();
    expect(screen.getByText('Valid')).toBeTruthy();
    expect(screen.getByDisplayValue('06:10')).toBeTruthy();
    expect(screen.getByDisplayValue('07:00')).toBeTruthy();

    fireEvent.click(screen.getByDisplayValue('visit'));
    // Straight would be 4 tiles; the wall in column 2 forces a detour through the bottom row.
    const route = screen.getByText(/^Route of \d+ tiles/).textContent!;
    expect(Number(/\d+/.exec(route)![0])).toBeGreaterThan(4);
  });

  it('sets what Fabia says, showing what each goal keeps from earlier in the day', () => {
    const dialogue = (id: string, name: string) => [id, { id, name }] as const;
    act(() =>
      useEditorStore.setState({
        dialogues: new Map([
          dialogue('base:fabia_greeting', 'Fabia greeting'),
          dialogue('base:selling', 'Selling'),
        ]) as never,
      }),
    );
    renderEditor();
    fireEvent.change(screen.getByLabelText('Dialogue at the start of the day'), {
      target: { value: 'base:fabia_greeting' },
    });
    expect(current().dialogue).toBe('base:fabia_greeting');
    expect(screen.getAllByLabelText('Dialogue once there')).toHaveLength(2);
    expect(screen.getAllByText('keeps Fabia greeting').length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByLabelText('Dialogue once there')[0], {
      target: { value: 'base:selling' },
    });
    expect(current().variants[0].goals![0].dialogue).toBe('base:selling');
    // Walking home keeps what she said at the square.
    expect(
      (screen.getAllByLabelText('Dialogue while walking there')[1] as HTMLSelectElement).options[0]
        .text,
    ).toBe('keeps Selling');
  });

  it('creates a dialogue for a goal, named and filed for Fabia, and opens it on request', async () => {
    const openDocument = vi.spyOn(useWorkspaceStore.getState(), 'openDocument');
    act(() => useEditorStore.setState({ dialogues: new Map() as never }));
    renderEditor();
    fireEvent.change(screen.getAllByLabelText('Dialogue once there')[0], {
      target: { value: '__new__' },
    });
    expect((screen.getByDisplayValue('Fabia – visit') as HTMLInputElement).value).toBe(
      'Fabia – visit',
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Create and open'));
    });

    const id = current().variants[0].goals![0].dialogue!;
    const created = useEditorStore.getState().dialogues.get(id)!;
    expect(created).toMatchObject({ name: 'Fabia – visit', folderPath: 'Fabia' });
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dialogue', dialogueId: id }),
      { pin: true },
    );
  });

  it('adds a goal an hour after the last one and marks the routine unsaved', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(current().variants[0].goals!.map((goal) => goal.departAt)).toEqual([
      '06:10',
      '07:00',
      '08:00',
    ]);
    expect(useSaveStore.getState().saveUnits[`routine:${routine.id}`]?.dirty).toBe(true);
  });

  it('flags a new ordinary day until it has a condition, and previews which day wins', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add ordinary day' }));
    fireEvent.click(screen.getByText('Day with fixed goals'));
    expect(current().variants.map((entry) => entry.id)).toEqual(['day', 'default']);
    expect(screen.getByText('1 to fix')).toBeTruthy();

    act(() =>
      useEditorStore.getState().updateRoutine(routine.id, {
        variants: [
          { ...current().variants[0], condition: 'Weather.IsRaining()' },
          current().variants[1],
        ],
      }),
    );
    expect(screen.getByText('Valid')).toBeTruthy();

    fireEvent.click(
      within(screen.getByText('Which day wins?').closest('div')!.parentElement!).getByRole(
        'checkbox',
      ),
    );
    expect(screen.getByText('default is chosen.')).toBeTruthy();
    fireEvent.click(screen.getByText('Weather.IsRaining()', { selector: 'p' }));
    expect(screen.getByText('day is chosen.')).toBeTruthy();
  });
});
