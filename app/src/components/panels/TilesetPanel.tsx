import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetImporter } from '../tileset/TilesetImporter';
import { Tileset, TileDefinition } from '../../types/schema';
import clsx from 'clsx';
import { fileSystem } from '../../lib/fileSystem';

export const TilesetPanel: React.FC = () => {
    const tilesets = useEditorStore(state => state.tilesets);
    const loadedSprites = useEditorStore(state => state.loadedSprites);
    const selectedTileId = useEditorStore(state => state.selectedTileId);
    const selectTile = useEditorStore(state => state.selectTile);
    const loadSprite = useEditorStore(state => state.loadSprite);

    // Actions needed from store (we need a way to addTileset)
    // We'll add it to the component logic for now, but ideally it's a store action

    const [activeTilesetId, setActiveTilesetId] = useState<string | null>(
        tilesets.size > 0 ? Array.from(tilesets.keys())[0] : null
    );
    const [isImporterOpen, setIsImporterOpen] = useState(false);

    const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
    const activeSprite = activeTileset ? loadedSprites.get(activeTileset.spriteSheet) : null;

    // derived tiles list
    const tiles = useMemo(() => {
        if (!activeTileset) return [];
        return activeTileset.tiles;
    }, [activeTileset]);

    const handleImport = async (config: Tileset, file: File) => {
        try {
            // 1. Load Sprite to Store (and get URL)
            // Note: In a real app we'd save the file to disk here too via fileSystem
            await loadSprite(config.spriteSheet, file);

            // 2. Get image dimensions to calculate columns/count
            const img = useEditorStore.getState().loadedSprites.get(config.spriteSheet);
            if (!img) throw new Error("Failed to load sprite image");

            const columns = Math.floor(img.width / config.tileWidth);
            const rows = Math.floor(img.height / config.tileHeight);
            const tileCount = columns * rows;

            // 3. Generate default tiles
            const tiles: TileDefinition[] = [];
            for (let i = 0; i < tileCount; i++) {
                tiles.push({
                    id: `${config.id}_${i}`,
                    spriteIndex: i,
                    tags: [],
                    collision: 'none'
                });
            }

            const fullTileset: Tileset = {
                ...config,
                columns,
                tileCount,
                tiles
            };

            // 4. Add to Store (Need to ensure this action exists or use setState hack for prototype)
            useEditorStore.setState(state => {
                state.tilesets.set(fullTileset.id, fullTileset);
            });

            setActiveTilesetId(fullTileset.id);
            setIsImporterOpen(false);

        } catch (e) {
            console.error(e);
            alert("Failed to import tileset");
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-200 relative">
            {/* Header / Selector */}
            <div className="p-3 border-b border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tilesets</h2>
                    <button
                        className="text-slate-500 hover:text-white"
                        onClick={() => setIsImporterOpen(true)}
                    >
                        +
                    </button>
                </div>

                {tilesets.size > 0 && (
                    <select
                        className="w-full bg-slate-800 text-xs border border-slate-700 rounded px-2 py-1 focus:outline-none"
                        value={activeTilesetId || ''}
                        onChange={(e) => setActiveTilesetId(e.target.value)}
                    >
                        {Array.from(tilesets.values()).map(ts => (
                            <option key={ts.id} value={ts.id}>{ts.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Tiles Grid */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
                {!activeTileset && (
                    <div className="text-center text-xs text-slate-600 mt-10">
                        No tilesets loaded.
                    </div>
                )}

                {activeTileset && !activeSprite && (
                    <div className="text-center text-xs text-red-900 mt-10">
                        Image not found: {activeTileset.spriteSheet}
                    </div>
                )}

                {activeTileset && activeSprite && (
                    <div
                        className="grid gap-1"
                        style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(${activeTileset.tileWidth}px, 1fr))`
                        }}
                    >
                        {tiles.map(tile => {
                            // Calculate background position
                            const col = tile.spriteIndex % activeTileset.columns;
                            const row = Math.floor(tile.spriteIndex / activeTileset.columns);

                            return (
                                <button
                                    key={tile.id}
                                    title={tile.id}
                                    className={clsx(
                                        "relative group rounded-sm overflow-hidden border transition-all",
                                        selectedTileId === tile.id
                                            ? "border-blue-500 ring-1 ring-blue-500 z-10"
                                            : "border-transparent hover:border-slate-600"
                                    )}
                                    style={{
                                        width: activeTileset.tileWidth,
                                        height: activeTileset.tileHeight,
                                    }}
                                    onClick={() => selectTile(tile.id)}
                                >
                                    <div
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            backgroundImage: `url(${activeSprite.src})`,
                                            backgroundPosition: `-${col * activeTileset.tileWidth}px -${row * activeTileset.tileHeight}px`,
                                            imageRendering: 'pixelated'
                                        }}
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Importer Overlay */}
            {isImporterOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <TilesetImporter
                        onSave={handleImport}
                        onCancel={() => setIsImporterOpen(false)}
                    />
                </div>
            )}
        </div>
    );
};
