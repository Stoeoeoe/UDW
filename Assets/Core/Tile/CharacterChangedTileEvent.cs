using Character;
using MoreMountains.Tools;

namespace Core.Tile
{
    public struct CharacterChangedTileEvent
    {
        public TileData TileData;
        public UrCharacter Character;

        static CharacterChangedTileEvent e;
        public static void Trigger(TileData tileData, UrCharacter character )
        {
            e.TileData = tileData;
            e.Character = character;
            MMEventManager.TriggerEvent(e);
        }
    }
}