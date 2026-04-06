using Character;
using Core.Events;

namespace Core.Tile
{
    public struct CharacterChangedTileEvent
    {
        public TileData TileData;
        public GameCharacter Character;

        public static void Trigger(TileData tileData, GameCharacter character)
            => EventBus<CharacterChangedTileEvent>.Raise(new CharacterChangedTileEvent { TileData = tileData, Character = character });
    }
}