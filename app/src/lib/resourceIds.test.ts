import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qualifyResourceId, resourceIdToFileStem } from './resourceIds';
import {
  normalizeProject,
  normalizeResourceDocument,
  resourceRegistry,
  resourceFilename,
  resourceSchemaPath,
  getResourceDefinition,
} from './resourceRegistry';
import { decodeTileRef, encodeTileRef } from './tileRef';
import type { Project } from '../types/schema';

describe('resource namespaces', () => {
  it('uses document metadata for resource file types and dialogue exports', () => {
    expect(getResourceDefinition('items', 'food.vitm')?.kind).toBe('item');
    expect(getResourceDefinition('characters', 'villager.character.json')?.kind).toBe('character');
    expect(getResourceDefinition('dialogues', 'intro.runtime.dialogue.json')?.kind).toBe(
      'dialogue-runtime',
    );
    expect(getResourceDefinition('dialogues', 'intro.i18n.json')?.kind).toBe('dialogue-i18n');
    expect(getResourceDefinition('characters', 'notes.json')).toBeUndefined();
  });

  it('owns storage details while schemas contain only format validation', () => {
    for (const definition of Object.values(resourceRegistry)) {
      expect(getResourceDefinition(definition.folder, `example${definition.extension}`)?.kind).toBe(
        definition.kind,
      );
      expect(resourceSchemaPath(definition.kind)).toContain(definition.schemaFile);
      const schema = JSON.parse(
        readFileSync(resolve(process.cwd(), '../schemas', definition.schemaFile), 'utf8'),
      );
      expect(JSON.stringify(schema)).not.toContain('x-editor-');
    }
    expect(resourceFilename('character', 'base:mycharacter')).toBe('mycharacter.character.json');
    expect(resourceFilename('character', 'other:mycharacter')).toBe(
      'other~mycharacter.character.json',
    );
    expect(resourceFilename('project', 'my-project')).toBe('my-project.vproj');
  });

  it('resolves every schema reference inside the exported project schemas folder', () => {
    const projectRoot = resolve(process.cwd(), 'test-project');
    for (const definition of Object.values(resourceRegistry)) {
      expect(resolve(projectRoot, definition.folder, resourceSchemaPath(definition.kind))).toBe(
        resolve(projectRoot, 'schemas', definition.schemaFile),
      );
    }
    expect(resourceSchemaPath('character')).toBe('../schemas/character.schema.json');
    expect(resourceSchemaPath('project')).toBe('schemas/project.schema.json');
  });

  it('does not treat unrelated field names or user property values as references', () => {
    const character = {
      id: 'base:villager',
      speaker: 'Display Name',
      typeId: 'UnrelatedType',
      data: ['Arbitrary:Text'],
      properties: { id: 'UserId', characterId: 'CustomValue' },
    };
    expect(normalizeResourceDocument(character, 'character')).toEqual({
      ...character,
      id: 'base:villager',
    });
    const map = {
      id: 'base:map',
      entities: [
        {
          id: 'instance',
          layerId: 'ground',
          typeId: 'base:villager',
          properties: { speaker: 'Display Name' },
        },
      ],
    };
    expect(normalizeResourceDocument(map, 'location')).toMatchObject({
      entities: [
        {
          id: 'instance',
          layerId: 'ground',
          typeId: 'base:villager',
          properties: map.entities[0].properties,
        },
      ],
    });
  });

  it('keeps resource schema constraints consistent with editor ID validation', () => {
    for (const resource of [
      'character',
      'npc',
      'item',
      'entity-type',
      'map',
      'tileset',
      'dialogue',
    ]) {
      const schema = JSON.parse(
        readFileSync(resolve(process.cwd(), '../schemas', `${resource}.schema.json`), 'utf8'),
      );
      const pattern = new RegExp(schema.properties.id.pattern);
      expect(pattern.test('base:mycharacter'), resource).toBe(true);
      expect(pattern.test('mymod:mycharacter'), resource).toBe(true);
      expect(pattern.test('mycharacter'), resource).toBe(false);
      expect(pattern.test('base:MyCharacter'), resource).toBe(false);
      expect(pattern.test('base:base:mycharacter'), resource).toBe(false);
    }
  });
  it('preserves explicit project and foreign resource namespaces', () => {
    expect(normalizeProject({ id: 'game', idPrefix: 'mod' } as Project)).toMatchObject({
      id: 'game',
      idPrefix: 'mod',
    });
    expect(qualifyResourceId('Other:MyCharacter', 'mod')).toBe('other:mycharacter');
    expect(qualifyResourceId('base:mycharacter')).toBe('base:mycharacter');
    expect(() => qualifyResourceId('base:base:character')).toThrow();
    expect(() => qualifyResourceId('../character')).toThrow();
  });

  it('preserves qualified resource references, local nodes and authored content', () => {
    const original = {
      id: 'base:intro',
      startNodeId: 'linea',
      nodes: [
        {
          id: 'linea',
          type: 'line',
          speaker: 'base:mycharacter',
          text: 'MyCharacter',
          msgKey: 'Intro.LineA',
          next: 'jumpb',
        },
        {
          id: 'jumpb',
          type: 'jump',
          targetDialogueId: 'other:intro',
          targetNodeId: 'linea',
          lua: 'find("MyCharacter")',
        },
      ],
      properties: { characterId: 'UserValue' },
      sprite: { path: 'Assets/MyCharacter.png' },
    };
    const migrated = normalizeResourceDocument(original, 'dialogue');
    expect(migrated).toMatchObject({
      id: 'base:intro',
      startNodeId: 'linea',
      nodes: [
        {
          id: 'linea',
          speaker: 'base:mycharacter',
          text: 'MyCharacter',
          msgKey: 'Intro.LineA',
          next: 'jumpb',
        },
        {
          id: 'jumpb',
          targetDialogueId: 'other:intro',
          targetNodeId: 'linea',
          lua: 'find("MyCharacter")',
        },
      ],
      properties: original.properties,
      sprite: original.sprite,
    });
    expect(original.id).toBe('base:intro');
    expect(normalizeResourceDocument(migrated, 'dialogue')).toEqual(migrated);
  });

  it('keeps terrain and variation references consistent', () => {
    expect(
      normalizeResourceDocument(
        {
          id: 'base:map',
          baseTilesetId: 'base:terrain',
          tilesetRefs: ['base:terrain'],
          layers: [{ id: 'ground', terrainData: [['grass']], terrainPalette: ['grass'] }],
          variations: [
            {
              id: 'winter',
              tilesetSuffix: '_winter',
              layerOverrides: { ground: { data: [['base:terrain:3']] } },
              metadata: { baseTilesetIdOverride: 'other:terrain', descriptionOverride: 'Grass' },
            },
          ],
        },
        'location',
      ),
    ).toMatchObject({
      id: 'base:map',
      baseTilesetId: 'base:terrain',
      tilesetRefs: ['base:terrain'],
      layers: [{ id: 'ground', terrainData: [['grass']], terrainPalette: ['grass'] }],
      variations: [
        {
          id: 'winter',
          tilesetSuffix: '_winter',
          layerOverrides: { ground: { data: [['base:terrain:3']] } },
          metadata: { baseTilesetIdOverride: 'other:terrain', descriptionOverride: 'Grass' },
        },
      ],
    });
  });

  it('rejects collisions caused by lowercasing local IDs', () => {
    expect(() =>
      normalizeResourceDocument(
        {
          id: 'Intro',
          nodes: [
            { id: 'Line', type: 'line' },
            { id: 'line', type: 'line' },
          ],
        },
        'dialogue',
      ),
    ).toThrow('Duplicate ID');
  });

  it('uses distinct Windows-compatible filenames for separate namespaces', () => {
    expect(resourceIdToFileStem('base:mycharacter')).toBe('mycharacter');
    expect(resourceIdToFileStem('mod:mycharacter')).toBe('mod~mycharacter');
    expect(resourceIdToFileStem('base:con')).toBe('~con');
    expect(() => resourceIdToFileStem('base:character.')).toThrow();
  });

  it('round trips qualified tile references', () => {
    const refs = ['base:terrain', 'mod:terrain'];
    expect(decodeTileRef(encodeTileRef('mod:terrain:12', refs), refs)).toBe('mod:terrain:12');
  });
});
