using Core.Tile;
using MoreMountains.Tools;

namespace Interaction.Pointer
{
    public struct TileDataUnderPointerChangedEvent
    {
        public TileData TileData;

        private static TileDataUnderPointerChangedEvent e;

        public static void Trigger(TileData tileData)
        {
            e.TileData = tileData;
            MMEventManager.TriggerEvent(e);
        }
    }
}