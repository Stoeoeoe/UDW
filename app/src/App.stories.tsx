import type { Meta, StoryObj } from '@storybook/react';
import App from '../App';
import { Map, LayerKind } from '../types/schema';

const meta: Meta<typeof App> = {
    title: 'App/FullEditor',
    component: App,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof App>;

// --- MOCK DATA ---

const MOCK_MAP: Map = {
    version: 1,
    id: "story_map_01",
    name: "Town Start",
    width: 20,
    height: 15,
    baseTilesetId: "town",
    layers: [
        {
            id: "l1", name: "Ground", kind: "visual" as LayerKind, visible: true, locked: false, opacity: 1, zOrder: 0,
            data: Array(15).fill(Array(20).fill("grass_01"))
        },
        {
            id: "l2", name: "Decoration", kind: "visual" as LayerKind, visible: true, locked: false, opacity: 1, zOrder: 1,
            data: []
        },
        {
            id: "l3", name: "Collision", kind: "collision" as LayerKind, visible: false, locked: true, opacity: 0.5, zOrder: 2,
            data: []
        }
    ],
    entities: [
        { id: "e1", typeId: "chest", position: [5, 5], properties: { locked: true } },
        { id: "e2", typeId: "door", position: [10, 8], properties: { targetMap: "dungeon" } }
    ]
};

// --- STORIES ---

export const EmptyState: Story = {};

export const WithMapLoaded: Story = {
    parameters: {
        store: {
            currentMap: MOCK_MAP,
            camera: { x: 100, y: 50, zoom: 2.0 },
            selectedLayerId: "l1",
            selectedEntityIds: new Set(["e1"])
        }
    }
};
