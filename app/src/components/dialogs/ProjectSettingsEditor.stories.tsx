import type { Meta, StoryObj } from '@storybook/react';
import { ProjectSettingsEditor } from './ProjectSettingsEditor';

const meta: Meta<typeof ProjectSettingsEditor> = {
    title: 'Dialogs/ProjectSettingsEditor',
    component: ProjectSettingsEditor,
    parameters: {
        layout: 'centered',
    },
};

export default meta;
type Story = StoryObj<typeof ProjectSettingsEditor>;

export const NewProject: Story = {
    args: {
        onSave: (p) => console.log('Save', p),
        onCancel: () => console.log('Cancel'),
    },
};

export const EditExisting: Story = {
    args: {
        initialProject: {
            version: 1,
            name: "Stardew Clone",
            tileSize: 32,
            defaultMapWidth: 50,
            defaultMapHeight: 50,
            metadata: {
                author: "Concerned Ape",
                description: "A farming simulation game."
            }
        },
        onSave: (p) => console.log('Save', p),
        onCancel: () => console.log('Cancel'),
    },
};
