import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Project } from '../../types/schema';
import clsx from 'clsx';

interface ProjectSettingsEditorProps {
    initialProject?: Project;
    onSave: (project: Project) => void;
    onCancel: () => void;
}

const DEFAULT_PROJECT: Project = {
    version: 1,
    name: "New Project",
    tileSize: 16,
    defaultMapWidth: 32,
    defaultMapHeight: 32,
    metadata: {
        author: "",
        description: ""
    }
};

// Validation Schema using Zod
const schema = z.object({
    version: z.number(), // Added version to match type
    name: z.string().min(2, "Name must be at least 2 characters"),
    tileSize: z.number().min(8, "Minimum tile size is 8px").max(128, "Max tile size is 128px")
        .refine(val => val ? (val & (val - 1)) === 0 : true, { message: 'Tile size should ideally be power of 2 (e.g. 16, 32)' }),
    defaultMapWidth: z.number().min(1).max(1024),
    defaultMapHeight: z.number().min(1).max(1024),
    metadata: z.object({
        author: z.string().optional(),
        description: z.string().optional()
    }).optional()
});

// Input Helper
const InputField = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string, error?: string }) => (
    <div className="space-y-1">
        <label className="text-xs font-bold uppercase text-neutral-500">{label}</label>
        <input
            className={clsx(
                "w-full bg-neutral-950 border rounded px-3 py-2 text-sm focus:outline-none",
                error
                    ? "border-red-500 focus:border-red-500"
                    : "border-neutral-700 focus:border-blue-500"
            )}
            {...props}
        />
        {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
);

export const ProjectSettingsEditor: React.FC<ProjectSettingsEditorProps> = ({
    initialProject,
    onSave,
    onCancel
}) => {
    const { register, handleSubmit, formState: { errors } } = useForm<Project>({
        resolver: zodResolver(schema),
        defaultValues: initialProject || DEFAULT_PROJECT
    });

    const onSubmit = (data: Project) => {
        onSave({
            ...data,
            version: initialProject?.version || 1 // Preserve version or default
        });
    };

    return (
        <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-[500px] overflow-hidden text-neutral-300">
            <div className="bg-neutral-800 px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h3 className="font-bold text-neutral-100">Project Settings</h3>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">

                {/* Project Name */}
                <InputField
                    label="Project Name"
                    {...register('name')}
                    error={errors.name?.message}
                />

                <div className="grid grid-cols-2 gap-4">
                    <InputField
                        type="number"
                        label="Tile Size (px)"
                        {...register('tileSize')}
                        error={errors.tileSize?.message}
                    />

                    {/* Version (Read-only) */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase text-neutral-500">Version</label>
                        <input
                            type="number"
                            disabled
                            className="w-full bg-neutral-800 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-500 cursor-not-allowed"
                            value={initialProject?.version || 1}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <InputField
                        type="number"
                        label="Default Width"
                        {...register('defaultMapWidth')}
                        error={errors.defaultMapWidth?.message}
                    />
                    <InputField
                        type="number"
                        label="Default Height"
                        {...register('defaultMapHeight')}
                        error={errors.defaultMapHeight?.message}
                    />
                </div>

                <hr className="border-neutral-800" />

                {/* Metadata */}
                <div className="space-y-3">
                    <InputField
                        label="Author"
                        {...register('metadata.author')}
                        error={errors.metadata?.author?.message}
                    />
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase text-neutral-500">Description</label>
                        <textarea
                            rows={3}
                            className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                            {...register('metadata.description')}
                        />
                    </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-800">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 rounded text-sm font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm"
                    >
                        Save Project
                    </button>
                </div>

            </form>
        </div>
    );
};
