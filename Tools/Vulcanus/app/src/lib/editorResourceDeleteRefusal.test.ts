import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/useEditorStore';
import { farmhouse } from './buildings/farmhouse.fixture';
import { createEditorResourceDocument, editorResourceDeleteRefusal } from './editorResourceTypes';

const kit = { formatVersion: 1 as const, id: 'test:kit', name: 'Kit', source: 'kit.png' };
const kitDocument = () =>
  createEditorResourceDocument({ type: 'building-kit', id: kit.id, name: kit.name });

describe('deleting a kit', () => {
  beforeEach(() => useEditorStore.setState({ buildingKits: [kit], buildings: [] }));

  it('is refused while buildings use it, naming them', () => {
    useEditorStore.setState({ buildings: [farmhouse()] });
    expect(editorResourceDeleteRefusal(kitDocument())).toBe(
      'The kit is used by Farmhouse. Choose another kit for them first.',
    );
  });

  it('is allowed once no building uses it', () => {
    expect(editorResourceDeleteRefusal(kitDocument())).toBeNull();
  });
});
