import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';

export const PropertiesPanel: React.FC = () => {
    const selectedEntityIds = useEditorStore(state => state.selectedEntityIds);
    const currentMap = useEditorStore(state => state.currentMap);

    // Derived selection logic
    const selectionCount = selectedEntityIds.size;
    const singleSelectedEntity = selectionCount === 1
        ? currentMap?.entities.find(e => e.id === Array.from(selectedEntityIds)[0])
        : null;

    return (
        <div className="flex flex-col h-full bg-neutral-900 text-neutral-300">
            {/* Header */}
            <div className="p-3 border-b border-neutral-800">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Properties</h2>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1">

                {/* Scenario: Nothing Selected */}
                {selectionCount === 0 && (
                    <div className="text-center mt-10 space-y-2">
                        <div className="text-neutral-600">No selection</div>
                        <div className="text-xs text-neutral-500">Select an entity or tile to view properties</div>
                    </div>
                )}

                {/* Scenario: Single Entity Selected */}
                {singleSelectedEntity && (
                    <div className="space-y-4">
                        {/* Header Info */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">ID</label>
                            <div className="bg-neutral-800 px-2 py-1.5 rounded text-sm text-neutral-200 font-mono select-all">
                                {singleSelectedEntity.id}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Type</label>
                            <div className="text-sm text-blue-400 font-medium">
                                {singleSelectedEntity.typeId}
                            </div>
                        </div>

                        <hr className="border-neutral-800" />

                        {/* Properties (Dynamic) */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-neutral-500 uppercase mb-2">Custom Properties</h3>
                            {/* Placeholder for dynamic property loop */}
                            {Object.entries(singleSelectedEntity.properties).map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                    <label className="text-xs text-neutral-400">{key}</label>
                                    <input
                                        type="text"
                                        value={String(value)}
                                        readOnly // Read-only until we implement updates
                                        className="w-full bg-neutral-800 border-none rounded px-2 py-1 text-sm text-neutral-300 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
