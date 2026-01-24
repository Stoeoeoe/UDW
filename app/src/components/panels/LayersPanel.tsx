import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import clsx from 'clsx';

// Icon helpers
const EyeOpen = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" /><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" /></svg>;
const EyeClosed = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" /><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" /><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" /></svg>;
const Lock = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM5 8h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /></svg>;

export const LayersPanel: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const selectedLayerId = useEditorStore(state => state.selectedLayerId);
    const selectLayer = useEditorStore(state => state.selectLayer);
    const toggleVisibility = useEditorStore(state => state.toggleLayerVisibility);

    // If no map loaded, show placeholder
    if (!currentMap) {
        return (
            <div className="p-4 text-xs text-neutral-500 italic text-center mt-10">
                No map active.
            </div>
        )
    }

    // Reverse layers to show top-on-top visually
    const layers = [...currentMap.layers].reverse();

    return (
        <div className="flex flex-col h-full bg-neutral-900 text-neutral-300">
            {/* Header */}
            <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Layers</h2>
                <button className="text-neutral-500 hover:text-white">+</button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {layers.map(layer => (
                    <div
                        key={layer.id}
                        onClick={() => selectLayer(layer.id)}
                        className={clsx(
                            "group flex items-center px-3 py-2 text-sm cursor-pointer border-l-2 transition-colors",
                            layer.id === selectedLayerId
                                ? "bg-neutral-800 border-blue-500 text-white"
                                : "border-transparent hover:bg-neutral-800/50"
                        )}
                    >
                        {/* Visibility Toggle */}
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
                            className={clsx(
                                "mr-3 flex-shrink-0 hover:text-white focus:outline-none",
                                layer.visible ? "text-neutral-400" : "text-neutral-600"
                            )}
                        >
                            {layer.visible ? <EyeOpen /> : <EyeClosed />}
                        </button>

                        {/* Name */}
                        <span className={clsx("flex-1 truncate select-none", !layer.visible && "text-neutral-500")}>
                            {layer.name}
                        </span>

                        {/* Icons */}
                        <div className="flex space-x-2 text-neutral-500">
                            {layer.locked && <Lock />}
                            <span className="text-[10px] uppercase font-mono bg-neutral-800 px-1 rounded text-neutral-600">
                                {layer.kind[0]}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
