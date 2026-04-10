import { EntityType } from '../types/schema';

export const DEFAULT_ENTITY_TYPES: EntityType[] = [
  {
    id: 'player_spawn',
    category: 'spawn',
    displayName: 'Player Spawn',
    description: 'Where the player starts the map',
    placeholderColor: '#3182ce', // blue.500
    defaultSize: [1, 1],
    properties: [
      {
        key: 'facing',
        label: 'Initial Facing',
        type: 'enum',
        defaultValue: 'south',
        required: true,
        constraints: {
          options: ['north', 'south', 'east', 'west'],
        },
      },
    ],
  },
  {
    id: 'npc_spawn',
    category: 'spawn',
    displayName: 'Actor Spawn',
    description: 'Placement for an actor',
    placeholderColor: '#805ad5', // purple.500
    defaultSize: [1, 1],
    properties: [
      {
        key: 'npcId',
        label: 'Actor ID',
        type: 'string',
        defaultValue: 'villager_1',
        required: true,
      },
      {
        key: 'schedule',
        label: 'Schedule ID',
        type: 'string',
        defaultValue: '',
        required: false,
      },
    ],
  },
  {
    id: 'chest',
    category: 'object',
    displayName: 'Chest',
    description: 'Lootable container',
    placeholderColor: '#d69e2e', // yellow.600
    defaultSize: [1, 1],
    properties: [
      {
        key: 'lootTable',
        label: 'Loot Table',
        type: 'string',
        defaultValue: 'default_loot',
        required: true,
      },
      {
        key: 'locked',
        label: 'Locked',
        type: 'boolean',
        defaultValue: false,
        required: true,
      },
    ],
  },
  {
    id: 'transition',
    category: 'transition',
    displayName: 'Map Transition',
    description: 'Travel to another map',
    placeholderColor: '#e53e3e', // red.500
    defaultSize: [1, 1],
    properties: [
      {
        key: 'targetMap',
        label: 'Target Map ID',
        type: 'string',
        defaultValue: '',
        required: true,
      },
      {
        key: 'targetSpawnId',
        label: 'Target Spawn ID',
        type: 'string',
        defaultValue: 'entrance',
        required: true,
      },
    ],
  },
];
