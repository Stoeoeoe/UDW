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
    expect(getResourceDefinition('actors', 'villager.actor.json')?.kind).toBe('actor');
    expect(getResourceDefinition('dialogues', 'intro.runtime.dialogue.json')?.kind).toBe(
      'dialogue-runtime',
    );
    expect(getResourceDefinition('dialogues', 'intro.i18n.json')?.kind).toBe('dialogue-i18n');
    expect(getResourceDefinition('actors', 'notes.json')).toBeUndefined();
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
    expect(resourceFilename('actor', 'base:myactor')).toBe('myactor.actor.json');
    expect(resourceFilename('actor', 'other:myactor')).toBe('other~myactor.actor.json');
    expect(resourceFilename('project', 'my-project')).toBe('my-project.vproj');
  });

  it('does not treat unrelated field names or user property values as references', () => {
    const actor = {
      id: 'base:villager',
      speaker: 'Display Name',
      typeId: 'UnrelatedType',
      data: ['Arbitrary:Text'],
      properties: { id: 'UserId', actorId: 'CustomValue' },
    };
    expect(normalizeResourceDocument(actor, 'actor')).toEqual({ ...actor, id: 'base:villager' });
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
    for (const resource of ['actor', 'npc', 'item', 'entity-type', 'map', 'tileset', 'dialogue']) {
      const schema = JSON.parse(
        readFileSync(resolve(process.cwd(), '../schemas', `${resource}.schema.json`), 'utf8'),
      );
      const pattern = new RegExp(schema.properties.id.pattern);
      expect(pattern.test('base:myactor'), resource).toBe(true);
      expect(pattern.test('mymod:myactor'), resource).toBe(true);
      expect(pattern.test('myactor'), resource).toBe(false);
      expect(pattern.test('base:MyActor'), resource).toBe(false);
      expect(pattern.test('base:base:myactor'), resource).toBe(false);
    }
  });
  it('preserves explicit project and foreign resource namespaces', () => {
    expect(normalizeProject({ id: 'game', idPrefix: 'mod' } as Project)).toMatchObject({
      id: 'game',
      idPrefix: 'mod',
    });
    expect(qualifyResourceId('Other:MyActor', 'mod')).toBe('other:myactor');
    expect(qualifyResourceId('base:myactor')).toBe('base:myactor');
    expect(() => qualifyResourceId('base:base:actor')).toThrow();
    expect(() => qualifyResourceId('../actor')).toThrow();
  });

  it('preserves qualified resource references, local nodes and authored content', () => {
    const original = {
      id: 'base:intro',
      startNodeId: 'linea',
      nodes: [
        {
          id: 'linea',
          type: 'line',
          speaker: 'base:myactor',
          text: 'MyActor',
          msgKey: 'Intro.LineA',
          next: 'jumpb',
        },
        {
          id: 'jumpb',
          type: 'jump',
          targetDialogueId: 'other:intro',
          targetNodeId: 'linea',
          lua: 'find("MyActor")',
        },
      ],
      properties: { actorId: 'UserValue' },
      sprite: { path: 'Assets/MyActor.png' },
    };
    const migrated = normalizeResourceDocument(original, 'dialogue');
    expect(migrated).toMatchObject({
      id: 'base:intro',
      startNodeId: 'linea',
      nodes: [
        {
          id: 'linea',
          speaker: 'base:myactor',
          text: 'MyActor',
          msgKey: 'Intro.LineA',
          next: 'jumpb',
        },
        {
          id: 'jumpb',
          targetDialogueId: 'other:intro',
          targetNodeId: 'linea',
          lua: 'find("MyActor")',
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
    expect(resourceIdToFileStem('base:myactor')).toBe('myactor');
    expect(resourceIdToFileStem('mod:myactor')).toBe('mod~myactor');
    expect(resourceIdToFileStem('base:con')).toBe('~con');
    expect(() => resourceIdToFileStem('base:actor.')).toThrow();
  });

  it('round trips qualified tile references', () => {
    const refs = ['base:terrain', 'mod:terrain'];
    expect(decodeTileRef(encodeTileRef('mod:terrain:12', refs), refs)).toBe('mod:terrain:12');
  });
});
