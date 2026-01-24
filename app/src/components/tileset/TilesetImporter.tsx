import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import clsx from 'clsx';
import { Tileset } from '../../types/schema';

interface TilesetImporterProps {
    onSave: (tilesetConfig: Tileset, file: File) => void;
    onCancel: () => void;
}

const schema = z.object({
    id: z.string().min(2, "ID is required").regex(/^[a-z0-9-_]+$/, "ID must be kebab-case (lowercase, numbers, dashes)"),
    name: z.string().min(2, "Name is required"),
    tileWidth: z.number().min(8).max(128),
    tileHeight: z.number().min(8).max(128),
    // File validation is handled manually for now as input[type=file] is tricky in RHF
});

type FormData = z.infer<typeof schema>;

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

export const TilesetImporter: React.FC<TilesetImporterProps> = ({ onSave, onCancel }) => {
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tileWidth: 16,
            tileHeight: 16
        }
    });

    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const onSubmit = (data: FormData) => {
        if (!selectedFile) {
            alert("Please select a sprite sheet image.");
            return;
        }

        // Construct complete Tileset object (minus the image data which is handled separately)
        // Note: columns/count will be calculated by the store upon loading the image
        const newTileset: Tileset = {
            version: 1,
            id: data.id,
            name: data.name,
            spriteSheet: `assets/${selectedFile.name}`, // Virtual path
            tileWidth: data.tileWidth,
            tileHeight: data.tileHeight,
            columns: 0, // Placeholder
            tileCount: 0, // Placeholder
            tiles: []
        };

        onSave(newTileset, selectedFile);
    };

    return (
        <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-[500px] overflow-hidden text-neutral-300 flex flex-col max-h-[90vh]">
            <div className="bg-neutral-800 px-4 py-3 border-b border-neutral-700">
                <h3 className="font-bold text-neutral-100">Import Tileset</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <form id="tileset-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                    <div className="grid grid-cols-2 gap-4">
                        <InputField
                            label="Tileset ID"
                            placeholder="e.g. dungeon-base"
                            {...register('id')}
                            error={errors.id?.message}
                        />
                        <InputField
                            label="Display Name"
                            placeholder="e.g. Dungeon Base"
                            {...register('name')}
                            error={errors.name?.message}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <InputField
                            type="number"
                            label="Tile Width"
                            {...register('tileWidth', { valueAsNumber: true })}
                            error={errors.tileWidth?.message}
                        />
                        <InputField
                            type="number"
                            label="Tile Height"
                            {...register('tileHeight', { valueAsNumber: true })}
                            error={errors.tileHeight?.message}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase text-neutral-500">Sprite Sheet (PNG)</label>
                        <div className="border-2 border-dashed border-neutral-700 rounded-lg p-4 text-center hover:bg-neutral-800 transition-colors relative">
                            <input
                                type="file"
                                accept="image/png"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="text-sm text-neutral-400">
                                {selectedFile ? selectedFile.name : "Click or drag to upload PNG"}
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    {previewUrl && (
                        <div className="border border-neutral-700 rounded bg-neutral-950 p-2 overflow-auto max-h-48 flex justify-center">
                            <img src={previewUrl} alt="Preview" className="max-w-full object-contain image-pixelated" />
                        </div>
                    )}
                </form>
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t border-neutral-800 bg-neutral-900">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 rounded text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    form="tileset-form"
                    className="px-4 py-2 rounded text-sm font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!selectedFile}
                >
                    Import
                </button>
            </div>
        </div>
    );
};
