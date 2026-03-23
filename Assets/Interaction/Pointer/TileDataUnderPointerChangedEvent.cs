using Core.Events;
using Core.Tile;

namespace Interaction.Pointer
{
    public struct TileDataUnderPointerChangedEvent
    {
        public TileData TileData;

        public static void Trigger(TileData tileData)
            => EventBus<TileDataUnderPointerChangedEvent>.Raise(new TileDataUnderPointerChangedEvent { TileData = tileData });
    }
}