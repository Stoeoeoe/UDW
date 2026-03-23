using Core.Events;
using Core.Inventory;

namespace Character
{
    /// <summary>
    /// Triggered when a character spawns.
    /// </summary>
    public struct CharacterSpawnEvent
    {
        public GameCharacter Character;

        public static void Trigger(GameCharacter character)
            => EventBus<CharacterSpawnEvent>.Raise(new CharacterSpawnEvent { Character = character });
    }
}