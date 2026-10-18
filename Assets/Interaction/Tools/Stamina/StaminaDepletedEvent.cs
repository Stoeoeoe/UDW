using Core.Events;
using Character;

namespace Interaction.Tools.Stamina
{
    /// <summary>Raised when consumption exhausts a character's remaining stamina.</summary>
    public readonly struct StaminaDepletedEvent
    {
        public readonly GameCharacter Character;

        public StaminaDepletedEvent(GameCharacter character) => Character = character;

        public static void Trigger(GameCharacter character)
            => EventBus<StaminaDepletedEvent>.Raise(new StaminaDepletedEvent(character));
    }
}
