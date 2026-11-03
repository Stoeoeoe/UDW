using VContainer;
using Character;
using Core.Context;
using Input;

namespace Character.Abilities
{
    /// <summary>Accepts the player's exit request while ordinary abilities are blocked by occupation.</summary>
    public sealed class CharacterOccupationAbility : CharacterAbility
    {
        [Inject] private PlayerInteractionContext _playerInteractionContext;
        [Inject] private Input.InputManager _inputManager;

        public override void Tick()
        {
            var occupation = Character.Occupation;
            if (!occupation.IsOccupied || Character.IsConditionOrControlBlocked) return;
            if (!_playerInteractionContext.CurrentSnapshot.CanInteractWithWorld) return;
            var input = _inputManager;
            if (input.InteractPressed || input.PerformPrimaryActionDown)
                occupation.TryExit();
        }
    }
}
