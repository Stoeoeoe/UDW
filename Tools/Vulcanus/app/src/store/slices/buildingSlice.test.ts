import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { useSaveStore } from '../../lib/saveManager';
import { fileSystem } from '../../lib/fileSystem';
import { newBuilding } from '../../lib/buildings/newBuilding';
import { normalizeResourceDocument } from '../../lib/resourceRegistry';
import type { Building, BuildingKit } from '../../types/building';

vi.mock('../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/fileSystem')>();
  return {
    ...original,
    fileSystem: { ...original.fileSystem, saveJson: vi.fn(async () => {}), deleteJson: vi.fn() },
  };
});

const building: Building = newBuilding('base:farmhouse', 'Farmhouse', '', 'base:roman_basic');
const kit: BuildingKit = {
  formatVersion: 1,
  id: 'base:roman_basic',
  name: 'Roman basic',
  source: 'assets/kits/kit_roman_basic.png',
  variations: { winter: 'assets/kits/kit_roman_basic_winter.png' },
};
const unit = `building:${building.id}`;
const isDirty = () => useSaveStore.getState().saveUnits[unit]?.dirty ?? false;

describe('building store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fileSystem.saveJson).mockClear();
    vi.mocked(fileSystem.deleteJson).mockClear();
    useSaveStore.getState().reset();
    useEditorStore.setState({
      buildings: [building],
      savedBuildings: { [building.id]: building },
      buildingPast: {},
      buildingFuture: {},
      buildingKits: [kit],
      savedBuildingKits: { [kit.id]: kit },
      buildingKitPast: {},
      buildingKitFuture: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps edits unsaved until saved, then writes the building file', async () => {
    useEditorStore.getState().updateBuilding(building.id, { width: 11 });
    expect(isDirty()).toBe(true);

    await useEditorStore.getState().saveBuilding(building.id);

    const [folder, file, data] = vi.mocked(fileSystem.saveJson).mock.calls[0];
    expect(folder).toBe('buildings');
    expect(file).toBe('base:farmhouse.building.json');
    expect(data).toMatchObject({
      id: building.id,
      width: 11,
      $schema: expect.stringContaining('building.schema.json'),
    });
    expect(isDirty()).toBe(false);
  });

  it('undoes, redoes and discards edits', () => {
    const store = useEditorStore.getState();
    store.updateBuilding(building.id, { name: 'Barn' });
    store.undoBuilding(building.id);
    expect(useEditorStore.getState().buildings[0].name).toBe('Farmhouse');
    expect(isDirty()).toBe(false);

    store.redoBuilding(building.id);
    expect(useEditorStore.getState().buildings[0].name).toBe('Barn');
    store.discardBuilding(building.id);
    expect(useEditorStore.getState().buildings[0].name).toBe('Farmhouse');
  });

  it('refuses to write a building or kit without a name, and a kit without a sheet', async () => {
    const store = useEditorStore.getState();
    store.updateBuilding(building.id, { name: ' ' });
    await store.saveBuilding(building.id);
    store.updateBuildingKit(kit.id, { source: '' });
    await store.saveBuildingKit(kit.id);

    expect(fileSystem.saveJson).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[unit]?.status).toBe('error');
    expect(useSaveStore.getState().saveUnits[`building-kit:${kit.id}`]?.error).toBe(
      'The kit needs a base sheet.',
    );
  });

  it('writes kits to kits/ and deletes the files of removed resources', async () => {
    const store = useEditorStore.getState();
    store.updateBuildingKit(kit.id, { name: 'Roman' });
    await store.saveBuildingKit(kit.id);
    expect(vi.mocked(fileSystem.saveJson).mock.calls[0].slice(0, 2)).toEqual([
      'kits',
      'base:roman_basic.kit.json',
    ]);

    await store.deleteBuilding(building.id);
    expect(fileSystem.deleteJson).toHaveBeenCalledWith('buildings', 'base:farmhouse.building.json');
    expect(useEditorStore.getState().buildings).toEqual([]);
  });

  it('qualifies IDs on normalization and keeps room and opening IDs local', () => {
    const normalized = normalizeResourceDocument(
      { ...building, id: 'farmhouse', kit: 'roman_basic', interiorMapId: 'farmhouse_interior' },
      'building',
      'mymod',
    );
    expect(normalized).toMatchObject({
      id: 'mymod:farmhouse',
      kit: 'mymod:roman_basic',
      interiorMapId: 'mymod:farmhouse_interior',
    });
    expect(normalized.rooms[0].id).toBe('room-1');
    expect(normalized.openings[0].id).toBe('entrance');
  });
});

describe('new building', () => {
  it('is a 9 × 7 shell with one room and an entrance in the south wall', () => {
    expect(newBuilding('base:hut', 'Hut', 'village')).toMatchObject({
      width: 9,
      depth: 7,
      kit: '',
      folderPath: 'village',
      rooms: [{ id: 'room-1', at: { x: 1, y: 1 } }],
      openings: [{ id: 'entrance', kind: 'door', x: 4, y: 6 }],
    });
  });
});
